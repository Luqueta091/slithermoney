import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import {
  REALTIME_PROTOCOL_VERSION,
  type EliminatedPayload,
  type SnapshotPayload,
  type Vector2,
} from '@slithermoney/contracts';
import {
  SlitherEngine,
  type SlitherPelletEvent,
  type SlitherSnapshotPlayer,
} from '../../../game-server/src/modules/realtime/slither/engine';
import { resolveMultiplier } from '../../../game-server/src/modules/realtime/multiplier';
import { ActionButton } from '../components/ActionButton';
import { RunResultOverlay } from '../components/RunResultOverlay';
import { type RunStartResponse } from '../api/client';
import { formatCents } from '../utils/format';

type GameScreenProps = {
  run: RunStartResponse | null;
  onExit: () => void;
};

type SnakeEntry = {
  id: string;
  x: number;
  y: number;
  a: number;
  b: boolean;
  m: number;
  r: number;
  h: number;
  p: number[];
};

type PelletEntry = {
  id: string;
  idNum: number;
  x: number;
  y: number;
  r: number;
  v: number;
  h: number;
};

type RunResultState = {
  kind: 'cashout' | 'eliminated';
  stake: number | null;
  payout?: number | null;
  multiplier?: number | null;
  finalLength: number | null;
};

type CashoutPayload = {
  status?: string;
  multiplier?: number | string;
  payout?: number | string;
  payout_cents?: number | string;
  size_score?: number | string;
  length?: number | string;
  final_length?: number | string;
};

type EliminatedPayloadExtended = EliminatedPayload & {
  multiplier?: number | string;
  size_score?: number | string;
  length?: number | string;
  final_length?: number | string;
};

const PERF = {
  maxDpr: 1.5,
  leaderboardHz: 4,
};

const OFFLINE_MODE = true;
const OFFLINE_BOT_COUNT = 20;
const OFFLINE_TICK_RATE = 60;
const OFFLINE_INPUT_HZ = 60;

export function GameScreen({ run, onExit }: GameScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const inputIntervalRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameRef = useRef({
    last: 0,
    acc: 0,
    step: 1000 / 60,
  });
  const offlineEngineRef = useRef<SlitherEngine | null>(null);
  const offlineTickRef = useRef<number | null>(null);
  const offlineTickCountRef = useRef(0);
  const playerIdRef = useRef<string | null>(null);
  const seqRef = useRef(1);
  const overlayOpenRef = useRef(false);
  const lastKnownLengthRef = useRef<number | null>(null);
  const lastKnownMultiplierRef = useRef<number | null>(null);
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickStickRef = useRef<HTMLDivElement | null>(null);
  const joystickStateRef = useRef({ active: false, dx: 0, dy: 0 });
  const cashoutHoldRef = useRef({
    active: false,
    timerId: null as number | null,
    angle: 0,
    direction: { x: 1, y: 0 },
    prevBoost: false,
  });

  const gridPatternRef = useRef<CanvasPattern | null>(null);
  const pelletSpritesRef = useRef<HTMLCanvasElement[]>([]);
  const lastLeaderboardRef = useRef(0);

  const inputRef = useRef({
    mouseX: 0,
    mouseY: 0,
    boost: false,
    zoom: 1,
    lastSent: { angle: 0, boost: false },
  });

  const viewRef = useRef({
    vw: 0,
    vh: 0,
    dpr: 1,
    camX: 0,
    camY: 0,
    scale: 1,
  });

  const stateRef = useRef({
    worldRadius: 3000,
    snakes: new Map<string, SnakeEntry>(),
    drawSnakes: [] as SnakeEntry[],
    pellets: new Map<string, PelletEntry>(),
    leaderboard: [] as { name: string; score: number; hue: number; id: string }[],
  });

  const [status, setStatus] = useState<'idle' | 'connecting' | 'playing' | 'ended'>('idle');
  const [cashoutHold, setCashoutHold] = useState<number | null>(null);
  const [cashoutResult, setCashoutResult] = useState<string | null>(null);
  const [eliminationReason, setEliminationReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState({ size: 0, multiplier: 0, rank: '-' });
  const [leaders, setLeaders] = useState<{ name: string; score: number; hue: number; id: string }[]>([]);
  const [runResult, setRunResult] = useState<RunResultState | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [cashoutPending, setCashoutPending] = useState(false);
  const stakeCents = run ? Number.parseInt(run.stake_cents, 10) : 0;
  const payoutCents = Math.max(0, Math.floor(stakeCents * stats.multiplier));
  const statusRef = useRef(status);
  const runIdRef = useRef<string | null>(run?.run_id ?? null);
  const stakeCentsRef = useRef(stakeCents);

  useEffect(() => {
    document.body.classList.add('game-playing');
    return () => {
      document.body.classList.remove('game-playing');
    };
  }, []);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    runIdRef.current = run?.run_id ?? null;
    stakeCentsRef.current = stakeCents;
  }, [run?.run_id, stakeCents]);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsMobile(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    if (!run) {
      return;
    }

    if (OFFLINE_MODE) {
      startOffline(run);
    } else {
      connect(run);
    }
    startRenderLoop();
    const cleanupResize = setupResizeObserver();
    const cleanupInput = setupInputHandlers();

    return () => {
      cleanupInput();
      cleanupResize();
      stopInputLoop();
      stopRenderLoop();
      if (OFFLINE_MODE) {
        stopOffline();
      } else {
        socketRef.current?.close();
        socketRef.current = null;
      }
    };
  }, [run?.run_id]);

  useEffect(() => {
    if (!run || !isMobile) {
      return;
    }
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') {
      return;
    }
    orientation.lock('landscape').catch(() => undefined);
    return () => {
      if (typeof orientation.unlock === 'function') {
        orientation.unlock();
      }
    };
  }, [run?.run_id, isMobile]);

  useEffect(() => {
    overlayOpenRef.current = overlayOpen;
    if (overlayOpen) {
      cancelCashoutHold();
      inputRef.current.boost = false;
      releaseJoystick();
      stopInputLoop();
    }
  }, [overlayOpen]);

  const connect = (data: RunStartResponse): void => {
    setStatus('connecting');
    setError(null);
    setEliminationReason(null);
    setRunResult(null);
    setOverlayOpen(false);
    setCashoutPending(false);
    const socket = new WebSocket(data.arena_host);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('playing');
      sendMessage('HELLO', {
        run_id: data.run_id,
        join_token: data.join_token,
        protocol_version: REALTIME_PROTOCOL_VERSION,
      });
      sendMessage('JOIN', { run_id: data.run_id, desired_skin: '#FFD166' });
      startInputLoop();
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data as string) as { type: string; payload?: unknown };
        handleMessage(message.type, message.payload);
      } catch {
        setError('Mensagem invalida do servidor');
      }
    };

    socket.onclose = () => {
      setStatus('ended');
      stopInputLoop();
    };

    socket.onerror = () => {
      setError('Erro na conexao com o game-server');
    };
  };

  const startOffline = (data: RunStartResponse): void => {
    setStatus('playing');
    setError(null);
    setEliminationReason(null);
    setRunResult(null);
    setOverlayOpen(false);
    setCashoutPending(false);

    const engine = new SlitherEngine({ tickRate: OFFLINE_TICK_RATE });
    engine.ensureBots(OFFLINE_BOT_COUNT);
    const playerId = 'player-local';
    engine.addPlayer(playerId, '#FFD166');
    offlineEngineRef.current = engine;
    offlineTickCountRef.current = 0;
    playerIdRef.current = playerId;

    const initialSnapshot = buildOfflineSnapshot(engine, offlineTickCountRef.current, true, true);
    handleSnapshot(initialSnapshot);
    startInputLoop();

    const interval = window.setInterval(() => {
      const dt = 1 / engine.tickRate;
      const { eliminations } = engine.update(dt);
      offlineTickCountRef.current += 1;
      const snapshot = buildOfflineSnapshot(engine, offlineTickCountRef.current, false, false);
      handleSnapshot(snapshot);

      for (const elimination of eliminations) {
        if (elimination.playerId === playerIdRef.current) {
          applyElimination({
            reason: elimination.reason,
            size_score: Math.floor(elimination.mass),
            multiplier: resolveMultiplier(Math.floor(elimination.mass)),
          });
        }
      }
    }, Math.round(1000 / engine.tickRate));
    offlineTickRef.current = interval;
  };

  const stopOffline = (): void => {
    if (offlineTickRef.current) {
      window.clearInterval(offlineTickRef.current);
      offlineTickRef.current = null;
    }
    offlineEngineRef.current = null;
  };

  const handleMessage = (type: string, payload?: unknown): void => {
    switch (type) {
      case 'WELCOME': {
        const data = payload as { player_id?: string };
        if (data?.player_id) {
          playerIdRef.current = data.player_id;
        }
        break;
      }
      case 'SNAPSHOT': {
        handleSnapshot(payload as SnapshotPayload);
        break;
      }
      case 'CASHOUT_HOLD': {
        const data = payload as { hold_ms?: number };
        if (data?.hold_ms) {
          setCashoutHold(data.hold_ms);
          setCashoutResult(null);
        }
        break;
      }
      case 'CASHOUT_RESULT': {
        const data = payload as CashoutPayload;
        applyCashoutResult(data);
        break;
      }
      case 'ELIMINATED': {
        applyElimination(payload as EliminatedPayload);
        break;
      }
      case 'ERROR': {
        const data = payload as { message?: string };
        setError(data?.message ?? 'Erro no realtime');
        break;
      }
      default:
        break;
    }
  };

  const applyCashoutResult = (data: CashoutPayload): void => {
    setCashoutHold(null);
    setCashoutResult(data?.status ?? 'unknown');
    const payloadMultiplier = resolveOptionalNumber(data?.multiplier);
    const payloadPayout =
      resolveOptionalNumber(data?.payout) ?? resolveOptionalNumber(data?.payout_cents);
    const finalMultiplier = payloadMultiplier ?? lastKnownMultiplierRef.current ?? null;
    const computedPayout =
      payloadPayout ??
      (Number.isFinite(stakeCents) && finalMultiplier !== null
        ? Math.floor(stakeCents * finalMultiplier)
        : null);
    setRunResult({
      kind: 'cashout',
      stake: Number.isFinite(stakeCents) ? stakeCents : null,
      payout: computedPayout,
      multiplier: finalMultiplier,
      finalLength: resolveFinalLength(data, lastKnownLengthRef.current),
    });
    overlayOpenRef.current = true;
    setOverlayOpen(true);
    setStatus('ended');
    setCashoutPending(false);
  };

  const applyElimination = (data: EliminatedPayload): void => {
    const extended = data as EliminatedPayloadExtended;
    setEliminationReason(data?.reason ?? 'eliminated');
    setStatus('ended');
    setRunResult({
      kind: 'eliminated',
      stake: Number.isFinite(stakeCents) ? stakeCents : null,
      payout: null,
      multiplier:
        resolveOptionalNumber(extended?.multiplier) ??
        lastKnownMultiplierRef.current ??
        null,
      finalLength: resolveFinalLength(extended, lastKnownLengthRef.current),
    });
    overlayOpenRef.current = true;
    setOverlayOpen(true);
    setCashoutPending(false);
  };

  const handleSnapshot = (snapshot: SnapshotPayload): void => {
    const state = stateRef.current;
    if (snapshot.world_radius) {
      state.worldRadius = snapshot.world_radius;
    }

    if (snapshot.pellets) {
      state.pellets.clear();
      snapshot.pellets.forEach((pellet) => {
        state.pellets.set(pellet.id, {
          id: pellet.id,
          idNum: Number(pellet.id),
          x: pellet.x,
          y: pellet.y,
          r: pellet.radius ?? 3.4,
          v: pellet.value,
          h: pellet.hue ?? 0,
        });
      });
    }

    if (snapshot.pellet_events) {
      snapshot.pellet_events.forEach((event) => {
        if (event.type === 'delete') {
          state.pellets.delete(event.id);
        } else if (event.type === 'spawn') {
          const pellet = event.pellet;
          state.pellets.set(pellet.id, {
            id: pellet.id,
            idNum: Number(pellet.id),
            x: pellet.x,
            y: pellet.y,
            r: pellet.radius ?? 3.4,
            v: pellet.value,
            h: pellet.hue ?? 0,
          });
        }
      });
    }

    const seen = new Set<string>();
    snapshot.players.forEach((player) => {
      seen.add(player.id);
      const entry = state.snakes.get(player.id);
      const segments = player.segments ?? [];
      const points = toFlatPoints(segments);
      const hue = player.hue ?? 0;
      const radius = player.radius ?? 10;
      if (!entry) {
        state.snakes.set(player.id, {
          id: player.id,
          x: player.x,
          y: player.y,
          a: player.angle ?? 0,
          b: player.boost,
          m: player.size_score,
          r: radius,
          h: hue,
          p: points,
        });
      } else {
        entry.x = player.x;
        entry.y = player.y;
        entry.a = player.angle ?? entry.a;
        entry.b = player.boost;
        entry.m = player.size_score;
        entry.r = radius;
        entry.h = hue;
        entry.p = points;
      }
    });

    for (const id of state.snakes.keys()) {
      if (!seen.has(id)) {
        state.snakes.delete(id);
      }
    }

    state.drawSnakes.length = 0;
    for (const snake of state.snakes.values()) {
      state.drawSnakes.push(snake);
    }
    state.drawSnakes.sort((a, b) => a.m - b.m);

    updateHud(snapshot);
  };

  const updateHud = (snapshot: SnapshotPayload): void => {
    const entries = [...snapshot.players].sort((a, b) => b.size_score - a.size_score);
    const me = snapshot.players.find((player) => player.id === playerIdRef.current);
    if (me) {
      const rankIndex = entries.findIndex((player) => player.id === me.id);
      setStats({
        size: me.size_score,
        multiplier: me.multiplier,
        rank: rankIndex >= 0 ? `${rankIndex + 1}` : '-',
      });
      lastKnownLengthRef.current = me.size_score;
      lastKnownMultiplierRef.current = me.multiplier;
    }

    const now = performance.now();
    if (now - lastLeaderboardRef.current < 1000 / PERF.leaderboardHz) {
      return;
    }
    lastLeaderboardRef.current = now;
    const top = entries.slice(0, 10).map((player) => ({
      id: player.id,
      name:
        player.id === playerIdRef.current
          ? 'Voce'
          : player.name ?? `Player ${player.id.slice(0, 4)}`,
      score: player.size_score,
      hue: player.hue ?? 0,
    }));
    setLeaders(top);
  };

  const sendMessage = (type: string, payload?: Record<string, unknown>): void => {
    if (OFFLINE_MODE) {
      return;
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return;
    }
    socketRef.current.send(JSON.stringify({ type, payload }));
  };

  const startInputLoop = (): void => {
    stopInputLoop();
    const targetHz = OFFLINE_MODE ? OFFLINE_INPUT_HZ : 30;
    const interval = Math.round(1000 / targetHz);
    inputIntervalRef.current = window.setInterval(() => {
      if (overlayOpenRef.current) {
        return;
      }
      const { angle, direction } = inputFromPointer();
      const delta = angleDiff(inputRef.current.lastSent.angle, angle);
      const boostChanged = inputRef.current.lastSent.boost !== inputRef.current.boost;
      if (Math.abs(delta) > 0.01 || boostChanged) {
        inputRef.current.lastSent.angle = angle;
        inputRef.current.lastSent.boost = inputRef.current.boost;
        if (OFFLINE_MODE) {
          if (offlineEngineRef.current && playerIdRef.current) {
            offlineEngineRef.current.handleInput(
              playerIdRef.current,
              direction,
              inputRef.current.boost,
            );
          }
        } else {
          sendMessage('INPUT', {
            seq: seqRef.current++,
            direction,
            boost: inputRef.current.boost,
          });
        }
      }
    }, interval);
  };

  const stopInputLoop = (): void => {
    if (inputIntervalRef.current) {
      window.clearInterval(inputIntervalRef.current);
      inputIntervalRef.current = null;
    }
  };

  const updateJoystickFromPointer = (clientX: number, clientY: number): void => {
    const base = joystickBaseRef.current;
    const stick = joystickStickRef.current;
    if (!base || !stick) {
      return;
    }
    const rect = base.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const maxDistance = Math.max(12, rect.width / 2 - 8);
    const distance = Math.hypot(dx, dy);
    if (distance > maxDistance) {
      const scale = maxDistance / distance;
      dx *= scale;
      dy *= scale;
    }
    stick.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    joystickStateRef.current.active = true;
    joystickStateRef.current.dx = maxDistance > 0 ? dx / maxDistance : 0;
    joystickStateRef.current.dy = maxDistance > 0 ? dy / maxDistance : 0;
  };

  const releaseJoystick = (): void => {
    joystickStateRef.current.active = false;
    joystickStateRef.current.dx = 0;
    joystickStateRef.current.dy = 0;
    if (joystickStickRef.current) {
      joystickStickRef.current.style.transform = 'translate(-50%, -50%)';
    }
  };

  const startCashoutHold = (): void => {
    if (overlayOpenRef.current || statusRef.current !== 'playing' || !runIdRef.current) {
      return;
    }
    if (cashoutHoldRef.current.active) {
      return;
    }
    const { angle, direction } = inputFromPointer();
    cashoutHoldRef.current.active = true;
    cashoutHoldRef.current.prevBoost = inputRef.current.boost;
    cashoutHoldRef.current.angle = angle;
    cashoutHoldRef.current.direction = direction;
    inputRef.current.boost = true;
    inputRef.current.lastSent.angle = angle;
    inputRef.current.lastSent.boost = true;
    if (OFFLINE_MODE) {
      if (offlineEngineRef.current && playerIdRef.current) {
        offlineEngineRef.current.handleInput(playerIdRef.current, direction, true);
      }
      setCashoutHold(5000);
    } else {
      sendMessage('INPUT', {
        seq: seqRef.current++,
        direction,
        boost: true,
      });
    }
    cashoutHoldRef.current.timerId = window.setTimeout(() => {
      finishCashoutHold();
    }, 5000);
  };

  const cancelCashoutHold = (): void => {
    if (!cashoutHoldRef.current.active) {
      return;
    }
    cashoutHoldRef.current.active = false;
    if (cashoutHoldRef.current.timerId) {
      window.clearTimeout(cashoutHoldRef.current.timerId);
      cashoutHoldRef.current.timerId = null;
    }
    inputRef.current.boost = cashoutHoldRef.current.prevBoost;
  };

  const finishCashoutHold = (): void => {
    if (!cashoutHoldRef.current.active) {
      return;
    }
    cashoutHoldRef.current.active = false;
    if (cashoutHoldRef.current.timerId) {
      window.clearTimeout(cashoutHoldRef.current.timerId);
      cashoutHoldRef.current.timerId = null;
    }
    inputRef.current.boost = false;
    if (OFFLINE_MODE) {
      if (offlineEngineRef.current && playerIdRef.current) {
        offlineEngineRef.current.handleInput(
          playerIdRef.current,
          cashoutHoldRef.current.direction,
          false,
        );
      }
      setCashoutHold(null);
    } else {
      sendMessage('INPUT', {
        seq: seqRef.current++,
        direction: cashoutHoldRef.current.direction,
        boost: false,
      });
      sendMessage('CASHOUT_REQUEST', { run_id: runIdRef.current });
    }
    const fallbackMultiplier = lastKnownMultiplierRef.current;
    const fallbackLength = lastKnownLengthRef.current;
    const computedPayout =
      Number.isFinite(stakeCentsRef.current) && fallbackMultiplier !== null
        ? Math.floor(stakeCentsRef.current * fallbackMultiplier)
        : null;
    setRunResult({
      kind: 'cashout',
      stake: Number.isFinite(stakeCentsRef.current) ? stakeCentsRef.current : null,
      payout: computedPayout,
      multiplier: fallbackMultiplier,
      finalLength: fallbackLength,
    });
    overlayOpenRef.current = true;
    setOverlayOpen(true);
    setStatus('ended');
    setCashoutPending(true);
  };

  const inputFromPointer = (): { angle: number; direction: Vector2 } => {
    if (cashoutHoldRef.current.active) {
      return {
        angle: cashoutHoldRef.current.angle,
        direction: cashoutHoldRef.current.direction,
      };
    }
    if (isMobile) {
      const { active, dx, dy } = joystickStateRef.current;
      if (!active) {
        const angle = inputRef.current.lastSent.angle;
        return { angle, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
      }
      const magnitude = Math.hypot(dx, dy);
      if (magnitude <= 0.01) {
        const angle = inputRef.current.lastSent.angle;
        return { angle, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
      }
      const angle = Math.atan2(dy, dx);
      return { angle, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
    }

    const view = viewRef.current;
    const dx = inputRef.current.mouseX - view.vw / 2;
    const dy = inputRef.current.mouseY - view.vh / 2;
    const angle = Math.atan2(dy, dx);
    return { angle, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
  };

  const handleJoystickPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (overlayOpenRef.current || cashoutHoldRef.current.active) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    updateJoystickFromPointer(event.clientX, event.clientY);
  };

  const handleJoystickPointerMove = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (cashoutHoldRef.current.active) {
      return;
    }
    if (!joystickStateRef.current.active) {
      return;
    }
    updateJoystickFromPointer(event.clientX, event.clientY);
  };

  const handleJoystickPointerUp = (event: ReactPointerEvent<HTMLDivElement>): void => {
    event.currentTarget.releasePointerCapture(event.pointerId);
    releaseJoystick();
  };

  const handleBoostPointerDown = (): void => {
    if (overlayOpenRef.current || cashoutHoldRef.current.active) {
      return;
    }
    inputRef.current.boost = true;
  };

  const handleBoostPointerUp = (): void => {
    if (cashoutHoldRef.current.active) {
      return;
    }
    inputRef.current.boost = false;
  };

  const startRenderLoop = (): void => {
    const render = (time: number) => {
      const frame = frameRef.current;
      if (!frame.last) {
        frame.last = time;
      }
      let dt = time - frame.last;
      if (dt > 100) {
        dt = 100;
      }
      frame.last = time;
      frame.acc += dt;
      while (frame.acc >= frame.step) {
        frame.acc -= frame.step;
      }
      draw(time);
      animationRef.current = requestAnimationFrame(render);
    };
    animationRef.current = requestAnimationFrame(render);
  };

  const stopRenderLoop = (): void => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  };

  const draw = (now: number): void => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) {
      return;
    }
    const view = viewRef.current;
    const state = stateRef.current;
    const me = playerIdRef.current ? state.snakes.get(playerIdRef.current) : undefined;

    if (me) {
      const camLerp = me.b ? 0.18 : 0.26;
      view.camX += (me.x - view.camX) * camLerp;
      view.camY += (me.y - view.camY) * camLerp;
      const dyn = clamp(1 / (1 + me.m / 260), 0.35, 1.0);
      view.scale = dyn * inputRef.current.zoom;
    } else {
      view.scale = inputRef.current.zoom;
    }

    const pattern = gridPatternRef.current ?? createGridPattern(context);
    gridPatternRef.current = pattern;
    const sprites = ensurePelletSprites(pelletSpritesRef);

    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    context.fillStyle = '#0b0f14';
    context.fillRect(0, 0, view.vw, view.vh);

    const s = view.scale;
    context.setTransform(
      view.dpr * s,
      0,
      0,
      view.dpr * s,
      view.dpr * (view.vw / 2 - view.camX * s),
      view.dpr * (view.vh / 2 - view.camY * s),
    );

    const w = view.vw / s;
    const h = view.vh / s;
    context.fillStyle = pattern;
    context.fillRect(view.camX - w, view.camY - h, w * 2, h * 2);

    drawWorldBorder(context, state.worldRadius);
    drawPellets(context, state, view, sprites);
    drawSnakes(context, state, view, me?.id);
  };

  const setupInputHandlers = (): (() => void) => {
    const handlePointerMove = (event: PointerEvent) => {
      if (overlayOpenRef.current) {
        return;
      }
      inputRef.current.mouseX = event.clientX;
      inputRef.current.mouseY = event.clientY;
    };
    const handlePointerDown = () => {
      if (overlayOpenRef.current || cashoutHoldRef.current.active) {
        return;
      }
      inputRef.current.boost = true;
    };
    const handlePointerUp = () => {
      if (overlayOpenRef.current || cashoutHoldRef.current.active) {
        return;
      }
      inputRef.current.boost = false;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (overlayOpenRef.current) {
        return;
      }
      if (event.code === 'KeyQ' || event.key?.toLowerCase() === 'q') {
        startCashoutHold();
        return;
      }
      if (cashoutHoldRef.current.active) {
        return;
      }
      if (event.code === 'Space') {
        inputRef.current.boost = true;
      }
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'KeyQ') {
        cancelCashoutHold();
        return;
      }
      if (overlayOpenRef.current || cashoutHoldRef.current.active) {
        return;
      }
      if (event.code === 'Space') {
        inputRef.current.boost = false;
      }
    };
    const handleWheel = (event: WheelEvent) => {
      if (overlayOpenRef.current) {
        return;
      }
      const delta = Math.sign(event.deltaY);
      inputRef.current.zoom = clamp(
        inputRef.current.zoom * (delta > 0 ? 0.9 : 1.1),
        0.45,
        1.65,
      );
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
    };
  };

  const setupResizeObserver = (): (() => void) => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) {
      return () => undefined;
    }

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const view = viewRef.current;
      view.vw = rect.width;
      view.vh = rect.height;
      view.dpr = Math.min(PERF.maxDpr, window.devicePixelRatio || 1);
      canvas.width = Math.floor(view.vw * view.dpr);
      canvas.height = Math.floor(view.vh * view.dpr);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => observer.disconnect();
  };

  if (!run) {
    return (
      <div className="game-fullscreen">
        <div className="game-empty">
          <div className="game-panel">
            <div className="game-panel__title">Sem run ativa</div>
            <div className="game-panel__value">Volte ao lobby para iniciar uma run.</div>
            <div className="game-actions-inline">
              <ActionButton label="Voltar" onClick={onExit} variant="ghost" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="game-fullscreen">
      <div className="game-stage" ref={containerRef}>
        <canvas ref={canvasRef} />

        <div className="game-overlay game-alerts">
          <div className="game-panel">
            <div className="game-panel__title">Status</div>
            <div className="game-panel__value">{status}</div>
          </div>
          {cashoutHold ? (
            <div className="game-panel">
              <div className="game-panel__title">Cashout hold</div>
              <div className="game-panel__value">{cashoutHold}ms</div>
            </div>
          ) : null}
          {cashoutResult ? (
            <div className="game-panel">
              <div className="game-panel__title">Cashout</div>
              <div className="game-panel__value">{cashoutResult}</div>
            </div>
          ) : null}
          {eliminationReason ? (
            <div className="game-panel">
              <div className="game-panel__title">Eliminado</div>
              <div className="game-panel__value">{eliminationReason}</div>
            </div>
          ) : null}
        </div>

        <div className="game-overlay game-leaderboard">
          <div className="game-panel">
            <div className="game-panel__title">Lideres</div>
            <ol>
              {leaders.map((entry, index) => (
                <li key={entry.id} className={entry.id === playerIdRef.current ? 'self' : undefined}>
                  <span className="rank">#{index + 1}</span>
                  <span className="name" style={{ color: `hsl(${entry.hue}, 90%, 60%)` }}>
                    {entry.name}
                  </span>
                  <span className="score">{entry.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="game-overlay game-stats">
          <div className="game-panel">
            <div className="game-panel__title">Seu status</div>
            <div className="game-panel__line">
              <span>Comprimento</span>
              <strong>{stats.size}</strong>
            </div>
            <div className="game-panel__line">
              <span>Multiplicador</span>
              <strong>{stats.multiplier.toFixed(2)}x</strong>
            </div>
            <div className="game-panel__line">
              <span>Classificacao</span>
              <strong>{stats.rank}</strong>
            </div>
          </div>
        </div>

        <div className="game-overlay game-earnings">
          <div className="earnings-card">
            <div className="earnings-label">Ganho atual</div>
            <div className="earnings-value">{formatCents(payoutCents)}</div>
            <div className="earnings-meta">
              Investido {formatCents(stakeCents)} · {stats.multiplier.toFixed(2)}x
            </div>
          </div>
        </div>

        {!isMobile ? (
          <div className="game-overlay game-actions">
            <ActionButton
              label="Cashout (segure Q)"
              onPointerDown={startCashoutHold}
              onPointerUp={cancelCashoutHold}
              onPointerLeave={cancelCashoutHold}
              onPointerCancel={cancelCashoutHold}
              onMouseDown={startCashoutHold}
              onMouseUp={cancelCashoutHold}
              disabled={status !== 'playing' || overlayOpen}
            />
            <ActionButton label="Sair" onClick={onExit} variant="ghost" />
          </div>
        ) : null}

        {isMobile ? (
          <div className="game-overlay game-controls-mobile">
            <div
              className="mobile-joystick"
              ref={joystickBaseRef}
              onPointerDown={handleJoystickPointerDown}
              onPointerMove={handleJoystickPointerMove}
              onPointerUp={handleJoystickPointerUp}
              onPointerCancel={handleJoystickPointerUp}
            >
              <div className="mobile-joystick__base">
                <div className="mobile-joystick__stick" ref={joystickStickRef} />
              </div>
            </div>
            <div className="mobile-buttons">
              <button
                type="button"
                className="mobile-button boost"
                onPointerDown={handleBoostPointerDown}
                onPointerUp={handleBoostPointerUp}
                onPointerCancel={handleBoostPointerUp}
                onPointerLeave={handleBoostPointerUp}
              >
                Acelerar
              </button>
              <button
                type="button"
                className="mobile-button cashout"
                onPointerDown={startCashoutHold}
                onPointerUp={cancelCashoutHold}
                onPointerCancel={cancelCashoutHold}
                onPointerLeave={cancelCashoutHold}
                disabled={status !== 'playing' || overlayOpen}
              >
                Cashout
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className="game-overlay game-toast">{error}</div> : null}
        {runResult ? (
          <RunResultOverlay
            open={overlayOpen}
            kind={runResult.kind}
            stake={runResult.stake ?? undefined}
            payout={runResult.payout ?? undefined}
            multiplier={runResult.multiplier ?? undefined}
            finalLength={runResult.finalLength ?? undefined}
            pending={cashoutPending}
            onPlayAgain={() => {
              if (cashoutPending) {
                return;
              }
              setOverlayOpen(false);
              setRunResult(null);
              onExit();
            }}
            onExit={() => {
              if (cashoutPending) {
                return;
              }
              setOverlayOpen(false);
              setRunResult(null);
              onExit();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function buildOfflineSnapshot(
  engine: SlitherEngine,
  tick: number,
  includePellets: boolean,
  includeWorld: boolean,
): SnapshotPayload {
  const players = engine.getSnapshotPlayers().map((player) => mapOfflinePlayer(player));
  const pelletEvents = mapOfflinePelletEvents(engine.flushPelletEvents());

  const snapshot: SnapshotPayload = {
    tick,
    room_id: 'offline',
    players,
    pellet_events: pelletEvents,
  };

  if (includePellets) {
    snapshot.pellets = engine.getActivePellets().map((pellet) => ({
      id: pellet.id.toString(),
      x: pellet.x,
      y: pellet.y,
      value: pellet.value,
      radius: pellet.radius,
      hue: pellet.hue,
    }));
  }

  if (includeWorld) {
    snapshot.world_radius = engine.worldRadius;
  }

  return snapshot;
}

function mapOfflinePlayer(player: SlitherSnapshotPlayer): SnapshotPayload['players'][number] {
  const sizeScore = Math.floor(player.mass);
  return {
    id: player.id,
    name: player.name,
    x: player.x,
    y: player.y,
    boost: player.boost,
    size_score: sizeScore,
    multiplier: resolveMultiplier(sizeScore),
    color: `hsl(${player.hue}, 90%, 58%)`,
    segments: player.segments,
    angle: player.angle,
    radius: player.radius,
    hue: player.hue,
  };
}

function mapOfflinePelletEvents(events: SlitherPelletEvent[]): SnapshotPayload['pellet_events'] {
  if (events.length === 0) {
    return [];
  }
  return events.map((event) => {
    if (event.type === 'delete') {
      return { type: 'delete', id: event.id.toString() };
    }
    return {
      type: 'spawn',
      pellet: {
        id: event.pellet.id.toString(),
        x: event.pellet.x,
        y: event.pellet.y,
        value: event.pellet.value,
        radius: event.pellet.radius,
        hue: event.pellet.hue,
      },
    };
  });
}

function drawWorldBorder(context: CanvasRenderingContext2D, radius: number): void {
  context.strokeStyle = 'rgba(255,255,255,0.1)';
  context.lineWidth = 24;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();

  context.strokeStyle = 'rgba(255,255,255,0.2)';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
}

function drawPellets(
  context: CanvasRenderingContext2D,
  state: { pellets: Map<string, PelletEntry> },
  view: { vw: number; vh: number; scale: number; camX: number; camY: number },
  sprites: HTMLCanvasElement[],
): void {
  const s = view.scale;
  const halfW = (view.vw / 2) / s;
  const halfH = (view.vh / 2) / s;
  const minX = view.camX - halfW - 50;
  const maxX = view.camX + halfW + 50;
  const minY = view.camY - halfH - 50;
  const maxY = view.camY + halfH + 50;

  let mask = 0;
  let minR = 0;
  if (s < 0.55) {
    mask = 3;
    minR = 2.2;
  } else if (s < 0.75) {
    mask = 1;
    minR = 1.6;
  }

  const sprite = (hue: number) => {
    const buckets = sprites.length;
    const index = Math.max(0, Math.min(buckets - 1, Math.floor((hue / 360) * buckets)));
    return sprites[index];
  };

  const base = s < 0.65 ? 8 : 10;

  for (const pellet of state.pellets.values()) {
    if (pellet.x < minX || pellet.x > maxX || pellet.y < minY || pellet.y > maxY) {
      continue;
    }
    if (minR && pellet.r < minR) {
      continue;
    }
    if (mask && (pellet.idNum & mask) !== 0) {
      continue;
    }
    const spr = sprite(pellet.h);
    if (!spr) {
      continue;
    }
    const size = base + pellet.r * 2.4;
    context.drawImage(spr, pellet.x - size / 2, pellet.y - size / 2, size, size);
  }
}

function drawSnakes(
  context: CanvasRenderingContext2D,
  state: { drawSnakes: SnakeEntry[] },
  view: { dpr: number; vw: number; vh: number; camX: number; camY: number; scale: number },
  selfId?: string,
): void {
  for (const snake of state.drawSnakes) {
    const pts = snake.p;
    if (!pts || pts.length < 4) {
      continue;
    }
    context.strokeStyle = `hsl(${snake.h}, 90%, 58%)`;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.lineWidth = snake.r * 2;
    context.beginPath();
    context.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) {
      context.lineTo(pts[i], pts[i + 1]);
    }
    context.stroke();

    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];
    context.fillStyle = `hsl(${snake.h}, 90%, 62%)`;
    context.beginPath();
    context.arc(hx, hy, snake.r * 1.05, 0, Math.PI * 2);
    context.fill();

    const ang = snake.a || 0;
    const ex = Math.cos(ang);
    const ey = Math.sin(ang);
    const px = -ey;
    const py = ex;

    const eyeOff = snake.r * 0.55;
    const eyeFwd = snake.r * 0.55;
    const e1x = hx + ex * eyeFwd + px * eyeOff;
    const e1y = hy + ey * eyeFwd + py * eyeOff;
    const e2x = hx + ex * eyeFwd - px * eyeOff;
    const e2y = hy + ey * eyeFwd - py * eyeOff;

    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.beginPath();
    context.arc(e1x, e1y, snake.r * 0.18, 0, Math.PI * 2);
    context.arc(e2x, e2y, snake.r * 0.18, 0, Math.PI * 2);
    context.fill();

    if (selfId && snake.id === selfId) {
      context.setTransform(
        view.dpr * view.scale,
        0,
        0,
        view.dpr * view.scale,
        view.dpr * (view.vw / 2 - view.camX * view.scale),
        view.dpr * (view.vh / 2 - view.camY * view.scale),
      );
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.font = '14px system-ui';
      context.textAlign = 'center';
      context.fillText('voce', hx, hy - snake.r * 2.2);
    }
  }
}

function createGridPattern(context: CanvasRenderingContext2D): CanvasPattern {
  const canvas = document.createElement('canvas');
  canvas.width = 96;
  canvas.height = 96;
  const grid = canvas.getContext('2d');
  if (!grid) {
    return context.createPattern(canvas, 'repeat')!;
  }
  grid.fillStyle = '#0b0f14';
  grid.fillRect(0, 0, canvas.width, canvas.height);
  grid.strokeStyle = 'rgba(255,255,255,0.06)';
  grid.lineWidth = 1;
  grid.beginPath();
  grid.moveTo(0, 0);
  grid.lineTo(canvas.width, 0);
  grid.moveTo(0, 0);
  grid.lineTo(0, canvas.height);
  grid.moveTo(0, canvas.height / 2);
  grid.lineTo(canvas.width, canvas.height / 2);
  grid.moveTo(canvas.width / 2, 0);
  grid.lineTo(canvas.width / 2, canvas.height);
  grid.stroke();
  return context.createPattern(canvas, 'repeat')!;
}

function ensurePelletSprites(ref: { current: HTMLCanvasElement[] }): HTMLCanvasElement[] {
  if (ref.current.length > 0) {
    return ref.current;
  }
  const sprites: HTMLCanvasElement[] = [];
  const buckets = 12;
  for (let i = 0; i < buckets; i += 1) {
    const hue = Math.floor((i / buckets) * 360);
    const canvas = document.createElement('canvas');
    canvas.width = 26;
    canvas.height = 26;
    const g = canvas.getContext('2d');
    if (!g) {
      continue;
    }
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const grad = g.createRadialGradient(cx, cy, 1, cx, cy, 13);
    grad.addColorStop(0.0, `hsla(${hue}, 90%, 70%, 0.95)`);
    grad.addColorStop(0.6, `hsla(${hue}, 90%, 60%, 0.4)`);
    grad.addColorStop(1.0, `hsla(${hue}, 90%, 60%, 0.0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, 13, 0, Math.PI * 2);
    g.fill();
    sprites.push(canvas);
  }
  ref.current = sprites;
  return sprites;
}

function toFlatPoints(points: Vector2[]): number[] {
  if (!points || points.length === 0) {
    return [];
  }
  const flat = new Array(points.length * 2);
  let k = 0;
  for (const point of points) {
    flat[k++] = point.x;
    flat[k++] = point.y;
  }
  return flat;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) {
    d -= Math.PI * 2;
  }
  if (d < -Math.PI) {
    d += Math.PI * 2;
  }
  return d;
}

function resolveOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function resolveFinalLength(
  payload: { size_score?: number | string; length?: number | string; final_length?: number | string },
  fallback: number | null,
): number | null {
  const direct =
    resolveOptionalNumber(payload?.final_length) ??
    resolveOptionalNumber(payload?.length) ??
    resolveOptionalNumber(payload?.size_score);
  if (direct !== null) {
    return direct;
  }
  return fallback;
}
