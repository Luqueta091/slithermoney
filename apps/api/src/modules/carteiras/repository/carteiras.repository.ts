import { Prisma, PrismaClient } from '@prisma/client';

export type WalletRecord = {
  id: string;
  accountId: string;
  availableBalanceCents: bigint;
  inGameBalanceCents: bigint;
  blockedBalanceCents: bigint;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WalletBalanceDelta = {
  availableBalanceCents?: bigint;
  inGameBalanceCents?: bigint;
  blockedBalanceCents?: bigint;
};

export type WalletBalanceGuard = {
  availableBalanceCents?: bigint;
  inGameBalanceCents?: bigint;
  blockedBalanceCents?: bigint;
};

export type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export interface CarteirasRepository {
  withTransaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T>;
  ensureAccountAndWallet(accountId: string, tx: PrismaClientLike): Promise<WalletRecord>;
  findByAccountId(accountId: string, tx: PrismaClientLike): Promise<WalletRecord | null>;
  updateBalances(
    accountId: string,
    delta: WalletBalanceDelta,
    tx: PrismaClientLike,
  ): Promise<WalletRecord>;
  updateBalancesWithGuard(
    accountId: string,
    delta: WalletBalanceDelta,
    guard: WalletBalanceGuard,
    tx: PrismaClientLike,
  ): Promise<WalletRecord | null>;
}
