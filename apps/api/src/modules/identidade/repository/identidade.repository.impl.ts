import { PrismaClient } from '@prisma/client';
import { IdentidadeRepository, IdentidadeProfile, IdentidadeUpsertInput } from './identidade.repository';

export class IdentidadeRepositoryPrisma implements IdentidadeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByAccountId(accountId: string): Promise<IdentidadeProfile | null> {
    return this.prisma.identityProfile.findUnique({
      where: { accountId },
    });
  }

  async findByCpf(cpf: string): Promise<IdentidadeProfile | null> {
    return this.prisma.identityProfile.findUnique({
      where: { cpf },
    });
  }

  async upsert(input: IdentidadeUpsertInput): Promise<IdentidadeProfile> {
    await this.prisma.account.upsert({
      where: { id: input.accountId },
      create: { id: input.accountId },
      update: {},
    });

    return this.prisma.identityProfile.upsert({
      where: { accountId: input.accountId },
      create: {
        accountId: input.accountId,
        fullName: input.fullName,
        cpf: input.cpf,
        pixKey: input.pixKey,
        pixKeyType: input.pixKeyType,
        status: input.status,
      },
      update: {
        fullName: input.fullName,
        cpf: input.cpf,
        pixKey: input.pixKey,
        pixKeyType: input.pixKeyType,
        status: input.status,
      },
    });
  }
}
