import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { ValidationError } from '../../../shared/errors/validation-error';
import { HttpError } from '../../../shared/http/http-error';
import { recordPixWithdrawalRequested } from '../../../shared/observability/metrics';
import { CarteirasRepository } from '../../carteiras/repository/carteiras.repository';
import { LedgerService } from '../../ledger/services/ledger.service';
import { parsePixKey, type PixKeyType } from '../../identidade/domain/value-objects/pix-key.vo';
import { SolicitarSaqueInput } from '../dtos/solicitar-saque.dto';
import { PixTransacoesRepository, PixTransactionRecord } from '../repository/pix-transacoes.repository';

export class SolicitarSaqueService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pixRepository: PixTransacoesRepository,
    private readonly walletRepository: CarteirasRepository,
    private readonly ledgerService: LedgerService,
  ) {}

  async requestWithdrawal(
    accountId: string,
    input: SolicitarSaqueInput,
    idempotencyKey?: string,
  ): Promise<{ transaction: PixTransactionRecord; idempotencyKey: string }> {
    const amountCents = assertPositiveAmount(input.amountCents);
    const amount = BigInt(amountCents);
    const currency = normalizeCurrency(input.currency);
    const resolvedKey = idempotencyKey ?? randomUUID();
    const pixKeyType = input.pixKeyType as PixKeyType;
    const pixKey = parsePixKey(input.pixKey, pixKeyType);

    const existing = await this.pixRepository.findByIdempotencyKey(resolvedKey);
    if (existing) {
      assertSameRequest(existing, accountId, amount, currency, pixKey, pixKeyType);
      return { transaction: existing, idempotencyKey: resolvedKey };
    }

    try {
      const transaction = await this.prisma.$transaction(async (tx) => {
        await this.walletRepository.ensureAccountAndWallet(accountId, tx);

        const updatedWallet = await this.walletRepository.updateBalancesWithGuard(
          accountId,
          { availableBalanceCents: -amount, blockedBalanceCents: amount },
          { availableBalanceCents: amount },
          tx,
        );

        if (!updatedWallet) {
          throw new ValidationError('Saldo insuficiente');
        }

        const created = await this.pixRepository.create(
          {
            accountId,
            txType: 'WITHDRAWAL',
            status: 'PENDING_APPROVAL',
            amountCents: amount,
            currency,
            idempotencyKey: resolvedKey,
            payload: {
              pix_key: pixKey,
              pix_key_type: pixKeyType,
            },
          },
          tx,
        );

        await this.ledgerService.registerMovement(
          {
            accountId,
            walletId: updatedWallet.id,
            entryType: 'WITHDRAW_REQUEST',
            direction: 'DEBIT',
            amountCents,
            currency,
            referenceType: 'PIX',
            referenceId: created.id,
            externalReference: created.externalReference ?? created.idempotencyKey,
            metadata: {
              idempotency_key: created.idempotencyKey,
            },
          },
          tx,
        );

        return created;
      });

      recordPixWithdrawalRequested();
      return { transaction, idempotencyKey: resolvedKey };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        const existingAfter = await this.pixRepository.findByIdempotencyKey(resolvedKey);
        if (existingAfter) {
          assertSameRequest(existingAfter, accountId, amount, currency, pixKey, pixKeyType);
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
  pixKey: string,
  pixKeyType: PixKeyType,
): void {
  if (existing.accountId !== accountId) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia ja usada');
  }

  if (existing.txType !== 'WITHDRAWAL') {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com tipo diferente');
  }

  if (existing.amountCents !== amountCents || existing.currency !== currency) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com payload diferente');
  }

  const payload = (existing.payload ?? {}) as { pix_key?: string; pix_key_type?: string };
  if (payload.pix_key && payload.pix_key !== pixKey) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com payload diferente');
  }
  if (payload.pix_key_type && payload.pix_key_type !== pixKeyType) {
    throw new HttpError(409, 'idempotency_conflict', 'Chave de idempotencia com payload diferente');
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
