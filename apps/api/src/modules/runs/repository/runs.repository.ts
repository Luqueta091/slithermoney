import { Prisma, PrismaClient } from '@prisma/client';

export type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export type RunRecord = {
  id: string;
  accountId: string;
  arenaId?: string | null;
  stakeCents: bigint;
  status: string;
  multiplier: Prisma.Decimal;
  payoutCents: bigint;
  houseFeeCents: bigint;
  resultReason?: string | null;
  createdAt: Date;
  updatedAt: Date;
  endedAt?: Date | null;
};

export type RunCreateInput = {
  accountId: string;
  arenaId?: string | null;
  stakeCents: bigint;
  status: string;
};

export interface RunsRepository {
  create(input: RunCreateInput, tx?: PrismaClientLike): Promise<RunRecord>;
}
