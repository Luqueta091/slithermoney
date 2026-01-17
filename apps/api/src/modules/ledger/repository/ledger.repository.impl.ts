import { LedgerEntry, PrismaClient } from '@prisma/client';
import { LedgerDirection, LedgerEntryType, LedgerStatementQuery } from '../dtos/ledger.dto';
import {
  LedgerEntryCreateInput,
  LedgerEntryRecord,
  LedgerRepository,
  PrismaClientLike,
} from './ledger.repository';

export class LedgerRepositoryPrisma implements LedgerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createEntry(
    input: LedgerEntryCreateInput,
    tx?: PrismaClientLike,
  ): Promise<LedgerEntryRecord> {
    const client = tx ?? this.prisma;

    const created = await client.ledgerEntry.create({
      data: {
        accountId: input.accountId,
        walletId: input.walletId ?? null,
        entryType: input.entryType,
        direction: input.direction,
        amountCents: input.amountCents,
        currency: input.currency,
        referenceType: input.referenceType ?? null,
        referenceId: input.referenceId ?? null,
        externalReference: input.externalReference ?? null,
        metadata: input.metadata ?? undefined,
      },
    });

    return mapLedgerEntry(created);
  }

  async findStatement(
    accountId: string,
    query: LedgerStatementQuery,
    tx?: PrismaClientLike,
  ): Promise<{ items: LedgerEntryRecord[]; total: number }> {
    const where = buildWhere(accountId, query);
    const client = tx ?? this.prisma;

    const [items, total] = await Promise.all([
      client.ledgerEntry.findMany({
        where,
        orderBy: {
          createdAt: query.order,
        },
        skip: query.offset,
        take: query.limit,
      }),
      client.ledgerEntry.count({ where }),
    ]);

    return { items: items.map(mapLedgerEntry), total };
  }
}

function mapLedgerEntry(entry: LedgerEntry): LedgerEntryRecord {
  return {
    id: entry.id,
    accountId: entry.accountId,
    walletId: entry.walletId ?? null,
    entryType: entry.entryType as LedgerEntryType,
    direction: entry.direction as LedgerDirection,
    amountCents: entry.amountCents,
    currency: entry.currency,
    referenceType: entry.referenceType ?? null,
    referenceId: entry.referenceId ?? null,
    externalReference: entry.externalReference ?? null,
    metadata: entry.metadata ?? null,
    createdAt: entry.createdAt,
  };
}

function buildWhere(accountId: string, query: LedgerStatementQuery) {
  const where: Record<string, unknown> = { accountId };

  if (query.types && query.types.length > 0) {
    where.entryType = { in: query.types };
  }

  if (query.from || query.to) {
    const createdAt: Record<string, Date> = {};
    if (query.from) {
      createdAt.gte = query.from;
    }
    if (query.to) {
      createdAt.lte = query.to;
    }
    where.createdAt = createdAt;
  }

  return where;
}
