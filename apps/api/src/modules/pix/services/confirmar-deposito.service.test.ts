import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../../../shared/database/prisma';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { PixGatewayStub } from '../gateways/pix.gateway.stub';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { CriarCobrancaService } from './criar-cobranca.service';
import { ConfirmarDepositoService } from './confirmar-deposito.service';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('pix confirmar deposito service', () => {
  const pixRepository = new PixTransacoesRepositoryPrisma(prisma);
  const gateway = new PixGatewayStub();
  const criarCobranca = new CriarCobrancaService(pixRepository, gateway);
  const walletRepository = new CarteirasRepositoryPrisma(prisma);
  const ledgerRepository = new LedgerRepositoryPrisma(prisma);
  const ledgerService = new LedgerService(ledgerRepository);
  const confirmarDeposito = new ConfirmarDepositoService(
    prisma,
    pixRepository,
    walletRepository,
    ledgerService,
  );

  const accountId = randomUUID();

  beforeAll(async () => {
    await prisma.account.create({
      data: { id: accountId },
    });
  });

  afterAll(async () => {
    await prisma.ledgerEntry.deleteMany({ where: { accountId } });
    await prisma.wallet.deleteMany({ where: { accountId } });
    await prisma.pixTransaction.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('credits wallet once when webhook repeats', async () => {
    const { transaction } = await criarCobranca.createDeposit(accountId, {
      amountCents: 2500,
    });

    if (!transaction.txid) {
      throw new Error('Expected txid to be defined');
    }

    const txid = transaction.txid;

    await confirmarDeposito.confirm({
      txid,
      amountCents: 2500,
      currency: transaction.currency,
      externalId: undefined,
      e2eId: undefined,
    });

    await confirmarDeposito.confirm({
      txid,
      amountCents: 2500,
      currency: transaction.currency,
      externalId: undefined,
      e2eId: undefined,
    });

    const wallet = await prisma.wallet.findUnique({
      where: { accountId },
    });

    expect(wallet?.availableBalanceCents).toBe(2500n);

    const ledgerCount = await prisma.ledgerEntry.count({
      where: { accountId, entryType: 'DEPOSIT' },
    });

    expect(ledgerCount).toBe(1);
  }, 20000);
});
