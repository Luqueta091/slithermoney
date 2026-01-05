#!/usr/bin/env node

const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const url = process.env.LOAD_GAME_URL ?? 'ws://localhost:4000';
const clients = parseInt(process.env.LOAD_CLIENTS ?? '50', 10);
const durationMs = parseInt(process.env.LOAD_DURATION_MS ?? '10000', 10);
const inputIntervalMs = parseInt(process.env.LOAD_INPUT_INTERVAL_MS ?? '100', 10);
const protocolVersion = parseInt(process.env.LOAD_PROTOCOL_VERSION ?? '3', 10);
const runId = process.env.LOAD_RUN_ID ?? randomUUID();

if (!Number.isInteger(clients) || clients <= 0) {
  throw new Error('LOAD_CLIENTS must be a positive integer');
}

let connected = 0;
let joined = 0;
let errors = 0;
let inputAcks = 0;
let snapshots = 0;
let inputsSent = 0;

const sockets = [];
const intervals = new Map();

function send(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }
  socket.send(JSON.stringify(message));
}

function startInputLoop(socket, state) {
  const interval = setInterval(() => {
    state.seq += 1;
    send(socket, {
      type: 'INPUT',
      payload: {
        seq: state.seq,
        client_time_ms: Date.now(),
        direction: { x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 },
        boost: Math.random() > 0.8,
      },
    });
    inputsSent += 1;
  }, inputIntervalMs);

  intervals.set(socket, interval);
}

function stopInputLoop(socket) {
  const interval = intervals.get(socket);
  if (interval) {
    clearInterval(interval);
    intervals.delete(socket);
  }
}

for (let i = 0; i < clients; i += 1) {
  const socket = new WebSocket(url);
  const state = { seq: 0, joined: false };

  socket.on('open', () => {
    connected += 1;
    send(socket, {
      type: 'HELLO',
      payload: {
        protocol_version: protocolVersion,
        run_id: runId,
      },
    });
  });

  socket.on('message', (data) => {
    let parsed = null;
    try {
      parsed = JSON.parse(typeof data === 'string' ? data : data.toString('utf8'));
    } catch {
      return;
    }

    if (!parsed || typeof parsed.type !== 'string') {
      return;
    }

    if (parsed.type === 'WELCOME') {
      send(socket, {
        type: 'JOIN',
        payload: {
          run_id: runId,
          desired_skin: 'default',
        },
      });
      return;
    }

    if (parsed.type === 'JOINED' && !state.joined) {
      state.joined = true;
      joined += 1;
      startInputLoop(socket, state);
      return;
    }

    if (parsed.type === 'INPUT_ACK') {
      inputAcks += 1;
      return;
    }

    if (parsed.type === 'SNAPSHOT') {
      snapshots += 1;
      return;
    }

    if (parsed.type === 'ERROR') {
      errors += 1;
      return;
    }
  });

  socket.on('error', () => {
    errors += 1;
  });

  socket.on('close', () => {
    stopInputLoop(socket);
  });

  sockets.push(socket);
}

setTimeout(() => {
  sockets.forEach((socket) => {
    stopInputLoop(socket);
    socket.close();
  });

  const summary = {
    url,
    clients,
    durationMs,
    connected,
    joined,
    inputsSent,
    inputAcks,
    snapshots,
    errors,
  };

  console.log(JSON.stringify(summary, null, 2));
}, durationMs);
