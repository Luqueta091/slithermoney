import type {
  CashoutHoldPayload,
  CashoutRequestPayload,
  CashoutResultPayload,
  EliminatedPayload,
  HelloPayload,
  InputPayload,
  JoinPayload,
  SnapshotPellet,
  SnapshotPayload,
  Vector2,
} from '@slithermoney/contracts';

export type {
  CashoutHoldPayload,
  CashoutRequestPayload,
  CashoutResultPayload,
  EliminatedPayload,
  HelloPayload,
  InputPayload,
  JoinPayload,
  SnapshotPellet,
  SnapshotPayload,
  Vector2,
};

export type ClientMessage = {
  type: string;
  payload?: unknown;
};

export type ServerMessage<T = unknown> = {
  type: string;
  payload?: T;
};
