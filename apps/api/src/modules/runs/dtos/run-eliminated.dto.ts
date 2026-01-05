import { z } from 'zod';
import { RUN_EVENT_VERSION } from '@slithermoney/contracts';
import type { RunEliminatedEventPayload } from '@slithermoney/contracts';

export const runEliminatedInputSchema = z.object({
  runId: z.string().uuid(),
  eventVersion: z.literal(RUN_EVENT_VERSION),
  reason: z.string().min(1).optional(),
  sizeScore: z.number().int().nonnegative().optional(),
  multiplier: z.number().positive().optional(),
});

export type RunEliminatedInput = RunEliminatedEventPayload;

export type RunEliminatedResponse = {
  run_id: string;
  status: string;
  result_reason: string | null;
  ended_at: Date | null;
};
