import { prisma } from '../shared/database/prisma';
import { logger } from '../shared/observability/logger';
import { recordLedgerDivergenceDetected, recordLedgerDivergenceRepaired } from '../shared/observability/metrics';

const DEFAULT_BATCH_SIZE = 50;

type ConfirmedDeposit = {
  id: string;
  accountId: string;
  amountCents: bigint;
  currency: string;
  txid?: string | null;
  e2eId?: string | null;
  createdAt: Date;
};

export async function reconcileConfirmedDeposits(options: {
  lookbackHours: number;
  batchSize?: number;
}): Promise<void> {
  const cutoff = new Date(Date.now() - options.lookbackHours * 60 * 60 * 1000);
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  const confirmed = await prisma.pixTransaction.findMany({
    where: {
      txType: 'DEPOSIT',
      status: 'CONFIRMED',
      createdAt: {
        gte: cutoff,
      },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
    select: {
      id: true,
      accountId: true,
      amountCents: true,
      currency: true,
      txid: true,
      e2eId: true,
      createdAt: true,
    },
  });

  if (confirmed.length === 0) {
    return;
  }

  let checked = 0;
  let repaired = 0;

  for (const deposit of confirmed) {
    checked += 1;

    const ledgerEntry = await prisma.ledgerEntry.findFirst({
      where: {
        entryType: 'DEPOSIT',
        referenceType: 'PIX',
        referenceId: deposit.id,
      },
      select: { id: true },
    });

    if (ledgerEntry) {
      continue;
    }

    recordLedgerDivergenceDetected();
    const didRepair = await repairConfirmedDeposit(deposit);
    if (didRepair) {
      repaired += 1;
      recordLedgerDivergenceRepaired();
    }
  }

  logger.info('pix_deposit_reconciliation', {
    checked,
    repaired,
    lookback_hours: options.lookbackHours,
  });
}

async function repairConfirmedDeposit(deposit: ConfirmedDeposit): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.pixTransaction.findUnique({
      where: { id: deposit.id },
      select: {
        id: true,
        accountId: true,
        amountCents: true,
        currency: true,
        status: true,
        txid: true,
        e2eId: true,
      },
    });

    if (!current || current.status !== 'CONFIRMED') {
      return false;
    }

    const existingLedger = await tx.ledgerEntry.findFirst({
      where: {
        entryType: 'DEPOSIT',
        referenceType: 'PIX',
        referenceId: current.id,
      },
      select: { id: true },
    });

    if (existingLedger) {
      return false;
    }

    await tx.account.upsert({
      where: { id: current.accountId },
      create: { id: current.accountId },
      update: {},
    });

    const wallet = await tx.wallet.upsert({
      where: { accountId: current.accountId },
      create: {
        accountId: current.accountId,
        availableBalanceCents: current.amountCents,
      },
      update: {
        availableBalanceCents: { increment: current.amountCents },
      },
    });

    await tx.ledgerEntry.create({
      data: {
        accountId: current.accountId,
        walletId: wallet.id,
        entryType: 'DEPOSIT',
        direction: 'CREDIT',
        amountCents: current.amountCents,
        currency: current.currency,
        referenceType: 'PIX',
        referenceId: current.id,
        externalReference: current.e2eId ?? current.txid ?? null,
        metadata: {
          txid: current.txid ?? null,
          e2e_id: current.e2eId ?? null,
          repaired: true,
        },
      },
    });

    logger.warn('pix_deposit_repaired', {
      deposit_id: current.id,
      account_id: current.accountId,
    });

    return true;
  });
}
