import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../shared/database/prisma';
import { processPendingWithdrawals } from './pix-withdrawals.processor';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('pix withdrawals processor', () => {
  const accountId = randomUUID();
  let withdrawalId = '';

  beforeAll(async () => {
    await prisma.account.create({
      data: { id: accountId },
    });
    await prisma.wallet.create({
      data: {
        accountId,
        availableBalanceCents: 0n,
        blockedBalanceCents: 0n,
      },
    });

    const created = await prisma.pixTransaction.create({
      data: {
        accountId,
        txType: 'WITHDRAWAL',
        status: 'REQUESTED',
        amountCents: 1000n,
        currency: 'BRL',
        idempotencyKey: randomUUID(),
      },
    });

    withdrawalId = created.id;
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { accountId } });
    await prisma.pixTransaction.deleteMany({ where: { accountId } });
    await prisma.wallet.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('retries withdrawal until blocked balance is available', async () => {
    await processPendingWithdrawals({ accountId });

    const pending = await prisma.pixTransaction.findUnique({
      where: { id: withdrawalId },
    });

    expect(pending?.status).toBe('REQUESTED');

    await prisma.wallet.update({
      where: { accountId },
      data: {
        blockedBalanceCents: 1000n,
      },
    });

    await processPendingWithdrawals({ accountId });

    const paid = await prisma.pixTransaction.findUnique({
      where: { id: withdrawalId },
    });

    expect(paid?.status).toBe('PAID');

    const wallet = await prisma.wallet.findUnique({ where: { accountId } });
    expect(wallet?.blockedBalanceCents).toBe(0n);

    const ledgerEntry = await prisma.ledgerEntry.findFirst({
      where: {
        accountId,
        entryType: 'WITHDRAW_PAID',
        referenceType: 'PIX',
        referenceId: withdrawalId,
      },
    });

    expect(ledgerEntry).not.toBeNull();
  }, 20000);
});
