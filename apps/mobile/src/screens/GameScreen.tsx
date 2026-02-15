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
import {
  type RunCashoutEventResponse,
  type RunStartResponse,
  reportRunCashout,
  reportRunEliminated,
} from '../api/client';
import { formatCents } from '../utils/format';

type GameScreenProps = {
  run: RunStartResponse | null;
  onExit: () => void;
};

type SnakeSnapshot = {
  t: number;
  x: number;
  y: number;
  a: number;
  b: boolean;
  m: number;
  r: number;
  h: number;
  p: number[] | null;
};

type SnakeSprite = {
  canvas: HTMLCanvasElement;
  size: number;
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
  prevSnap: SnakeSnapshot | null;
  nextSnap: SnakeSnapshot | null;
  lastFullPoints: number[] | null;
  lastFullX: number;
  lastFullY: number;
  renderPoints: number[] | null;
  rp: number[] | null;
  rx: number;
  ry: number;
  ra: number;
  rr: number;
  rm: number;
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

const OFFLINE_MODE = String(import.meta.env.VITE_GAME_OFFLINE ?? '').toLowerCase() === 'true';
const OFFLINE_BOT_COUNT = 20;
const OFFLINE_TICK_RATE = 72;
const OFFLINE_INPUT_HZ = 60;
const OFFLINE_SNAPSHOT_POINTS = 320;
const CASHOUT_HOLD_MS = 3000;
const CASHOUT_FEE_BPS = 1000;
const NET = {
  interpDelayMs: 96,
  maxExtrapMs: 80,
};
const MOBILE_ZOOM_OUT_FACTOR = 0.82;

export function GameScreen({ run, onExit }: GameScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const contextRef = useRef<CanvasRenderingContext2D | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const inputIntervalRef = useRef<number | null>(null);
  const animationRef = useRef<number | null>(null);
  const frameRef = useRef({
    last: 0,
    acc: 0,
    step: 1000 / OFFLINE_TICK_RATE,
  });
  const offlineEngineRef = useRef<SlitherEngine | null>(null);
  const offlineTickCountRef = useRef(0);
  const lastStatsRef = useRef(0);
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
    startedAt: 0,
  });
  const cashoutCountdownRef = useRef<number | null>(null);

  const gridPatternRef = useRef<CanvasPattern | null>(null);
  const vignetteRef = useRef<HTMLCanvasElement | null>(null);
  const snakeSpriteCacheRef = useRef<Map<string, SnakeSprite>>(new Map());
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
  const payoutCents = Math.max(0, computePayoutCents(stakeCents, stats.multiplier));
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
    const cleanupResize = setupResizeObserver();
    const cleanupInput = setupInputHandlers();
    startRenderLoop();

    return () => {
      cleanupInput();
      cleanupResize();
      stopInputLoop();
      stopRenderLoop();
      stopCashoutCountdown();
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
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (type: string) => Promise<void>;
      unlock?: () => void;
    };
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
      sendMessage('JOIN', { run_id: data.run_id, desired_skin: '#f0f0f0' });
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
    NET.interpDelayMs = Math.max(50, Math.round((1000 / engine.tickRate) * 1.4));
    const playerId = 'player-local';
    engine.addPlayer(playerId, '#f0f0f0');
    offlineEngineRef.current = engine;
    offlineTickCountRef.current = 0;
    frameRef.current.acc = 0;
    frameRef.current.step = 1000 / engine.tickRate;
    playerIdRef.current = playerId;

    const initialSnapshot = buildOfflineSnapshot(
      engine,
      offlineTickCountRef.current,
      true,
      true,
      OFFLINE_SNAPSHOT_POINTS,
    );
    handleSnapshot(initialSnapshot);
    startInputLoop();
  };

  const stopOffline = (): void => {
    offlineEngineRef.current = null;
  };

  const runOfflineTick = (): void => {
    const engine = offlineEngineRef.current;
    if (!engine || statusRef.current !== 'playing') {
      return;
    }
    const dt = 1 / engine.tickRate;
    const { eliminations } = engine.update(dt);
    offlineTickCountRef.current += 1;
    const snapshot = buildOfflineSnapshot(
      engine,
      offlineTickCountRef.current,
      false,
      false,
      OFFLINE_SNAPSHOT_POINTS,
    );
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
  };

  const handleMessage = (type: string, payload?: unknown): void => {
    switch (type) {
      case 'WELCOME': {
        const data = payload as { player_id?: string; snapshot_rate?: number };
        if (data?.player_id) {
          playerIdRef.current = data.player_id;
        }
        if (data?.snapshot_rate && data.snapshot_rate > 0) {
          NET.interpDelayMs = Math.max(80, Math.round((1000 / data.snapshot_rate) * 1.6));
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
          cashoutHoldRef.current.active = true;
          cashoutHoldRef.current.startedAt = performance.now();
          setCashoutHold(data.hold_ms);
          startCashoutCountdown();
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
        ? computePayoutCents(stakeCents, finalMultiplier)
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

  const applyElimination = (data: EliminatedPayloadExtended): void => {
    if (statusRef.current !== 'playing') {
      return;
    }
    setEliminationReason(data?.reason ?? 'eliminated');
    setStatus('ended');
    setRunResult({
      kind: 'eliminated',
      stake: Number.isFinite(stakeCents) ? stakeCents : null,
      payout: null,
      multiplier:
        resolveOptionalNumber(data?.multiplier) ??
        lastKnownMultiplierRef.current ??
        null,
      finalLength: resolveFinalLength(data, lastKnownLengthRef.current),
    });
    overlayOpenRef.current = true;
    setOverlayOpen(true);
    setCashoutPending(false);
    if (OFFLINE_MODE && runIdRef.current) {
      void reportRunEliminated({
        runId: runIdRef.current,
        reason: data?.reason ?? 'eliminated',
        multiplier:
          resolveOptionalNumber(data?.multiplier) ??
          lastKnownMultiplierRef.current ??
          undefined,
        sizeScore: resolveOptionalNumber(data?.size_score) ?? lastKnownLengthRef.current ?? undefined,
      }).catch(() => {
        setCashoutResult('Falha ao registrar eliminacao');
      });
    }
  };

  const handleSnapshot = (snapshot: SnapshotPayload): void => {
    const state = stateRef.current;
    const snapNow = performance.now();
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
      const rawPoints = toFlatPoints(player.segments ?? []);
      const points = rawPoints.length >= 4 ? rawPoints : null;
      const hue = player.hue ?? 0;
      const radius = player.radius ?? 10;
      const snapshotEntry: SnakeSnapshot = {
        t: snapNow,
        x: player.x,
        y: player.y,
        a: player.angle ?? 0,
        b: player.boost,
        m: player.size_score,
        r: radius,
        h: hue,
        p: points,
      };

      if (!entry) {
        const seedPoints = points ?? [player.x, player.y, player.x, player.y];
        if (!snapshotEntry.p) {
          snapshotEntry.p = seedPoints;
        }
        state.snakes.set(player.id, {
          id: player.id,
          x: player.x,
          y: player.y,
          a: player.angle ?? 0,
          b: player.boost,
          m: player.size_score,
          r: radius,
          h: hue,
          p: snapshotEntry.p,
          prevSnap: snapshotEntry,
          nextSnap: snapshotEntry,
          lastFullPoints: seedPoints,
          lastFullX: player.x,
          lastFullY: player.y,
          renderPoints: null,
          rp: snapshotEntry.p,
          rx: player.x,
          ry: player.y,
          ra: player.angle ?? 0,
          rr: radius,
          rm: player.size_score,
        });
      } else {
        entry.x = player.x;
        entry.y = player.y;
        entry.a = snapshotEntry.a;
        entry.b = player.boost;
        entry.m = player.size_score;
        entry.r = radius;
        entry.h = hue;
        entry.prevSnap = entry.nextSnap ?? snapshotEntry;
        entry.nextSnap = snapshotEntry;
        entry.p = points ?? entry.p;
        if (points) {
          entry.lastFullPoints = points;
          entry.lastFullX = player.x;
          entry.lastFullY = player.y;
        }
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
    state.drawSnakes.sort((a, b) => (a.nextSnap?.m ?? a.m) - (b.nextSnap?.m ?? b.m));

    updateHud(snapshot, snapNow);
  };

  const updateHud = (snapshot: SnapshotPayload, now: number): void => {
    const entries = [...snapshot.players].sort((a, b) => b.size_score - a.size_score);
    const me = snapshot.players.find((player) => player.id === playerIdRef.current);
    if (me) {
      const rankIndex = entries.findIndex((player) => player.id === me.id);
      const rank = rankIndex >= 0 ? `${rankIndex + 1}` : '-';
      const shouldRefreshStats =
        now - lastStatsRef.current >= 1000 / 12 ||
        me.size_score !== lastKnownLengthRef.current ||
        me.multiplier !== lastKnownMultiplierRef.current;
      if (shouldRefreshStats) {
        setStats({
          size: me.size_score,
          multiplier: me.multiplier,
          rank,
        });
        lastStatsRef.current = now;
      }
      lastKnownLengthRef.current = me.size_score;
      lastKnownMultiplierRef.current = me.multiplier;
    }

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
    cashoutHoldRef.current.startedAt = performance.now();
    inputRef.current.boost = true;
    inputRef.current.lastSent.angle = angle;
    inputRef.current.lastSent.boost = true;
    if (OFFLINE_MODE) {
      if (offlineEngineRef.current && playerIdRef.current) {
        offlineEngineRef.current.handleInput(playerIdRef.current, direction, true);
      }
      setCashoutHold(CASHOUT_HOLD_MS);
      startCashoutCountdown();
    } else {
      sendMessage('INPUT', {
        seq: seqRef.current++,
        direction,
        boost: true,
      });
    }
    cashoutHoldRef.current.timerId = window.setTimeout(() => {
      finishCashoutHold();
    }, CASHOUT_HOLD_MS);
  };

  const cancelCashoutHold = (): void => {
    if (!cashoutHoldRef.current.active) {
      return;
    }
    cashoutHoldRef.current.active = false;
    cashoutHoldRef.current.startedAt = 0;
    if (cashoutHoldRef.current.timerId) {
      window.clearTimeout(cashoutHoldRef.current.timerId);
      cashoutHoldRef.current.timerId = null;
    }
    inputRef.current.boost = cashoutHoldRef.current.prevBoost;
    setCashoutHold(null);
    stopCashoutCountdown();
  };

  const finishCashoutHold = (): void => {
    if (!cashoutHoldRef.current.active) {
      return;
    }
    cashoutHoldRef.current.active = false;
    cashoutHoldRef.current.startedAt = 0;
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
      stopInputLoop();
      stopOffline();
      setCashoutHold(null);
      stopCashoutCountdown();
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
        ? computePayoutCents(stakeCentsRef.current, fallbackMultiplier)
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
    const reportRunId = runIdRef.current;
    const canReportCashout =
      OFFLINE_MODE && typeof reportRunId === 'string' && fallbackMultiplier !== null;
    setCashoutPending(canReportCashout);
    if (canReportCashout) {
      void reportRunCashout({
        runId: reportRunId,
        multiplier: fallbackMultiplier,
        sizeScore: fallbackLength ?? undefined,
      })
        .then((response: RunCashoutEventResponse) => {
          const payout =
            response?.payout_cents != null ? Number.parseInt(response.payout_cents, 10) : null;
          setRunResult((prev) =>
            prev
              ? {
                  ...prev,
                  payout: payout ?? prev.payout ?? null,
                  multiplier:
                    typeof response?.multiplier === 'number'
                      ? response.multiplier
                      : prev.multiplier,
                }
              : prev,
          );
          setCashoutResult('Cashout confirmado');
        })
        .catch(() => {
          setCashoutResult('Falha ao confirmar cashout');
        })
        .finally(() => {
          setCashoutPending(false);
        });
    }
    stopCashoutCountdown();
  };

  const inputFromPointer = (): { angle: number; direction: Vector2 } => {
    if (cashoutHoldRef.current.active) {
      return {
        angle: cashoutHoldRef.current.angle,
        direction: cashoutHoldRef.current.direction,
      };
    }
    const { active, dx, dy } = joystickStateRef.current;
    if (isMobile || active) {
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
    const mouseDx = inputRef.current.mouseX - view.vw / 2;
    const mouseDy = inputRef.current.mouseY - view.vh / 2;
    const angle = Math.atan2(mouseDy, mouseDx);
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
    frameRef.current.last = 0;
    frameRef.current.acc = 0;
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

      if (OFFLINE_MODE) {
        frame.acc += dt;
        let steps = 0;
        while (frame.acc >= frame.step && steps < 5) {
          frame.acc -= frame.step;
          runOfflineTick();
          steps += 1;
        }
        if (steps >= 5) {
          frame.acc = 0;
        }
      }
      draw(time, dt);
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

  const draw = (now: number, frameDtMs: number): void => {
    const context = contextRef.current;
    if (!context) {
      return;
    }
    const dtSec = clamp(frameDtMs / 1000, 0.001, 0.05);
    const view = viewRef.current;
    const state = stateRef.current;
    const renderNow = now - NET.interpDelayMs;
    const meRaw = playerIdRef.current ? state.snakes.get(playerIdRef.current) : undefined;
    const me = meRaw ? getInterpolatedSnake(meRaw, renderNow, NET.maxExtrapMs) : null;
    const baseZoom = inputRef.current.zoom * (isMobile ? MOBILE_ZOOM_OUT_FACTOR : 1);

    if (me) {
      const camLerp = 1 - Math.exp(-dtSec * (me.b ? 9.6 : 13.8));
      view.camX += (me.rx - view.camX) * camLerp;
      view.camY += (me.ry - view.camY) * camLerp;
      const dyn = clamp(1 / (1 + me.rm / 260), 0.35, 1.0);
      const zoomTarget = dyn * baseZoom;
      const zoomLerp = 1 - Math.exp(-dtSec * 8.2);
      view.scale += (zoomTarget - view.scale) * zoomLerp;
    } else {
      const zoomLerp = 1 - Math.exp(-dtSec * 8.2);
      view.scale += (baseZoom - view.scale) * zoomLerp;
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

    drawWorldBorder(context, state.worldRadius, view, now);
    drawPellets(context, state, view, sprites);
    drawSnakes(context, state, view, me?.id, renderNow, snakeSpriteCacheRef.current);

    const vignette = vignetteRef.current;
    if (vignette) {
      context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      context.globalAlpha = 0.9;
      context.drawImage(vignette, 0, 0, view.vw, view.vh);
      context.globalAlpha = 1;
    }
  };

  const startCashoutCountdown = (): void => {
    stopCashoutCountdown();
    cashoutCountdownRef.current = window.setInterval(() => {
      if (!cashoutHoldRef.current.active || !cashoutHoldRef.current.startedAt) {
        stopCashoutCountdown();
        return;
      }
      const elapsed = performance.now() - cashoutHoldRef.current.startedAt;
      const remaining = Math.max(0, CASHOUT_HOLD_MS - elapsed);
      setCashoutHold(Math.ceil(remaining));
    }, 50);
  };

  const stopCashoutCountdown = (): void => {
    if (cashoutCountdownRef.current) {
      window.clearInterval(cashoutCountdownRef.current);
      cashoutCountdownRef.current = null;
    }
  };

  const setupInputHandlers = (): (() => void) => {
    const handlePointerMove = (event: PointerEvent) => {
      if (overlayOpenRef.current) {
        return;
      }
      if (event.pointerType === 'touch') {
        return;
      }
      inputRef.current.mouseX = event.clientX;
      inputRef.current.mouseY = event.clientY;
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (overlayOpenRef.current || cashoutHoldRef.current.active) {
        return;
      }
      if (event.pointerType === 'touch') {
        return;
      }
      inputRef.current.boost = true;
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (overlayOpenRef.current || cashoutHoldRef.current.active) {
        return;
      }
      if (event.pointerType === 'touch') {
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
      const context =
        contextRef.current ?? canvas.getContext('2d', { alpha: false, desynchronized: true });
      if (context) {
        contextRef.current = context;
        context.imageSmoothingEnabled = true;
        context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      }
      vignetteRef.current = buildVignette(Math.max(1, Math.floor(view.vw)), Math.max(1, Math.floor(view.vh)));
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
              <div className="game-panel__title">Cashout</div>
              <div className="game-panel__value">
                {(cashoutHold / 1000).toFixed(1)}s
              </div>
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

        {!isMobile ? (
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
        ) : null}

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
  maxPoints: number,
): SnapshotPayload {
  const players = engine.getSnapshotPlayers(maxPoints).map((player) => mapOfflinePlayer(player));
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

function drawWorldBorder(
  context: CanvasRenderingContext2D,
  radius: number,
  view: { vw: number; vh: number; scale: number; camX: number; camY: number },
  nowMs: number,
): void {
  const halfW = (view.vw / 2) / view.scale;
  const halfH = (view.vh / 2) / view.scale;
  const visibleR = Math.hypot(halfW, halfH) + 40;
  const camDist = Math.hypot(view.camX, view.camY);
  if (camDist + visibleR < radius - 40) {
    return;
  }

  const boundsMinX = view.camX - halfW;
  const boundsMaxX = view.camX + halfW;
  const boundsMinY = view.camY - halfH;
  const boundsMaxY = view.camY + halfH;
  const corners: Array<[number, number]> = [
    [boundsMinX, boundsMinY],
    [boundsMaxX, boundsMinY],
    [boundsMaxX, boundsMaxY],
    [boundsMinX, boundsMaxY],
  ];
  let hasOutside = false;
  for (const [x, y] of corners) {
    if (x * x + y * y > radius * radius) {
      hasOutside = true;
      break;
    }
  }

  if (hasOutside) {
    context.save();
    context.fillStyle = 'rgba(0,0,0,0.34)';
    context.beginPath();
    context.rect(boundsMinX, boundsMinY, boundsMaxX - boundsMinX, boundsMaxY - boundsMinY);
    context.moveTo(radius, 0);
    context.arc(0, 0, radius, 0, Math.PI * 2, true);
    context.fill('evenodd');
    context.restore();
  }

  const pulse = 0.56 + Math.sin(nowMs * 0.00135) * 0.1;
  context.save();
  context.strokeStyle = `rgba(255, 74, 74, ${pulse})`;
  context.lineWidth = 14;
  context.shadowColor = 'rgba(255, 60, 60, 0.45)';
  context.shadowBlur = 14;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.stroke();
  context.restore();

  context.strokeStyle = 'rgba(255, 210, 210, 0.62)';
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
  view: { scale: number; camX: number; camY: number },
  selfId?: string,
  renderNow?: number,
  spriteCache?: Map<string, SnakeSprite>,
): void {
  const cache = spriteCache ?? new Map<string, SnakeSprite>();
  const renderTime = typeof renderNow === 'number' ? renderNow : performance.now();
  for (const snake of state.drawSnakes) {
    const rs = getInterpolatedSnake(snake, renderTime, NET.maxExtrapMs);
    if (!rs) {
      continue;
    }
    const pts = rs.rp;
    if (!pts || pts.length < 4) {
      continue;
    }

    const dxCam = rs.rx - view.camX;
    const dyCam = rs.ry - view.camY;
    const dist2Cam = dxCam * dxCam + dyCam * dyCam;
    let pointStep = 1;
    if (view.scale < 0.75 && pts.length > 140) {
      pointStep = 2;
    }
    if (view.scale < 0.55 || dist2Cam > 1800 * 1800) {
      pointStep = Math.max(pointStep, 3);
    }
    if (view.scale < 0.45 || dist2Cam > 2500 * 2500) {
      pointStep = Math.max(pointStep, 4);
    }

    const skinMono = !!selfId && rs.id === selfId;

    for (let i = pts.length - 2; i >= 2; i -= 2 * pointStep) {
      const segX = pts[i];
      const segY = pts[i + 1];
      const ratio = i / Math.max(2, pts.length - 2);
      const segRadius = rs.rr * (skinMono ? 0.84 + 0.14 * (1 - ratio) : 0.76 + 0.2 * (1 - ratio));
      const sprite = getSnakeSegmentSprite(cache, rs.h, segRadius, false, skinMono);
      const half = sprite.size * 0.5;
      context.drawImage(sprite.canvas, segX - half, segY - half, sprite.size, sprite.size);
    }

    const hx = pts[pts.length - 2];
    const hy = pts[pts.length - 1];
    const headSprite = getSnakeSegmentSprite(cache, rs.h, rs.rr * 1.12, true, skinMono);
    const headHalf = headSprite.size * 0.5;
    context.drawImage(headSprite.canvas, hx - headHalf, hy - headHalf, headSprite.size, headSprite.size);

    const ang = rs.ra || 0;
    const ex = Math.cos(ang);
    const ey = Math.sin(ang);
    const px = -ey;
    const py = ex;

    const eyeOff = rs.rr * 0.55;
    const eyeFwd = rs.rr * 0.55;
    const e1x = hx + ex * eyeFwd + px * eyeOff;
    const e1y = hy + ey * eyeFwd + py * eyeOff;
    const e2x = hx + ex * eyeFwd - px * eyeOff;
    const e2y = hy + ey * eyeFwd - py * eyeOff;

    context.fillStyle = 'rgba(0,0,0,0.55)';
    context.beginPath();
    context.arc(e1x + rs.rr * 0.03, e1y + rs.rr * 0.05, rs.rr * 0.26, 0, Math.PI * 2);
    context.arc(e2x + rs.rr * 0.03, e2y + rs.rr * 0.05, rs.rr * 0.26, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(e1x, e1y, rs.rr * 0.23, 0, Math.PI * 2);
    context.arc(e2x, e2y, rs.rr * 0.23, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = '#111111';
    context.beginPath();
    context.arc(e1x + ex * rs.rr * 0.08, e1y + ey * rs.rr * 0.08, rs.rr * 0.09, 0, Math.PI * 2);
    context.arc(e2x + ex * rs.rr * 0.08, e2y + ey * rs.rr * 0.08, rs.rr * 0.09, 0, Math.PI * 2);
    context.fill();

    if (skinMono) {
      context.fillStyle = 'rgba(255,255,255,0.8)';
      context.font = `${14 / Math.max(0.45, view.scale)}px system-ui`;
      context.textAlign = 'center';
      context.fillText('voce', hx, hy - rs.rr * 2.2);
    }
  }
}

function getInterpolatedSnake(
  snake: SnakeEntry,
  renderNow: number,
  maxExtrapMs: number,
): SnakeEntry | null {
  const prev = snake.prevSnap;
  const next = snake.nextSnap;
  if (!prev || !next) {
    return null;
  }

  let t = 1;
  if (next.t > prev.t) {
    t = (renderNow - prev.t) / (next.t - prev.t);
  }
  const maxExtrapT = next.t > prev.t ? maxExtrapMs / (next.t - prev.t) : 0;
  t = clamp(t, 0, 1 + maxExtrapT);

  const x = lerp(prev.x, next.x, t);
  const y = lerp(prev.y, next.y, t);
  const a = lerpAngle(prev.a, next.a, t);
  const m = lerp(prev.m, next.m, t);
  const r = lerp(prev.r, next.r, t);

  const prevP = prev.p;
  const nextP = next.p;
  let points: number[] | null = null;

  if (prevP && nextP && prevP.length >= 4 && prevP.length === nextP.length) {
    const out = ensureRenderPointBuffer(snake, prevP.length);
    for (let i = 0; i < prevP.length; i += 1) {
      out[i] = lerp(prevP[i], nextP[i], t);
    }
    points = out;
  } else {
    const src = (nextP && nextP.length >= 4)
      ? nextP
      : (prevP && prevP.length >= 4)
        ? prevP
        : snake.lastFullPoints;
    if (!src || src.length < 4) {
      return null;
    }
    const out = ensureRenderPointBuffer(snake, src.length);
    const refX = src === nextP ? next.x : src === prevP ? prev.x : snake.lastFullX;
    const refY = src === nextP ? next.y : src === prevP ? prev.y : snake.lastFullY;
    const dx = x - refX;
    const dy = y - refY;
    for (let i = 0; i < src.length; i += 2) {
      out[i] = src[i] + dx;
      out[i + 1] = src[i + 1] + dy;
    }
    points = out;
  }

  snake.rx = x;
  snake.ry = y;
  snake.ra = a;
  snake.rm = m;
  snake.rr = r;
  snake.rp = points;
  return snake;
}

function ensureRenderPointBuffer(snake: SnakeEntry, len: number): number[] {
  if (!snake.renderPoints || snake.renderPoints.length !== len) {
    snake.renderPoints = new Array<number>(len);
  }
  return snake.renderPoints;
}

function getSnakeSegmentSprite(
  cache: Map<string, SnakeSprite>,
  hue: number,
  radius: number,
  isHead: boolean,
  monoSkin: boolean,
): SnakeSprite {
  const quantizedRadius = Math.max(5, Math.round(radius * 2) / 2);
  const hueKey = ((Math.round(hue) % 360) + 360) % 360;
  const key = `${monoSkin ? 'mono' : 't'}|${hueKey}|${quantizedRadius}|${isHead ? 'h' : 'b'}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const margin = Math.ceil(quantizedRadius * (monoSkin ? 0.92 : 0.6));
  const size = Math.ceil((quantizedRadius + margin) * 2);
  const center = size * 0.5;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) {
    const fallback = { canvas, size };
    cache.set(key, fallback);
    return fallback;
  }

  const r = quantizedRadius;
  const shadowOffset = r * (monoSkin ? 0.15 : 0.12);
  g.fillStyle = monoSkin ? 'rgba(0,0,0,0.24)' : 'rgba(0,0,0,0.30)';
  g.beginPath();
  g.arc(center + shadowOffset, center + shadowOffset, r * 1.02, 0, Math.PI * 2);
  g.fill();

  if (monoSkin) {
    const glow = g.createRadialGradient(center, center, r * 0.35, center, center, r * 1.55);
    glow.addColorStop(0, 'rgba(255,255,255,0.42)');
    glow.addColorStop(0.68, 'rgba(255,255,255,0.12)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(center, center, r * 1.55, 0, Math.PI * 2);
    g.fill();

    const base = g.createRadialGradient(
      center - r * 0.36,
      center - r * 0.42,
      r * 0.08,
      center,
      center,
      r,
    );
    base.addColorStop(0, '#ffffff');
    base.addColorStop(0.36, '#eeeeee');
    base.addColorStop(0.7, '#cfcfcf');
    base.addColorStop(1, '#9e9e9e');
    g.fillStyle = base;
    g.beginPath();
    g.arc(center, center, r, 0, Math.PI * 2);
    g.fill();

    const shade = g.createRadialGradient(
      center + r * 0.44,
      center + r * 0.44,
      r * 0.08,
      center + r * 0.42,
      center + r * 0.42,
      r * 1.1,
    );
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(0.72, 'rgba(0,0,0,0.08)');
    shade.addColorStop(1, 'rgba(0,0,0,0.32)');
    g.fillStyle = shade;
    g.beginPath();
    g.arc(center, center, r, 0, Math.PI * 2);
    g.fill();

    g.globalAlpha = 0.8;
    g.strokeStyle = 'rgba(72,72,72,0.62)';
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.arc(center, center, r * 0.93, 0, Math.PI * 2);
    g.stroke();

    g.globalAlpha = 0.62;
    g.strokeStyle = 'rgba(255,255,255,0.62)';
    g.lineWidth = Math.max(1, r * 0.12);
    g.beginPath();
    g.arc(center - r * 0.08, center - r * 0.09, r * 0.6, Math.PI * 1.04, Math.PI * 1.86);
    g.stroke();
  } else {
    const light = `hsl(${hueKey}, 88%, 72%)`;
    const mid = `hsl(${hueKey}, 90%, 58%)`;
    const dark = `hsl(${hueKey}, 84%, 42%)`;
    const rim = `hsla(${hueKey}, 95%, 34%, 0.85)`;
    const base = g.createRadialGradient(
      center - r * 0.35,
      center - r * 0.4,
      r * 0.12,
      center,
      center,
      r,
    );
    base.addColorStop(0, light);
    base.addColorStop(0.45, mid);
    base.addColorStop(1, dark);
    g.fillStyle = base;
    g.beginPath();
    g.arc(center, center, r, 0, Math.PI * 2);
    g.fill();

    g.strokeStyle = rim;
    g.lineWidth = Math.max(1, r * 0.14);
    g.globalAlpha = 0.72;
    g.beginPath();
    g.arc(center, center, r * 0.94, 0, Math.PI * 2);
    g.stroke();

    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = Math.max(1, r * 0.1);
    g.globalAlpha = 0.58;
    g.beginPath();
    g.arc(center - r * 0.1, center - r * 0.12, r * 0.58, Math.PI * 1.03, Math.PI * 1.86);
    g.stroke();
  }

  if (isHead) {
    g.globalAlpha = monoSkin ? 0.28 : 0.33;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(center - r * 0.28, center - r * 0.34, r * 0.44, 0, Math.PI * 2);
    g.fill();
  }

  g.globalAlpha = 1;
  const sprite = { canvas, size };
  cache.set(key, sprite);
  return sprite;
}

function drawHexPath(context: CanvasRenderingContext2D, cx: number, cy: number, side: number): void {
  const hw = (Math.sqrt(3) * side) / 2;
  context.beginPath();
  context.moveTo(cx, cy - side);
  context.lineTo(cx + hw, cy - side * 0.5);
  context.lineTo(cx + hw, cy + side * 0.5);
  context.lineTo(cx, cy + side);
  context.lineTo(cx - hw, cy + side * 0.5);
  context.lineTo(cx - hw, cy - side * 0.5);
  context.closePath();
}

function buildHexTile(size: number): HTMLCanvasElement {
  const side = size;
  const hexW = Math.sqrt(3) * side;
  const stepY = side * 1.5;
  const tileW = Math.ceil(hexW * 2);
  const tileH = Math.ceil(stepY * 2);
  const canvas = document.createElement('canvas');
  canvas.width = tileW;
  canvas.height = tileH;
  const g = canvas.getContext('2d');
  if (!g) {
    return canvas;
  }

  g.fillStyle = '#070d1d';
  g.fillRect(0, 0, tileW, tileH);

  g.strokeStyle = '#1a263f';
  g.lineWidth = 2;
  g.globalAlpha = 0.82;
  for (let row = -1; row < 5; row += 1) {
    const cy = row * stepY + side;
    const offset = row % 2 === 0 ? 0 : hexW * 0.5;
    for (let col = -1; col < 5; col += 1) {
      const cx = col * hexW + offset;
      drawHexPath(g, cx, cy, side);
      g.stroke();
    }
  }

  g.strokeStyle = 'rgba(180,210,255,0.08)';
  g.lineWidth = 1;
  g.globalAlpha = 0.5;
  for (let row = -1; row < 5; row += 1) {
    const cy = row * stepY + side;
    const offset = row % 2 === 0 ? 0 : hexW * 0.5;
    for (let col = -1; col < 5; col += 1) {
      const cx = col * hexW + offset;
      drawHexPath(g, cx, cy, side * 0.8);
      g.stroke();
    }
  }

  g.globalAlpha = 1;
  return canvas;
}

function createGridPattern(context: CanvasRenderingContext2D): CanvasPattern {
  const tile = buildHexTile(38);
  return context.createPattern(tile, 'repeat')!;
}

function buildVignette(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const g = canvas.getContext('2d');
  if (!g) {
    return canvas;
  }
  const cx = width * 0.5;
  const cy = height * 0.5;
  const radius = Math.hypot(width, height) * 0.58;
  const grad = g.createRadialGradient(cx, cy, radius * 0.05, cx, cy, radius);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.62, 'rgba(0,0,0,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);
  return canvas;
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

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  return a + angleDiff(a, b) * t;
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

function computePayoutCents(stakeCents: number, multiplier: number): number {
  if (!Number.isFinite(stakeCents) || !Number.isFinite(multiplier)) {
    return 0;
  }
  const gross = Math.floor(stakeCents * multiplier);
  const fee = Math.floor((gross * CASHOUT_FEE_BPS) / 10000);
  return Math.max(0, gross - fee);
}
