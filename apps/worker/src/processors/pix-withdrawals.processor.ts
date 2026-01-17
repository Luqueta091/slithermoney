import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/observability/logger';
import {
  recordRetryError,
  recordWithdrawalFailed,
  recordWithdrawalPaid,
  setPendingWithdrawals,
} from '../shared/observability/metrics';

const BATCH_SIZE = 10;

type PayoutResult = {
  status: 'PAID' | 'FAILED';
  externalReference?: string | null;
};

export async function processPendingWithdrawals(options: {
  accountId?: string;
  batchSize?: number;
} = {}): Promise<void> {
  const where = {
    txType: 'WITHDRAWAL',
    status: 'REQUESTED',
    ...(options.accountId ? { accountId: options.accountId } : {}),
  };
  const batchSize = options.batchSize ?? BATCH_SIZE;

  const pendingCount = await prisma.pixTransaction.count({ where });
  setPendingWithdrawals(pendingCount);

  const pending = await prisma.pixTransaction.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });

  if (pending.length === 0) {
    return;
  }

  for (const withdrawal of pending) {
    try {
      await processWithdrawal(withdrawal);
    } catch (error) {
      recordRetryError();
      logger.error('pix_withdrawal_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.accountId,
      });
    }
  }
}

async function processWithdrawal(withdrawal: {
  id: string;
  accountId: string;
  amountCents: bigint;
  currency: string;
  txid?: string | null;
  externalReference?: string | null;
  createdAt: Date;
}): Promise<void> {
  const processingMs = Date.now() - withdrawal.createdAt.getTime();
  const payout = await executePayout(withdrawal);

  if (payout.status === 'PAID') {
    let updated = false;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.pixTransaction.updateMany({
        where: { id: withdrawal.id, status: 'REQUESTED' },
        data: {
          status: 'PAID',
          externalReference: payout.externalReference ?? withdrawal.externalReference ?? null,
          completedAt: new Date(),
          updatedAt: new Date(),
        },
      });

      if (updateResult.count === 0) {
        return;
      }
      updated = true;

      const walletUpdated = await tx.wallet.updateMany({
        where: {
          accountId: withdrawal.accountId,
          blockedBalanceCents: { gte: withdrawal.amountCents },
        },
        data: {
          blockedBalanceCents: { decrement: withdrawal.amountCents },
        },
      });

      if (walletUpdated.count === 0) {
        throw new Error('Saldo bloqueado insuficiente');
      }

      const wallet = await tx.wallet.findUnique({
        where: { accountId: withdrawal.accountId },
      });

      await tx.ledgerEntry.create({
        data: {
          accountId: withdrawal.accountId,
          walletId: wallet?.id ?? null,
          entryType: 'WITHDRAW_PAID',
          direction: 'DEBIT',
          amountCents: withdrawal.amountCents,
          currency: withdrawal.currency,
          referenceType: 'PIX',
          referenceId: withdrawal.id,
          externalReference: payout.externalReference ?? withdrawal.externalReference ?? null,
          metadata: {
            txid: withdrawal.txid ?? null,
          },
        },
      });
    });

    if (updated) {
      recordWithdrawalPaid(processingMs);
      logger.info('pix_withdrawal_paid', {
        withdrawal_id: withdrawal.id,
        account_id: withdrawal.accountId,
      });
    }

    return;
  }

  let updated = false;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const updateResult = await tx.pixTransaction.updateMany({
      where: { id: withdrawal.id, status: 'REQUESTED' },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      return;
    }
    updated = true;

    const walletUpdated = await tx.wallet.updateMany({
      where: {
        accountId: withdrawal.accountId,
        blockedBalanceCents: { gte: withdrawal.amountCents },
      },
      data: {
        blockedBalanceCents: { decrement: withdrawal.amountCents },
        availableBalanceCents: { increment: withdrawal.amountCents },
      },
    });

    if (walletUpdated.count === 0) {
      throw new Error('Saldo bloqueado insuficiente');
    }

    const wallet = await tx.wallet.findUnique({
      where: { accountId: withdrawal.accountId },
    });

    await tx.ledgerEntry.create({
      data: {
        accountId: withdrawal.accountId,
        walletId: wallet?.id ?? null,
        entryType: 'WITHDRAW_FAILED',
        direction: 'CREDIT',
        amountCents: withdrawal.amountCents,
        currency: withdrawal.currency,
        referenceType: 'PIX',
        referenceId: withdrawal.id,
        externalReference: withdrawal.externalReference ?? null,
        metadata: {
          txid: withdrawal.txid ?? null,
        },
      },
    });
  });

  if (updated) {
    recordWithdrawalFailed(processingMs);
    logger.warn('pix_withdrawal_failed', {
      withdrawal_id: withdrawal.id,
      account_id: withdrawal.accountId,
    });
  }
}

async function executePayout(_withdrawal: {
  id: string;
  accountId: string;
  amountCents: bigint;
  currency: string;
}): Promise<PayoutResult> {
  return {
    status: 'PAID',
    externalReference: randomUUID(),
  };
}
