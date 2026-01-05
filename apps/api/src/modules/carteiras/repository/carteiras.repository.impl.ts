import { PrismaClient } from '@prisma/client';
import {
  CarteirasRepository,
  PrismaClientLike,
  WalletBalanceDelta,
  WalletBalanceGuard,
  WalletRecord,
} from './carteiras.repository';

export class CarteirasRepositoryPrisma implements CarteirasRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async withTransaction<T>(fn: (tx: PrismaClientLike) => Promise<T>): Promise<T> {
    return this.prisma.$transaction((tx) => fn(tx));
  }

  async ensureAccountAndWallet(accountId: string, tx: PrismaClientLike): Promise<WalletRecord> {
    await tx.account.upsert({
      where: { id: accountId },
      create: { id: accountId },
      update: {},
    });

    return tx.wallet.upsert({
      where: { accountId },
      create: { accountId },
      update: {},
    });
  }

  async findByAccountId(accountId: string, tx: PrismaClientLike): Promise<WalletRecord | null> {
    return tx.wallet.findUnique({
      where: { accountId },
    });
  }

  async updateBalances(
    accountId: string,
    delta: WalletBalanceDelta,
    tx: PrismaClientLike,
  ): Promise<WalletRecord> {
    return tx.wallet.update({
      where: { accountId },
      data: buildWalletUpdate(delta),
    });
  }

  async updateBalancesWithGuard(
    accountId: string,
    delta: WalletBalanceDelta,
    guard: WalletBalanceGuard,
    tx: PrismaClientLike,
  ): Promise<WalletRecord | null> {
    const update = buildWalletUpdate(delta);

    const where: Record<string, unknown> = { accountId };

    if (guard.availableBalanceCents !== undefined) {
      where.availableBalanceCents = { gte: guard.availableBalanceCents };
    }

    if (guard.blockedBalanceCents !== undefined) {
      where.blockedBalanceCents = { gte: guard.blockedBalanceCents };
    }

    if (guard.inGameBalanceCents !== undefined) {
      where.inGameBalanceCents = { gte: guard.inGameBalanceCents };
    }

    const result = await tx.wallet.updateMany({
      where,
      data: update,
    });

    if (result.count === 0) {
      return null;
    }

    return tx.wallet.findUnique({
      where: { accountId },
    });
  }
}

function buildWalletUpdate(delta: WalletBalanceDelta) {
  const data: Record<string, unknown> = {};

  if (delta.availableBalanceCents !== undefined) {
    data.availableBalanceCents = toPrismaDelta(delta.availableBalanceCents);
  }

  if (delta.inGameBalanceCents !== undefined) {
    data.inGameBalanceCents = toPrismaDelta(delta.inGameBalanceCents);
  }

  if (delta.blockedBalanceCents !== undefined) {
    data.blockedBalanceCents = toPrismaDelta(delta.blockedBalanceCents);
  }

  return data;
}

function toPrismaDelta(value: bigint) {
  if (value === 0n) {
    return undefined;
  }

  if (value > 0n) {
    return { increment: value };
  }

  return { decrement: value * -1n };
}
