'use strict';

const path = require('path');
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { Game } = require('./game');

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// ======== Ajustes rápidos ========
// Apenas NPCs por enquanto (sem matchmaking / multiplayer real).
// Edite via env var: BOT_COUNT=20 npm start
const BOT_COUNT = process.env.BOT_COUNT ? Math.max(0, Number(process.env.BOT_COUNT)) : 20;
const ENABLE_BOTS = BOT_COUNT > 0;
const SNAPSHOT_RATE = process.env.SNAPSHOT_RATE ? Math.max(5, Number(process.env.SNAPSHOT_RATE)) : 15;
const SNAPSHOT_FULL_POINTS_EVERY = process.env.SNAPSHOT_FULL_POINTS_EVERY
  ? Math.max(1, Number(process.env.SNAPSHOT_FULL_POINTS_EVERY))
  : 3;

const SNAPSHOT_NEAR_POINTS = process.env.SNAPSHOT_NEAR_POINTS ? Math.max(24, Number(process.env.SNAPSHOT_NEAR_POINTS)) : 120;
const SNAPSHOT_MID_POINTS = process.env.SNAPSHOT_MID_POINTS ? Math.max(24, Number(process.env.SNAPSHOT_MID_POINTS)) : 80;
const SNAPSHOT_FAR_POINTS = process.env.SNAPSHOT_FAR_POINTS ? Math.max(24, Number(process.env.SNAPSHOT_FAR_POINTS)) : 40;
const SNAPSHOT_NEAR_DIST = process.env.SNAPSHOT_NEAR_DIST ? Math.max(300, Number(process.env.SNAPSHOT_NEAR_DIST)) : 900;
const SNAPSHOT_FAR_DIST = process.env.SNAPSHOT_FAR_DIST ? Math.max(600, Number(process.env.SNAPSHOT_FAR_DIST)) : 1900;
// =================================

const app = express();
app.use(express.static(path.join(__dirname, '..', 'client')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const game = new Game({
  worldRadius: 3000,
  tickRate: 30,
  pelletTarget: 4200,
  maxSendPoints: 140,
});
game.snapshotRate = SNAPSHOT_RATE;

if (ENABLE_BOTS) {
  for (let i = 0; i < BOT_COUNT; i++) game.addBot(`bot-${i + 1}`);
}

function safeSend(ws, obj) {
  if (ws.readyState !== WebSocket.OPEN) return;
  try {
    ws.send(JSON.stringify(obj));
  } catch (_) {}
}

wss.on('connection', (ws) => {
  ws._pid = 0;
  ws._joined = false;

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }

    if (!ws._joined) {
      if (msg.t === 'join') {
        const name = typeof msg.n === 'string' ? msg.n : 'anon';
        const pid = game.addPlayer(name);
        ws._pid = pid;
        ws._joined = true;
        safeSend(ws, game.buildInitPayload(pid));
      }
      return;
    }

    // inputs
    if (msg.t === 'input') {
      game.handleInput(ws._pid, { a: msg.a, b: msg.b });
    }
  });

  ws.on('close', () => {
    if (ws._joined) {
      game.removePlayer(ws._pid);
    }
  });
});

server.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});

// game loop (simulação e snapshot desacoplados)
const dt = 1 / game.tickRate;
const simIntervalMs = Math.round(1000 / game.tickRate);
const snapshotIntervalMs = Math.round(1000 / SNAPSHOT_RATE);
let snapshotSeq = 0;

setInterval(() => {
  game.update(dt);
}, simIntervalMs);

setInterval(() => {
  snapshotSeq += 1;
  const includePoints = snapshotSeq % SNAPSHOT_FULL_POINTS_EVERY === 0;
  const pelletEvents = game._flushPelletEvents();

  for (const ws of wss.clients) {
    if (ws.readyState !== WebSocket.OPEN || !ws._joined) continue;

    const payload = game.buildStatePayload({
      viewerId: ws._pid,
      includePoints,
      snapshotSeq,
      snapshotRate: SNAPSHOT_RATE,
      baseMaxPoints: game.maxSendPoints,
      nearMaxPoints: SNAPSHOT_NEAR_POINTS,
      midMaxPoints: SNAPSHOT_MID_POINTS,
      farMaxPoints: SNAPSHOT_FAR_POINTS,
      nearDist: SNAPSHOT_NEAR_DIST,
      farDist: SNAPSHOT_FAR_DIST,
      pelletEvents,
    });

    safeSend(ws, payload);
  }
}, snapshotIntervalMs);
