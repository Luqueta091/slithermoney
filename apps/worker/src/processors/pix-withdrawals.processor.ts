import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../shared/database/prisma';
import { config } from '../shared/config';
import { logger } from '../shared/observability/logger';
import {
  recordRetryError,
  recordWithdrawalFailed,
  recordWithdrawalPaid,
  setPendingWithdrawals,
} from '../shared/observability/metrics';
import { createBspayPayment } from '../integrations/bspay';

const BATCH_SIZE = 10;

type PayoutResult = {
  status: 'PAID' | 'FAILED' | 'PROCESSING';
  externalReference?: string | null;
  provider?: string | null;
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
  idempotencyKey: string;
  txid?: string | null;
  externalReference?: string | null;
  payload?: Prisma.JsonValue | null;
  createdAt: Date;
}): Promise<void> {
  const processingMs = Date.now() - withdrawal.createdAt.getTime();
  const payout = await executePayout(withdrawal);

  if (payout.status === 'PROCESSING') {
    if (payout.externalReference && payout.externalReference !== withdrawal.externalReference) {
      await prisma.pixTransaction.updateMany({
        where: { id: withdrawal.id, status: 'REQUESTED' },
        data: {
          externalReference: payout.externalReference,
          provider: payout.provider ?? null,
          updatedAt: new Date(),
        },
      });
    }
    return;
  }

  if (payout.status === 'PAID') {
    let updated = false;
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const updateResult = await tx.pixTransaction.updateMany({
        where: { id: withdrawal.id, status: 'REQUESTED' },
        data: {
          status: 'PAID',
          externalReference: payout.externalReference ?? withdrawal.externalReference ?? null,
          provider: payout.provider ?? null,
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

async function executePayout(withdrawal: {
  id: string;
  accountId: string;
  amountCents: bigint;
  currency: string;
  idempotencyKey: string;
  externalReference?: string | null;
  payload?: Prisma.JsonValue | null;
}): Promise<PayoutResult> {
  if (config.PIX_PROVIDER !== 'bspay') {
    return {
      status: 'PAID',
      externalReference: randomUUID(),
    };
  }

  if (withdrawal.externalReference) {
    return {
      status: 'PROCESSING',
      externalReference: withdrawal.externalReference,
      provider: 'bspay',
    };
  }

  const identity = await prisma.identityProfile.findUnique({
    where: { accountId: withdrawal.accountId },
  });

  if (!identity) {
    throw new Error('Identidade nao encontrada para saque');
  }

  const payload = (withdrawal.payload ?? {}) as {
    pix_key?: string;
    pix_key_type?: string;
  };
  const pixKey = payload.pix_key ?? identity.pixKey;
  const pixKeyType = payload.pix_key_type ?? identity.pixKeyType;

  if (!pixKey || !pixKeyType) {
    throw new Error('Chave Pix ausente para saque');
  }

  const amount = Number((Number(withdrawal.amountCents) / 100).toFixed(2));
  const keyType = mapPixKeyType(pixKeyType);
  const result = await createBspayPayment(
    {
      baseUrl: config.BSPAY_BASE_URL,
      token: config.BSPAY_TOKEN,
      clientId: config.BSPAY_CLIENT_ID,
      clientSecret: config.BSPAY_CLIENT_SECRET,
    },
    {
      amount,
      externalId: withdrawal.idempotencyKey,
      description: 'Saque de saldo',
      postbackUrl: config.BSPAY_POSTBACK_URL || undefined,
      creditParty: {
        name: identity.fullName,
        keyType,
        key: pixKey,
        taxId: identity.cpf,
      },
    },
  );

  return {
    status: 'PROCESSING',
    externalReference: result.transactionId,
    provider: 'bspay',
  };
}

function mapPixKeyType(value: string): string {
  switch (value) {
    case 'cpf':
      return 'CPF';
    case 'email':
      return 'EMAIL';
    case 'phone':
      return 'PHONE';
    case 'random':
      return 'EVP';
    default:
      return value.toUpperCase();
  }
}
