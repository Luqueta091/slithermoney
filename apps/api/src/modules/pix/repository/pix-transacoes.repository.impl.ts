import { PixTransaction, PrismaClient } from '@prisma/client';
import { PixTransactionStatus, PixTransactionType } from '../dtos/criar-cobranca.dto';
import {
  PixTransacoesRepository,
  PixTransactionCreateInput,
  PixTransactionRecord,
  PrismaClientLike,
} from './pix-transacoes.repository';

export class PixTransacoesRepositoryPrisma implements PixTransacoesRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByIdempotencyKey(idempotencyKey: string): Promise<PixTransactionRecord | null> {
    const record = await this.prisma.pixTransaction.findUnique({
      where: { idempotencyKey },
    });

    return record ? mapPixTransaction(record) : null;
  }

  async findByTxid(txid: string): Promise<PixTransactionRecord | null> {
    const record = await this.prisma.pixTransaction.findUnique({
      where: { txid },
    });

    return record ? mapPixTransaction(record) : null;
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

    const created = await client.pixTransaction.create({
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

    return mapPixTransaction(created);
  }

  async confirmDeposit(
    tx: PrismaClientLike,
    input: { txid: string; e2eId?: string | null },
  ): Promise<PixTransactionRecord | null> {
    const updated = await tx.pixTransaction.updateMany({
      where: {
        txid: input.txid,
        status: { in: ['PENDING', 'FAILED'] },
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

    const record = await tx.pixTransaction.findUnique({
      where: { txid: input.txid },
    });

    return record ? mapPixTransaction(record) : null;
  }
}

function mapPixTransaction(entry: PixTransaction): PixTransactionRecord {
  return {
    id: entry.id,
    accountId: entry.accountId,
    txType: entry.txType as PixTransactionType,
    status: entry.status as PixTransactionStatus,
    amountCents: entry.amountCents,
    currency: entry.currency,
    idempotencyKey: entry.idempotencyKey,
    txid: entry.txid ?? null,
    e2eId: entry.e2eId ?? null,
    provider: entry.provider ?? null,
    externalReference: entry.externalReference ?? null,
    payload: entry.payload ?? null,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    completedAt: entry.completedAt ?? null,
  };
}
