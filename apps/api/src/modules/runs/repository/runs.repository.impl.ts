import { PrismaClient } from '@prisma/client';
import { RunCreateInput, RunRecord, RunsRepository, PrismaClientLike } from './runs.repository';

export class RunsRepositoryPrisma implements RunsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: RunCreateInput, tx?: PrismaClientLike): Promise<RunRecord> {
    const client = tx ?? this.prisma;

    return client.run.create({
      data: {
        accountId: input.accountId,
        arenaId: input.arenaId ?? null,
        stakeCents: input.stakeCents,
        status: input.status,
      },
    });
  }
}
