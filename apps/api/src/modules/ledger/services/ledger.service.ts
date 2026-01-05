import { ValidationError } from '../../../shared/errors/validation-error';
import {
  LedgerDirection,
  LedgerEntryType,
  LedgerStatementQuery,
} from '../dtos/ledger.dto';
import {
  LedgerEntryCreateInput,
  LedgerEntryRecord,
  LedgerRepository,
  PrismaClientLike,
} from '../repository/ledger.repository';

export class LedgerService {
  constructor(private readonly repository: LedgerRepository) {}

  async registerMovement(
    input: {
      accountId: string;
      walletId?: string | null;
      entryType: LedgerEntryType;
      direction: LedgerDirection;
      amountCents: number;
      currency?: string;
      referenceType?: string | null;
      referenceId?: string | null;
      externalReference?: string | null;
      metadata?: Record<string, unknown> | null;
    },
    tx?: PrismaClientLike,
  ): Promise<LedgerEntryRecord> {
    const amount = assertPositiveAmount(input.amountCents);

    const entry: LedgerEntryCreateInput = {
      accountId: input.accountId,
      walletId: input.walletId ?? null,
      entryType: input.entryType,
      direction: input.direction,
      amountCents: amount,
      currency: input.currency ?? 'BRL',
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      externalReference: input.externalReference ?? null,
      metadata: input.metadata ?? null,
    };

    return this.repository.createEntry(entry, tx);
  }

  async getStatement(accountId: string, query: LedgerStatementQuery): Promise<{ items: LedgerEntryRecord[]; total: number }> {
    return this.repository.findStatement(accountId, query);
  }
}

function assertPositiveAmount(amountCents: number): bigint {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('Valor inválido');
  }

  return BigInt(amountCents);
}
