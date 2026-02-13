import { z } from 'zod';
import { PixTransactionStatus } from './criar-cobranca.dto';

export const solicitarSaqueInputSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
  pixKey: z.string().min(3),
  pixKeyType: z.literal('cpf').optional().default('cpf'),
});

export type SolicitarSaqueInput = z.infer<typeof solicitarSaqueInputSchema>;

export type PixWithdrawalResponse = {
  id: string;
  account_id: string;
  status: PixTransactionStatus;
  amount_cents: string;
  currency: string;
  idempotency_key: string;
  external_reference: string | null;
  created_at: Date;
};
