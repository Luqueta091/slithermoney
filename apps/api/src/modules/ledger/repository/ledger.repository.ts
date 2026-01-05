import { Prisma, PrismaClient } from '@prisma/client';
import { LedgerDirection, LedgerEntryType, LedgerStatementQuery } from '../dtos/ledger.dto';

export type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export type LedgerEntryRecord = {
  id: string;
  accountId: string;
  walletId?: string | null;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amountCents: bigint;
  currency: string;
  referenceType?: string | null;
  referenceId?: string | null;
  externalReference?: string | null;
  metadata?: Prisma.JsonValue | null;
  createdAt: Date;
};

export type LedgerEntryCreateInput = {
  accountId: string;
  walletId?: string | null;
  entryType: LedgerEntryType;
  direction: LedgerDirection;
  amountCents: bigint;
  currency: string;
  referenceType?: string | null;
  referenceId?: string | null;
  externalReference?: string | null;
  metadata?: Prisma.JsonValue | null;
};

export interface LedgerRepository {
  createEntry(input: LedgerEntryCreateInput, tx?: PrismaClientLike): Promise<LedgerEntryRecord>;
  findStatement(
    accountId: string,
    query: LedgerStatementQuery,
    tx?: PrismaClientLike,
  ): Promise<{ items: LedgerEntryRecord[]; total: number }>;
}
