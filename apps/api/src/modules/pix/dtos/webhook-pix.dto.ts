import { z } from 'zod';
import { PixTransactionStatus } from './criar-cobranca.dto';

const legacyWebhookSchema = z.object({
  txid: z.string().min(1),
  e2eId: z.string().min(1).optional(),
  amountCents: z.number().int().positive(),
  currency: z.string().length(3).optional(),
});

const amountSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.');
    const parsed = Number.parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}, z.number().positive());

const transactionIdSchema = z.preprocess((value) => {
  if (typeof value === 'number') {
    return String(value);
  }
  return value;
}, z.string().min(1));

const bspayBodySchema = z
  .object({
    transactionType: z.string().optional(),
    transactionId: transactionIdSchema.optional(),
    pix_id: transactionIdSchema.optional(),
    pixId: transactionIdSchema.optional(),
    external_id: z.string().optional(),
    amount: amountSchema,
    paymentType: z.string().optional(),
    status: z.string().optional(),
    statusCode: z
      .object({
        statusId: z.number().optional(),
        description: z.string().optional(),
      })
      .optional(),
    dateApproval: z.string().optional(),
    creditParty: z
      .object({
        name: z.string().optional(),
        email: z.string().optional(),
        taxId: z.string().optional(),
      })
      .optional(),
  })
  .refine((data) => {
    if (data.status) {
      const normalized = data.status.toUpperCase();
      return ['PAID', 'CONFIRMED', 'APPROVED'].includes(normalized);
    }
    if (data.statusCode?.statusId !== undefined) {
      return data.statusCode.statusId === 1;
    }
    return true;
  }, {
    message: 'status must be PAID',
  });

const bspayWebhookSchema = z
  .union([
    z.object({ requestBody: bspayBodySchema }),
    bspayBodySchema,
  ])
  .transform((data) => {
    const body = 'requestBody' in data ? data.requestBody : data;
    const txid =
      body.transactionId ??
      body.pix_id ??
      body.pixId ??
      body.external_id ??
      '';
    return {
      txid,
      externalId: body.external_id,
      amountCents: Math.round(body.amount * 100),
      currency: 'BRL',
      e2eId: undefined,
    };
  });

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
