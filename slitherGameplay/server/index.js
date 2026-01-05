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

// game loop
const dt = 1 / game.tickRate;
const intervalMs = Math.round(1000 / game.tickRate);

setInterval(() => {
  game.update(dt);
  const payload = game.buildStatePayload();
  const str = JSON.stringify(payload);

  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN && ws._joined) {
      ws.send(str);
    }
  }
}, intervalMs);
