import { describe, expect, it } from 'vitest';
import { RUN_EVENT_VERSION } from '@slithermoney/contracts';
import { runCashoutInputSchema } from './run-cashout.dto';
import { runEliminatedInputSchema } from './run-eliminated.dto';

describe('run event schemas', () => {
  it('accepts contract payloads', () => {
    const eliminated = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      eventVersion: RUN_EVENT_VERSION,
      reason: 'disconnect',
      sizeScore: 42,
      multiplier: 1.2,
    };

    const cashout = {
      runId: '550e8400-e29b-41d4-a716-446655440000',
      eventVersion: RUN_EVENT_VERSION,
      multiplier: 1.5,
      sizeScore: 120,
    };

    expect(runEliminatedInputSchema.parse(eliminated)).toEqual(eliminated);
    expect(runCashoutInputSchema.parse(cashout)).toEqual(cashout);
  });
});
