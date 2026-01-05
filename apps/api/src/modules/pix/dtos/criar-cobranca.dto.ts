import { z } from 'zod';

export const pixTransactionTypeSchema = z.enum(['DEPOSIT', 'WITHDRAWAL']);
export const pixTransactionStatusSchema = z.enum([
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'REQUESTED',
  'PAID',
]);

export type PixTransactionType = z.infer<typeof pixTransactionTypeSchema>;
export type PixTransactionStatus = z.infer<typeof pixTransactionStatusSchema>;

export const criarCobrancaInputSchema = z.object({
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

export type CriarCobrancaInput = z.infer<typeof criarCobrancaInputSchema>;

export type PixChargePayload = {
  qr_code: string;
  copy_and_paste: string;
  expires_at: string;
};

export type PixDepositResponse = {
  id: string;
  account_id: string;
  status: PixTransactionStatus;
  amount_cents: string;
  currency: string;
  idempotency_key: string;
  txid: string | null;
  payload: PixChargePayload | Record<string, unknown> | null;
  created_at: Date;
};
