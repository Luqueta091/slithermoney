import { z } from 'zod';

export const runStartInputSchema = z.object({
  stakeCents: z.number().int().positive(),
});

export type RunStartInput = z.infer<typeof runStartInputSchema>;

export type RunStartResponse = {
  run_id: string;
  status: string;
  stake_cents: string;
  currency: string;
  arena_host: string;
  join_token: string;
  created_at: Date;
};
