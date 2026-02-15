import { z } from 'zod';

export const runOfflineCashoutInputSchema = z.object({
  runId: z.string().uuid(),
  multiplier: z.number().positive(),
  sizeScore: z.number().int().nonnegative().optional(),
});

export const runOfflineEliminatedInputSchema = z.object({
  runId: z.string().uuid(),
  reason: z.string().min(1),
  multiplier: z.number().positive().optional(),
  sizeScore: z.number().int().nonnegative().optional(),
});

export type RunOfflineCashoutInput = z.infer<typeof runOfflineCashoutInputSchema>;
export type RunOfflineEliminatedInput = z.infer<typeof runOfflineEliminatedInputSchema>;
