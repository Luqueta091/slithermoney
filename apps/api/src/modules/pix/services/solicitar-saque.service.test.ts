import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../../../shared/database/prisma';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { SolicitarSaqueService } from './solicitar-saque.service';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('pix solicitar saque service', () => {
  const pixRepository = new PixTransacoesRepositoryPrisma(prisma);
  const walletRepository = new CarteirasRepositoryPrisma(prisma);
  const ledgerRepository = new LedgerRepositoryPrisma(prisma);
  const ledgerService = new LedgerService(ledgerRepository);
  const service = new SolicitarSaqueService(prisma, pixRepository, walletRepository, ledgerService);

  const accountId = randomUUID();

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
  });

  afterAll(async () => {
    const wallet = await prisma.wallet.findUnique({ where: { accountId } });
    await prisma.ledgerEntry.deleteMany({
      where: {
        OR: [{ accountId }, ...(wallet ? [{ walletId: wallet.id }] : [])],
      },
    });
    await prisma.pixTransaction.deleteMany({ where: { accountId } });
    await prisma.wallet.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('blocks balance and is idempotent for withdrawals', async () => {
    const idempotencyKey = randomUUID();

    const first = await service.requestWithdrawal(
      accountId,
      { amountCents: 2000, pixKey: 'email@exemplo.com', pixKeyType: 'email' },
      idempotencyKey,
    );

    const second = await service.requestWithdrawal(
      accountId,
      { amountCents: 2000, pixKey: 'email@exemplo.com', pixKeyType: 'email' },
      idempotencyKey,
    );

    expect(second.transaction.id).toBe(first.transaction.id);

    const wallet = await prisma.wallet.findUnique({ where: { accountId } });
    expect(wallet?.availableBalanceCents).toBe(3000n);
    expect(wallet?.blockedBalanceCents).toBe(2000n);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: { accountId, entryType: 'WITHDRAW_REQUEST' },
    });
    expect(ledgerCount).toBe(1);

    const txCount = await prisma.pixTransaction.count({
      where: { idempotencyKey },
    });
    expect(txCount).toBe(1);
  }, 20000);
});
