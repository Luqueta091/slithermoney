import { PrismaClient } from '@prisma/client';
import {
  PixTransacoesRepository,
  PixTransactionCreateInput,
  PixTransactionRecord,
  PrismaClientLike,
} from './pix-transacoes.repository';

export class PixTransacoesRepositoryPrisma implements PixTransacoesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<PixTransactionRecord | null> {
    return this.prisma.pixTransaction.findUnique({
      where: { idempotencyKey },
    });
  }

  async findByTxid(txid: string): Promise<PixTransactionRecord | null> {
    return this.prisma.pixTransaction.findUnique({
      where: { txid },
    });
  }

  async create(
    input: PixTransactionCreateInput,
    tx?: PrismaClientLike,
  ): Promise<PixTransactionRecord> {
    const client = tx ?? this.prisma;

    await client.account.upsert({
      where: { id: input.accountId },
      create: { id: input.accountId },
      update: {},
    });

    return client.pixTransaction.create({
      data: {
        accountId: input.accountId,
        txType: input.txType,
        status: input.status,
        amountCents: input.amountCents,
        currency: input.currency,
        idempotencyKey: input.idempotencyKey,
        txid: input.txid ?? null,
        e2eId: input.e2eId ?? null,
        provider: input.provider ?? null,
        externalReference: input.externalReference ?? null,
        payload: input.payload ?? undefined,
      },
    });
  }

  async confirmDeposit(
    tx: PrismaClientLike,
    input: { txid: string; e2eId?: string | null },
  ): Promise<PixTransactionRecord | null> {
    const updated = await tx.pixTransaction.updateMany({
      where: {
        txid: input.txid,
        status: 'PENDING',
      },
      data: {
        status: 'CONFIRMED',
        e2eId: input.e2eId ?? null,
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return null;
    }

    return tx.pixTransaction.findUnique({
      where: { txid: input.txid },
    });
  }
}
