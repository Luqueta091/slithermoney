import { describe, expect, it } from 'vitest';
import {
  CashoutHoldPayload,
  CashoutRequestPayload,
  CashoutResultPayload,
  HelloPayload,
  InputPayload,
  JoinPayload,
  REALTIME_PROTOCOL_VERSION,
  RUN_EVENT_VERSION,
  RunCashoutEventPayload,
  RunEliminatedEventPayload,
  SnapshotPayload,
  WelcomePayload,
} from './realtime';

const helloExample: HelloPayload = {
  run_id: '550e8400-e29b-41d4-a716-446655440000',
  join_token: 'join-token',
  protocol_version: REALTIME_PROTOCOL_VERSION,
};

const joinExample: JoinPayload = {
  run_id: '550e8400-e29b-41d4-a716-446655440000',
  desired_skin: 'default',
};

const inputExample: InputPayload = {
  seq: 12,
  client_time_ms: 123456,
  direction: { x: 0.6, y: -0.8 },
  boost: true,
};

const snapshotExample: SnapshotPayload = {
  tick: 120,
  room_id: 'room-1',
  players: [
    {
      id: 'player-1',
      name: 'Ana Souza',
      x: 120,
      y: -45,
      angle: 1.2,
      boost: false,
      size_score: 140,
      multiplier: 1.25,
      color: '#FF6B4A',
      radius: 10,
      hue: 24,
      segments: [
        { x: 120, y: -45 },
        { x: 118, y: -46 },
        { x: 116, y: -47 },
      ],
    },
  ],
  pellets: [
    { id: 'pellet-1', x: 20, y: 40, value: 5, radius: 3.4, hue: 120 },
    { id: 'pellet-2', x: -80, y: -20, value: 10, radius: 3.4, hue: 220 },
  ],
  pellet_events: [
    { type: 'spawn', pellet: { id: 'pellet-3', x: 10, y: 12, value: 2, radius: 3.4, hue: 300 } },
    { type: 'delete', id: 'pellet-2' },
  ],
  world_radius: 3000,
};

const welcomeExample: WelcomePayload = {
  player_id: 'player-1',
  tick_rate: 20,
  snapshot_rate: 10,
};

const cashoutRequestExample: CashoutRequestPayload = {
  run_id: '550e8400-e29b-41d4-a716-446655440000',
};

const cashoutHoldExample: CashoutHoldPayload = {
  hold_ms: 1500,
};

const cashoutResultExample: CashoutResultPayload = {
  run_id: '550e8400-e29b-41d4-a716-446655440000',
  multiplier: 1.5,
  status: 'ok',
};

const runEliminatedExample: RunEliminatedEventPayload = {
  runId: '550e8400-e29b-41d4-a716-446655440000',
  eventVersion: RUN_EVENT_VERSION,
  reason: 'disconnect',
  sizeScore: 42,
  multiplier: 1.1,
};

const runCashoutExample: RunCashoutEventPayload = {
  runId: '550e8400-e29b-41d4-a716-446655440000',
  eventVersion: RUN_EVENT_VERSION,
  multiplier: 1.5,
  sizeScore: 120,
};

describe('realtime contracts', () => {
  it('matches snapshot examples', () => {
    expect({
      helloExample,
      joinExample,
      inputExample,
      snapshotExample,
      welcomeExample,
      cashoutRequestExample,
      cashoutHoldExample,
      cashoutResultExample,
      runEliminatedExample,
      runCashoutExample,
    }).toMatchSnapshot();
  });
});
