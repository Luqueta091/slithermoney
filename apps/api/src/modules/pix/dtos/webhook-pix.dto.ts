import { z } from 'zod';
import { PixTransactionStatus } from './criar-cobranca.dto';

export const pixWebhookInputSchema = z.object({
  txid: z.string().min(1),
  e2eId: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

export type PixWebhookInput = z.infer<typeof pixWebhookInputSchema>;

export type PixWebhookResponse = {
  id: string;
  account_id: string;
  status: PixTransactionStatus;
  txid: string;
  e2e_id: string | null;
  amount_cents: string;
  currency: string;
  completed_at: Date | null;
};
