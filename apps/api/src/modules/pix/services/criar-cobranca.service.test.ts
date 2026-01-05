import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../../../shared/database/prisma';
import { PixGatewayStub } from '../gateways/pix.gateway.stub';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { CriarCobrancaService } from './criar-cobranca.service';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('pix criar cobranca service', () => {
  const repository = new PixTransacoesRepositoryPrisma(prisma);
  const gateway = new PixGatewayStub();
  const service = new CriarCobrancaService(repository, gateway);
  const accountId = randomUUID();
  const idempotencyKey = randomUUID();

  beforeAll(async () => {
    await prisma.account.create({
      data: { id: accountId },
    });
  });

  afterAll(async () => {
    await prisma.pixTransaction.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('returns the same transaction for the same idempotency key', async () => {
    const first = await service.createDeposit(
      accountId,
      { amountCents: 1500 },
      idempotencyKey,
    );

    const second = await service.createDeposit(
      accountId,
      { amountCents: 1500 },
      idempotencyKey,
    );

    expect(second.transaction.id).toBe(first.transaction.id);

    const count = await prisma.pixTransaction.count({ where: { idempotencyKey } });
    expect(count).toBe(1);
  });
});
