import { z } from 'zod';
import { RUN_EVENT_VERSION } from '@slithermoney/contracts';
import type { RunCashoutEventPayload } from '@slithermoney/contracts';

export const runCashoutInputSchema = z.object({
  runId: z.string().uuid(),
  eventVersion: z.literal(RUN_EVENT_VERSION),
  multiplier: z.number().positive(),
  sizeScore: z.number().int().nonnegative().optional(),
});

export type RunCashoutInput = RunCashoutEventPayload;

export type RunCashoutResponse = {
  run_id: string;
  status: string;
  payout_cents: string;
  house_fee_cents: string;
  multiplier: number;
  ended_at: Date | null;
};
