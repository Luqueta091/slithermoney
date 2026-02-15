import http from 'http';
import { URL } from 'url';
import { randomUUID } from 'crypto';
import type { IncomingMessage } from 'http';
import WebSocket, { RawData, WebSocketServer } from 'ws';
import { verifyToken } from '@slithermoney/shared';
import { config } from './shared/config';
import { logger } from './shared/observability/logger';
import { ArenaManager } from './modules/realtime';
import { parseMessage, sendError, sendMessage } from './modules/realtime/message';
import { CashoutRequestPayload, HelloPayload, InputPayload, JoinPayload } from './modules/realtime/types';
import { notifyRunCashout, notifyRunEliminated } from './modules/realtime/run-events';

const arenaManager = new ArenaManager({
  roomCapacity: config.ROOM_CAPACITY,
  tickRate: config.TICK_RATE,
  snapshotRate: config.SNAPSHOT_RATE,
  npcOnly: config.NPC_ONLY,
  botCount: config.BOT_COUNT,
  worldRadius: config.WORLD_RADIUS,
  pelletTarget: config.PELLET_TARGET,
  maxPellets: config.MAX_PELLETS,
  maxSendPoints: config.MAX_SEND_POINTS,
  boostDropSpacing: config.BOOST_DROP_SPACING,
  deathPelletTarget: config.DEATH_PELLET_TARGET,
});

const connections = new Map<WebSocket, ConnectionContext>();
const connectionsByPlayerId = new Map<string, ConnectionContext>();
const disconnectTimestamps: number[] = [];
let connectionsTotal = 0;
let disconnectsTotal = 0;

function recordDisconnect(): void {
  const now = Date.now();
  disconnectsTotal += 1;
  disconnectTimestamps.push(now);
  pruneDisconnects(now);
}

function getDisconnectsPerMinute(): number {
  const now = Date.now();
  pruneDisconnects(now);
  return disconnectTimestamps.length;
}

function pruneDisconnects(now: number): void {
  const cutoff = now - 60_000;
  while (disconnectTimestamps.length > 0 && disconnectTimestamps[0] < cutoff) {
    disconnectTimestamps.shift();
  }
}

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://localhost:${config.PORT}`);

  if (method === 'GET' && url.pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
      }),
    );
    return;
  }

  if (method === 'GET' && url.pathname === '/metrics') {
    if (!canAccessMetrics(req)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    const metrics = arenaManager.getMetrics();
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
        connectionsTotal,
        disconnectsTotal,
        disconnectsPerMinute: getDisconnectsPerMinute(),
        ...metrics,
      }),
    );
    return;
  }

  if (method === 'GET' && url.pathname === '/') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ message: 'game-server ok' }));
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found' }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  const connectionId = randomUUID();
  const playerId = randomUUID();
  connectionsTotal += 1;
  const context: ConnectionContext = {
    id: connectionId,
    playerId,
    socket,
    state: 'connected',
    lastPongAt: Date.now(),
    cashoutState: 'idle',
  };

  connections.set(socket, context);
  connectionsByPlayerId.set(playerId, context);

  logger.info('player_connected', {
    connection_id: connectionId,
    player_id: playerId,
    ip: req.socket.remoteAddress,
  });

  socket.on('pong', () => {
    context.lastPongAt = Date.now();
  });

  socket.on('message', (data: RawData) => {
    const message = parseMessage(data);
    if (!message) {
      sendError(socket, 'invalid_message', 'Mensagem invalida');
      return;
    }

    switch (message.type) {
      case 'HELLO':
        handleHello(context, message.payload as HelloPayload | undefined);
        break;
      case 'JOIN':
        handleJoin(context, message.payload as JoinPayload | undefined);
        break;
      case 'INPUT':
        handleInput(context, message.payload as InputPayload | undefined);
        break;
      case 'CASHOUT_REQUEST':
        handleCashoutRequest(context, message.payload as CashoutRequestPayload | undefined);
        break;
      default:
        sendError(socket, 'unknown_message', 'Tipo de mensagem desconhecido');
        break;
    }
  });

  socket.on('close', (code: number, reason: Buffer) => {
    const stats = arenaManager.getPlayerStats(playerId);
    const runId = context.runId;
    if (context.cashoutTimer && context.cashoutState !== 'holding') {
      clearTimeout(context.cashoutTimer);
    }

    connections.delete(socket);
    connectionsByPlayerId.delete(playerId);
    arenaManager.removePlayer(playerId);
    recordDisconnect();

    if (
      runId &&
      context.state === 'joined' &&
      context.cashoutState === 'idle' &&
      !context.wasEliminated
    ) {
      void notifyRunEliminated({
        runId,
        reason: 'disconnect',
        sizeScore: stats?.sizeScore,
        multiplier: stats?.multiplier,
      });
    }

    logger.info('player_disconnected', {
      connection_id: connectionId,
      player_id: playerId,
      code,
      reason: reason.toString(),
    });
  });

  socket.on('error', (error: Error) => {
    logger.error('player_socket_error', {
      connection_id: connectionId,
      player_id: playerId,
      error: error.message,
    });
  });
});

server.listen(config.PORT, () => {
  logger.info('server_started', {
    port: config.PORT,
    service: config.SERVICE_NAME,
    version: config.APP_VERSION,
  });
});

const tickInterval = setInterval(() => {
  const eliminations = arenaManager.tick();
  for (const eliminated of eliminations) {
    const context = connectionsByPlayerId.get(eliminated.playerId);
    if (context) {
      context.wasEliminated = true;
      context.state = 'ended';
      sendMessage(context.socket, {
        type: 'ELIMINATED',
        payload: {
          run_id: eliminated.runId,
          reason: eliminated.reason,
        },
      });
      context.socket.close(1000, 'eliminated');
    }

    if (eliminated.runId) {
      void notifyRunEliminated({
        runId: eliminated.runId,
        reason: eliminated.reason,
        sizeScore: eliminated.sizeScore,
        multiplier: eliminated.multiplier,
      });
    }
  }
}, 1000 / config.TICK_RATE);

const pingInterval = setInterval(() => {
  const now = Date.now();

  for (const context of connections.values()) {
    if (now - context.lastPongAt > config.PONG_TIMEOUT_MS) {
      context.socket.terminate();
      continue;
    }

    if (context.socket.readyState === WebSocket.OPEN) {
      context.socket.ping();
    }
  }
}, config.PING_INTERVAL_MS);

const shutdown = (signal: string) => {
  clearInterval(tickInterval);
  clearInterval(pingInterval);
  server.close(() => {
    logger.info('server_shutdown', { signal });
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function canAccessMetrics(req: IncomingMessage): boolean {
  if (config.NODE_ENV !== 'production') {
    return true;
  }
  if (!config.METRICS_INTERNAL_ENABLED) {
    return false;
  }
  const header = req.headers['x-metrics-key'];
  const key = Array.isArray(header) ? header[0] : header;
  return Boolean(key && key === config.METRICS_INTERNAL_KEY);
}

type ConnectionContext = {
  id: string;
  playerId: string;
  socket: WebSocket;
  state: 'connected' | 'hello' | 'joined' | 'ended';
  runId?: string;
  lastPongAt: number;
  cashoutState: 'idle' | 'holding' | 'done';
  cashoutTimer?: NodeJS.Timeout;
  pendingCashout?: {
    runId: string;
    multiplier: number;
    sizeScore: number;
  };
  wasEliminated?: boolean;
};

function handleHello(context: ConnectionContext, payload?: HelloPayload): void {
  if (context.state !== 'connected') {
    return;
  }

  if (payload?.protocol_version && payload.protocol_version !== config.PROTOCOL_VERSION) {
    sendError(context.socket, 'unsupported_protocol', 'Versao de protocolo invalida');
    return;
  }

  const joinToken = payload?.join_token;
  if (!joinToken) {
    sendError(context.socket, 'missing_join_token', 'join_token obrigatorio');
    context.socket.close(1008, 'missing join token');
    return;
  }

  const verified = verifyToken<{
    run_id?: string;
    account_id?: string;
    type?: string;
  }>(joinToken, config.RUN_JOIN_TOKEN_SECRET);

  if (!verified.ok || verified.payload.type !== 'join' || typeof verified.payload.run_id !== 'string') {
    sendError(context.socket, 'invalid_join_token', 'join_token invalido');
    context.socket.close(1008, 'invalid join token');
    return;
  }

  if (payload?.run_id && payload.run_id !== verified.payload.run_id) {
    sendError(context.socket, 'invalid_join_token', 'run_id divergente');
    context.socket.close(1008, 'run mismatch');
    return;
  }

  context.state = 'hello';
  context.runId = verified.payload.run_id;

  sendMessage(context.socket, {
    type: 'WELCOME',
    payload: {
      player_id: context.playerId,
      tick_rate: config.TICK_RATE,
      snapshot_rate: config.SNAPSHOT_RATE,
    },
  });
}

function handleJoin(context: ConnectionContext, payload?: JoinPayload): void {
  if (context.state === 'connected') {
    sendError(context.socket, 'missing_hello', 'HELLO obrigatorio antes do JOIN');
    return;
  }

  if (context.state === 'joined') {
    return;
  }

  if (payload?.run_id && context.runId && payload.run_id !== context.runId) {
    sendError(context.socket, 'invalid_join_token', 'run_id divergente');
    context.socket.close(1008, 'run mismatch');
    return;
  }

  const runId = payload?.run_id ?? context.runId;
  if (!runId) {
    sendError(context.socket, 'missing_run', 'Run_id obrigatorio');
    return;
  }
  const join = arenaManager.join(context.playerId, context.socket, runId, payload?.desired_skin);
  context.state = 'joined';
  context.runId = runId;

  sendMessage(context.socket, {
    type: 'JOINED',
    payload: {
      room_id: join.roomId,
      seed: join.seed,
      spawn_position: join.spawn,
    },
  });

  sendMessage(context.socket, { type: 'SNAPSHOT', payload: join.snapshot });
}

function handleInput(context: ConnectionContext, payload?: InputPayload): void {
  if (context.state !== 'joined' || context.cashoutState !== 'idle' || !payload) {
    return;
  }

  const lastSeq = arenaManager.handleInput(context.playerId, payload);
  if (lastSeq === null) {
    return;
  }

  sendMessage(context.socket, {
    type: 'INPUT_ACK',
    payload: {
      last_processed_seq: lastSeq,
    },
  });
}

function handleCashoutRequest(
  context: ConnectionContext,
  payload?: CashoutRequestPayload,
): void {
  if (context.state !== 'joined') {
    sendError(context.socket, 'invalid_state', 'Run não iniciada');
    return;
  }

  if (context.cashoutState !== 'idle') {
    return;
  }

  const runId = payload?.run_id ?? context.runId;
  if (!runId) {
    sendError(context.socket, 'missing_run', 'Run não encontrada');
    return;
  }

  const stats = arenaManager.getPlayerStats(context.playerId);
  if (!stats) {
    sendError(context.socket, 'run_not_found', 'Run não encontrada');
    return;
  }

  context.cashoutState = 'holding';
  context.runId = runId;
  context.pendingCashout = {
    runId,
    multiplier: stats.multiplier,
    sizeScore: stats.sizeScore,
  };
  context.state = 'ended';
  context.wasEliminated = true;
  arenaManager.removePlayer(context.playerId);

  sendMessage(context.socket, {
    type: 'CASHOUT_HOLD',
    payload: {
      hold_ms: config.CASHOUT_HOLD_MS,
    },
  });

  context.cashoutTimer = setTimeout(() => {
    const pendingCashout = context.pendingCashout;
    if (!pendingCashout) {
      context.cashoutState = 'idle';
      return;
    }

    context.cashoutState = 'done';
    void notifyRunCashout({
      runId: pendingCashout.runId,
      multiplier: pendingCashout.multiplier,
      sizeScore: pendingCashout.sizeScore,
    });

    if (context.socket.readyState === WebSocket.OPEN) {
      sendMessage(context.socket, {
        type: 'CASHOUT_RESULT',
        payload: {
          run_id: pendingCashout.runId,
          multiplier: pendingCashout.multiplier,
          status: 'ok',
        },
      });
    }

    context.pendingCashout = undefined;
    context.cashoutTimer = undefined;
  }, config.CASHOUT_HOLD_MS);
}
