import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/observability/logger';
import { recordDepositFailed, setPendingDeposits } from '../shared/observability/metrics';

const BATCH_SIZE = 50;

type PendingDeposit = {
  id: string;
  createdAt: Date;
  payload: unknown | null;
};

export async function expirePendingDeposits(expirationMs: number): Promise<number> {
  const pendingCount = await prisma.pixTransaction.count({
    where: {
      txType: 'DEPOSIT',
      status: 'PENDING',
    },
  });

  setPendingDeposits(pendingCount);

  const pending = await prisma.pixTransaction.findMany({
    where: {
      txType: 'DEPOSIT',
      status: 'PENDING',
    },
    orderBy: { createdAt: 'asc' },
    take: BATCH_SIZE,
    select: {
      id: true,
      createdAt: true,
      payload: true,
    },
  });

  if (pending.length === 0) {
    return 0;
  }

  const now = Date.now();
  let expiredCount = 0;

  for (const deposit of pending) {
    if (!isExpired(deposit, expirationMs, now)) {
      continue;
    }

    const updated = await prisma.pixTransaction.updateMany({
      where: { id: deposit.id, status: 'PENDING' },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (updated.count > 0) {
      expiredCount += 1;
    }
  }

  if (expiredCount > 0) {
    recordDepositFailed(expiredCount);
    logger.info('pix_deposits_expired', {
      count: expiredCount,
    });
  }

  return expiredCount;
}

function isExpired(deposit: PendingDeposit, expirationMs: number, now: number): boolean {
  const expirationDate = extractExpirationDate(deposit.payload);
  const createdMs = deposit.createdAt.getTime();
  const minExpiry = createdMs + expirationMs;

  if (expirationDate) {
    const expiresAt = expirationDate.getTime();
    if (Number.isFinite(expiresAt) && expiresAt > 0) {
      // Avoid expiring earlier than the configured minimum window.
      if (expiresAt < minExpiry) {
        return minExpiry <= now;
      }
      return expiresAt <= now;
    }
  }

  return minExpiry <= now;
}

function extractExpirationDate(payload: unknown): Date | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const value = (payload as Record<string, unknown>).expires_at;
  if (typeof value !== 'string') {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
