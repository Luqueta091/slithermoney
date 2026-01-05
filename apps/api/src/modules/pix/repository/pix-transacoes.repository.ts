import { Prisma, PrismaClient } from '@prisma/client';
import { PixTransactionStatus, PixTransactionType } from '../dtos/criar-cobranca.dto';

export type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export type PixTransactionRecord = {
  id: string;
  accountId: string;
  txType: PixTransactionType;
  status: PixTransactionStatus;
  amountCents: bigint;
  currency: string;
  idempotencyKey: string;
  txid?: string | null;
  e2eId?: string | null;
  provider?: string | null;
  externalReference?: string | null;
  payload?: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date | null;
};

export type PixTransactionCreateInput = {
  accountId: string;
  txType: PixTransactionType;
  status: PixTransactionStatus;
  amountCents: bigint;
  currency: string;
  idempotencyKey: string;
  txid?: string | null;
  e2eId?: string | null;
  provider?: string | null;
  externalReference?: string | null;
  payload?: Prisma.JsonValue | null;
};

export interface PixTransacoesRepository {
  findByIdempotencyKey(idempotencyKey: string): Promise<PixTransactionRecord | null>;
  findByTxid(txid: string): Promise<PixTransactionRecord | null>;
  create(input: PixTransactionCreateInput, tx?: PrismaClientLike): Promise<PixTransactionRecord>;
  confirmDeposit(
    tx: PrismaClientLike,
    input: { txid: string; e2eId?: string | null },
  ): Promise<PixTransactionRecord | null>;
}
