import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../../../shared/database/prisma';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { RunsRepositoryPrisma } from '../repository/runs.repository.impl';
import { RunsService } from './runs.service';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('runs service', () => {
  const walletRepository = new CarteirasRepositoryPrisma(prisma);
  const ledgerRepository = new LedgerRepositoryPrisma(prisma);
  const ledgerService = new LedgerService(ledgerRepository);
  const runsRepository = new RunsRepositoryPrisma(prisma);
  const service = new RunsService(prisma, walletRepository, ledgerService, runsRepository);
  const accountId = randomUUID();
  const eliminationAccountId = randomUUID();
  const cashoutAccountId = randomUUID();
  const roundingAccountId = randomUUID();

  beforeAll(async () => {
    await prisma.account.create({
      data: { id: accountId },
    });
    await prisma.wallet.create({
      data: {
        accountId,
        availableBalanceCents: 5000n,
      },
    });

    await prisma.account.create({
      data: { id: eliminationAccountId },
    });
    await prisma.wallet.create({
      data: {
        accountId: eliminationAccountId,
        availableBalanceCents: 4000n,
      },
    });

    await prisma.account.create({
      data: { id: cashoutAccountId },
    });
    await prisma.wallet.create({
      data: {
        accountId: cashoutAccountId,
        availableBalanceCents: 5000n,
      },
    });

    await prisma.account.create({
      data: { id: roundingAccountId },
    });
    await prisma.wallet.create({
      data: {
        accountId: roundingAccountId,
        availableBalanceCents: 5000n,
      },
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({
      where: {
        accountId: { in: [accountId, eliminationAccountId, cashoutAccountId, roundingAccountId] },
      },
    });
    await prisma.run.deleteMany({
      where: {
        accountId: { in: [accountId, eliminationAccountId, cashoutAccountId, roundingAccountId] },
      },
    });
    await prisma.wallet.deleteMany({
      where: {
        accountId: { in: [accountId, eliminationAccountId, cashoutAccountId, roundingAccountId] },
      },
    });
    await prisma.account.deleteMany({
      where: {
        id: { in: [accountId, eliminationAccountId, cashoutAccountId, roundingAccountId] },
      },
    });
    await prisma.$disconnect();
  });

  it('reserves stake and creates run', async () => {
    const result = await service.startRun(
      accountId,
      { stakeCents: 1500 },
      { arenaHost: 'ws://localhost:4000', minStakeCents: 100, maxStakeCents: 100000 },
    );

    const wallet = await prisma.wallet.findUnique({ where: { accountId } });
    expect(wallet?.availableBalanceCents).toBe(3500n);
    expect(wallet?.inGameBalanceCents).toBe(1500n);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: {
        accountId,
        entryType: 'STAKE_RESERVED',
        referenceType: 'RUN',
        referenceId: result.run.id,
      },
    });

    expect(ledgerCount).toBe(1);
  }, 20000);

  it('marks run eliminated and consumes stake', async () => {
    const started = await service.startRun(
      eliminationAccountId,
      { stakeCents: 2000 },
      { arenaHost: 'ws://localhost:4000', minStakeCents: 100, maxStakeCents: 100000 },
    );

    await service.eliminateRun({
      runId: started.run.id,
      reason: 'disconnect',
      sizeScore: 42,
      multiplier: 1.1,
    });

    const wallet = await prisma.wallet.findUnique({ where: { accountId: eliminationAccountId } });
    expect(wallet?.availableBalanceCents).toBe(2000n);
    expect(wallet?.inGameBalanceCents).toBe(0n);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: {
        accountId: eliminationAccountId,
        entryType: 'STAKE_LOST',
        referenceType: 'RUN',
        referenceId: started.run.id,
      },
    });

    expect(ledgerCount).toBe(1);
  }, 20000);

  it('cashes out and credits prize minus fee', async () => {
    const started = await service.startRun(
      cashoutAccountId,
      { stakeCents: 2000 },
      { arenaHost: 'ws://localhost:4000', minStakeCents: 100, maxStakeCents: 100000 },
    );

    await service.cashoutRun(
      { runId: started.run.id, multiplier: 1.5, sizeScore: 120 },
      { feeBps: 1000 },
    );

    const wallet = await prisma.wallet.findUnique({ where: { accountId: cashoutAccountId } });
    expect(wallet?.availableBalanceCents).toBe(5700n);
    expect(wallet?.inGameBalanceCents).toBe(0n);

    const prizeCount = await prisma.ledgerEntry.count({
      where: {
        accountId: cashoutAccountId,
        entryType: 'PRIZE',
        referenceType: 'RUN',
        referenceId: started.run.id,
      },
    });

    const feeCount = await prisma.ledgerEntry.count({
      where: {
        accountId: cashoutAccountId,
        entryType: 'HOUSE_FEE',
        referenceType: 'RUN',
        referenceId: started.run.id,
      },
    });

    expect(prizeCount).toBe(1);
    expect(feeCount).toBe(1);
  }, 20000);

  it('rounds multiplier and fee down for cashout', async () => {
    const started = await service.startRun(
      roundingAccountId,
      { stakeCents: 1000 },
      { arenaHost: 'ws://localhost:4000', minStakeCents: 100, maxStakeCents: 100000 },
    );

    await service.cashoutRun(
      { runId: started.run.id, multiplier: 1.23456, sizeScore: 10 },
      { feeBps: 275 },
    );

    const wallet = await prisma.wallet.findUnique({ where: { accountId: roundingAccountId } });
    expect(wallet?.availableBalanceCents).toBe(5201n);
    expect(wallet?.inGameBalanceCents).toBe(0n);

    const prize = await prisma.ledgerEntry.findFirst({
      where: {
        accountId: roundingAccountId,
        entryType: 'PRIZE',
        referenceType: 'RUN',
        referenceId: started.run.id,
      },
    });

    const fee = await prisma.ledgerEntry.findFirst({
      where: {
        accountId: roundingAccountId,
        entryType: 'HOUSE_FEE',
        referenceType: 'RUN',
        referenceId: started.run.id,
      },
    });

    expect(prize?.amountCents).toBe(1234n);
    expect(fee?.amountCents).toBe(33n);
  }, 20000);
});
