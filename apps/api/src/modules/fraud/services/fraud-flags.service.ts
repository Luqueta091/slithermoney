import { PrismaClient } from '@prisma/client';

export type FraudFlagInput = {
  accountId?: string | null;
  flagType: string;
  severity?: 'low' | 'medium' | 'high';
  details?: Record<string, unknown> | null;
};

export class FraudFlagsService {
  constructor(private readonly prisma: PrismaClient) {}

  async createFlag(input: FraudFlagInput): Promise<void> {
    await this.prisma.fraudFlag.create({
      data: {
        accountId: input.accountId ?? null,
        flagType: input.flagType,
        severity: input.severity ?? 'medium',
        status: 'open',
        details: input.details ?? undefined,
      },
    });
  }

  async createFlagIfOpen(input: FraudFlagInput): Promise<void> {
    const existing = await this.prisma.fraudFlag.findFirst({
      where: {
        accountId: input.accountId ?? null,
        flagType: input.flagType,
        status: 'open',
      },
      select: { id: true },
    });

    if (existing) {
      return;
    }

    await this.createFlag(input);
  }
}
