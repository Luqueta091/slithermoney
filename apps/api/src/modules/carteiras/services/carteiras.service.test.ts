import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'crypto';
import { prisma } from '../../../shared/database/prisma';
import { CarteirasRepositoryPrisma } from '../repository/carteiras.repository.impl';
import { CarteirasService } from './carteiras.service';
import { ValidationError } from '../../../shared/errors/validation-error';

const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);
const describeDb = hasDatabaseUrl ? describe : describe.skip;

describeDb('carteiras service', () => {
  const repository = new CarteirasRepositoryPrisma(prisma);
  const service = new CarteirasService(repository);
  const accountId = randomUUID();

  beforeAll(async () => {
    await prisma.account.create({
      data: {
        id: accountId,
      },
    });
    await prisma.wallet.create({
      data: {
        accountId,
      },
    });
  });

  afterAll(async () => {
    await prisma.wallet.deleteMany({ where: { accountId } });
    await prisma.account.deleteMany({ where: { id: accountId } });
    await prisma.$disconnect();
  });

  it('prevents concurrent double debit', async () => {
    await service.creditAvailable(accountId, 1000);

    const results = await Promise.allSettled([
      service.debitAvailable(accountId, 700),
      service.debitAvailable(accountId, 700),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

    const wallet = await service.getWallet(accountId);
    expect(wallet.availableBalanceCents).toBe(300n);
  }, 20000);

  it('rejects non-positive amounts', async () => {
    await expect(service.creditAvailable(accountId, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.debitAvailable(accountId, -1)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.blockAmount(accountId, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.unblockAmount(accountId, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.reserveForGame(accountId, 0)).rejects.toBeInstanceOf(ValidationError);
    await expect(service.releaseFromGame(accountId, 0)).rejects.toBeInstanceOf(ValidationError);
  }, 20000);

  it('rejects debit when balance is insufficient', async () => {
    await prisma.wallet.update({
      where: { accountId },
      data: {
        availableBalanceCents: 0n,
        blockedBalanceCents: 0n,
        inGameBalanceCents: 0n,
      },
    });

    await expect(service.debitAvailable(accountId, 100)).rejects.toBeInstanceOf(ValidationError);
  }, 20000);
});
