import { PixTransaction, PrismaClient } from '@prisma/client';
import { PixTransactionStatus, PixTransactionType } from '../dtos/criar-cobranca.dto';
import { CarteirasRepository } from '../../carteiras/repository/carteiras.repository';
import { LedgerService } from '../../ledger/services/ledger.service';
import { HttpError } from '../../../shared/http/http-error';
import { recordPixDepositConfirmed } from '../../../shared/observability/metrics';
import { PixWebhookInput } from '../dtos/webhook-pix.dto';
import { PixTransacoesRepository, PixTransactionRecord } from '../repository/pix-transacoes.repository';

export class ConfirmarDepositoService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly pixRepository: PixTransacoesRepository,
    private readonly walletRepository: CarteirasRepository,
    private readonly ledgerService: LedgerService,
  ) {}

  async confirm(input: PixWebhookInput): Promise<PixTransactionRecord> {
    const transaction = await this.pixRepository.findByTxid(input.txid);

    if (!transaction) {
      throw new HttpError(404, 'pix_transaction_not_found', 'Transacao Pix nao encontrada');
    }

    if (transaction.txType !== 'DEPOSIT') {
      throw new HttpError(409, 'pix_transaction_conflict', 'Transacao Pix invalida');
    }

    if (!['PENDING', 'CONFIRMED', 'FAILED'].includes(transaction.status)) {
      throw new HttpError(409, 'pix_transaction_conflict', 'Status Pix invalido');
    }

    const currency = normalizeCurrency(input.currency);
    const amountCents = BigInt(input.amountCents);

    if (transaction.currency !== currency) {
      throw new HttpError(409, 'pix_transaction_conflict', 'Moeda divergente');
    }

    if (transaction.amountCents !== amountCents) {
      throw new HttpError(409, 'pix_transaction_conflict', 'Valor divergente');
    }

    if (transaction.status === 'CONFIRMED') {
      return transaction;
    }

    if (transaction.status === 'FAILED') {
      throw new HttpError(409, 'pix_transaction_conflict', 'Transacao Pix falhou');
    }

    let confirmationMs: number | null = null;
    const result = await this.prisma.$transaction(async (tx) => {
      const confirmed = await this.pixRepository.confirmDeposit(tx, {
        txid: input.txid,
        e2eId: input.e2eId ?? null,
      });

      if (!confirmed) {
        const current = await tx.pixTransaction.findUnique({
          where: { txid: input.txid },
        });

        if (!current) {
          throw new HttpError(404, 'pix_transaction_not_found', 'Transacao Pix nao encontrada');
        }

        if (current.status === 'FAILED') {
          throw new HttpError(409, 'pix_transaction_conflict', 'Transacao Pix falhou');
        }

        return mapPixTransaction(current);
      }

      confirmationMs = Date.now() - transaction.createdAt.getTime();
      await this.walletRepository.ensureAccountAndWallet(transaction.accountId, tx);

      const wallet = await this.walletRepository.updateBalances(
        transaction.accountId,
        { availableBalanceCents: transaction.amountCents },
        tx,
      );

      await this.ledgerService.registerMovement(
        {
          accountId: transaction.accountId,
          walletId: wallet.id,
          entryType: 'DEPOSIT',
          direction: 'CREDIT',
          amountCents: Number(transaction.amountCents),
          currency: transaction.currency,
          referenceType: 'PIX',
          referenceId: confirmed.id,
          externalReference: confirmed.e2eId ?? confirmed.txid ?? null,
          metadata: {
            txid: confirmed.txid,
            e2e_id: confirmed.e2eId ?? null,
          },
        },
        tx,
      );

      return confirmed;
    });

    if (confirmationMs !== null) {
      recordPixDepositConfirmed(confirmationMs);
    }

    return result;
  }
}

function normalizeCurrency(currency?: string): string {
  return (currency ?? 'BRL').trim().toUpperCase();
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
