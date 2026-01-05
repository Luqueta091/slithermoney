export type Vector2 = {
  x: number;
  y: number;
};

export const REALTIME_PROTOCOL_VERSION = 3;
export const RUN_EVENT_VERSION = 1;

export type HelloPayload = {
  run_id?: string;
  join_token?: string;
  protocol_version?: number;
};

export type JoinPayload = {
  run_id?: string;
  desired_skin?: string;
};

export type InputPayload = {
  seq: number;
  client_time_ms?: number;
  direction?: Vector2;
  boost?: boolean;
};

export type SnapshotPlayer = {
  id: string;
  name?: string;
  x: number;
  y: number;
  angle?: number;
  boost: boolean;
  size_score: number;
  multiplier: number;
  color: string;
  radius?: number;
  hue?: number;
  segments: Vector2[];
};

export type SnapshotPellet = {
  id: string;
  x: number;
  y: number;
  value: number;
  radius?: number;
  hue?: number;
};

export type PelletEvent =
  | {
      type: 'spawn';
      pellet: SnapshotPellet;
    }
  | {
      type: 'delete';
      id: string;
    };

export type SnapshotPayload = {
  tick: number;
  room_id: string;
  players: SnapshotPlayer[];
  pellets?: SnapshotPellet[];
  pellet_events?: PelletEvent[];
  world_radius?: number;
};

export type WelcomePayload = {
  player_id: string;
  tick_rate: number;
  snapshot_rate: number;
};

export type JoinedPayload = {
  room_id: string;
  seed: string;
  spawn_position: Vector2;
};

export type InputAckPayload = {
  last_processed_seq: number;
};

export type CashoutRequestPayload = {
  run_id?: string;
};

export type CashoutHoldPayload = {
  hold_ms: number;
};

export type CashoutResultPayload = {
  run_id: string;
  multiplier: number;
  status: 'ok' | 'failed';
};

export type EliminatedPayload = {
  run_id?: string;
  reason?: string;
};

export type RunEliminatedEventPayload = {
  runId: string;
  eventVersion: typeof RUN_EVENT_VERSION;
  reason?: string;
  sizeScore?: number;
  multiplier?: number;
};

export type RunCashoutEventPayload = {
  runId: string;
  eventVersion: typeof RUN_EVENT_VERSION;
  multiplier: number;
  sizeScore?: number;
};

export type ErrorPayload = {
  code: string;
  message: string;
};
