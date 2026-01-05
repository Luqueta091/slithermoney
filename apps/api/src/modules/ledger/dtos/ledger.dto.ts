import { z } from 'zod';

export const ledgerEntryTypeSchema = z.enum([
  'DEPOSIT',
  'STAKE_RESERVED',
  'STAKE_RELEASED',
  'STAKE_LOST',
  'PRIZE',
  'HOUSE_FEE',
  'WITHDRAW_REQUEST',
  'WITHDRAW_PAID',
  'WITHDRAW_FAILED',
  'ADMIN_ADJUST',
]);

export const ledgerDirectionSchema = z.enum(['CREDIT', 'DEBIT']);

export type LedgerEntryType = z.infer<typeof ledgerEntryTypeSchema>;
export type LedgerDirection = z.infer<typeof ledgerDirectionSchema>;

export type LedgerStatementQuery = {
  types?: LedgerEntryType[];
  from?: Date;
  to?: Date;
  limit: number;
  offset: number;
  order: 'asc' | 'desc';
};

export type LedgerEntryResponse = {
  id: string;
  account_id: string;
  wallet_id?: string | null;
  entry_type: LedgerEntryType;
  direction: LedgerDirection;
  amount_cents: string;
  currency: string;
  reference_type?: string | null;
  reference_id?: string | null;
  external_reference?: string | null;
  metadata?: unknown | null;
  created_at: Date;
};

export type LedgerStatementResponse = {
  items: LedgerEntryResponse[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
  };
};
