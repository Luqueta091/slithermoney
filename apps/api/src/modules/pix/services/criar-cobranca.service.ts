import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { ValidationError } from '../../../shared/errors/validation-error';
import { HttpError } from '../../../shared/http/http-error';
import { recordPixDepositCreated } from '../../../shared/observability/metrics';
import { CriarCobrancaInput } from '../dtos/criar-cobranca.dto';
import { PixGateway } from '../gateways/pix.gateway';
import { PixTransacoesRepository, PixTransactionRecord } from '../repository/pix-transacoes.repository';

export class CriarCobrancaService {
  constructor(
    private readonly repository: PixTransacoesRepository,
    private readonly gateway: PixGateway,
  ) {}

  async createDeposit(
    accountId: string,
    input: CriarCobrancaInput,
    idempotencyKey?: string,
  ): Promise<{ transaction: PixTransactionRecord; idempotencyKey: string }> {
    const amountCents = assertPositiveAmount(input.amountCents);
    const amount = BigInt(amountCents);
    const currency = normalizeCurrency(input.currency);
    const resolvedKey = idempotencyKey ?? randomUUID();

    const existing = await this.repository.findByIdempotencyKey(resolvedKey);
    if (existing) {
      assertSameRequest(existing, accountId, amount, currency);
      return { transaction: existing, idempotencyKey: resolvedKey };
    }

    const charge = await this.gateway.createCharge({
      accountId,
      amountCents,
      currency,
      idempotencyKey: resolvedKey,
    });

    try {
      const transaction = await this.repository.create({
        accountId,
        txType: 'DEPOSIT',
        status: 'PENDING',
        amountCents: amount,
        currency,
        idempotencyKey: resolvedKey,
        txid: charge.txid,
        provider: charge.provider,
        externalReference: charge.externalReference ?? null,
        payload: charge.payload,
      });

      recordPixDepositCreated();
      return { transaction, idempotencyKey: resolvedKey };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existingAfter = await this.repository.findByIdempotencyKey(resolvedKey);
        if (existingAfter) {
          assertSameRequest(existingAfter, accountId, amount, currency);
          return { transaction: existingAfter, idempotencyKey: resolvedKey };
        }
      }

      throw error;
    }
  }
}

function assertPositiveAmount(amountCents: number): number {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('Valor invalido');
  }

  return amountCents;
}

function normalizeCurrency(currency?: string): string {
  return (currency ?? 'BRL').trim().toUpperCase();
}

function assertSameRequest(
  existing: PixTransactionRecord,
  accountId: string,
  amountCents: bigint,
  currency: string,
): void {
  if (existing.accountId !== accountId) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia ja usada');
  }

  if (existing.amountCents !== amountCents || existing.currency !== currency) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com payload diferente');
  }

  if (existing.txType !== 'DEPOSIT') {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com tipo diferente');
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
