import { z } from 'zod';
import { PixTransactionStatus } from './criar-cobranca.dto';

const legacyWebhookSchema = z.object({
  txid: z.string().min(1),
  e2eId: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

const bspayWebhookSchema = z
  .object({
    requestBody: z.object({
      transactionType: z.literal('RECEIVEPIX'),
      transactionId: z.string().min(1),
      external_id: z.string().optional(),
      amount: z.number().positive(),
      paymentType: z.string().optional(),
      status: z.string().optional(),
      dateApproval: z.string().optional(),
      creditParty: z
        .object({
          name: z.string().optional(),
          email: z.string().optional(),
          taxId: z.string().optional(),
        })
        .optional(),
    }),
  })
  .refine((data) => !data.requestBody.status || data.requestBody.status === 'PAID', {
    message: 'status must be PAID',
  })
  .transform((data) => ({
    txid: data.requestBody.transactionId,
    amountCents: Math.round(data.requestBody.amount * 100),
    currency: 'BRL',
    e2eId: undefined,
  }));

export const pixWebhookInputSchema = z.union([
  legacyWebhookSchema,
  bspayWebhookSchema,
]);

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
