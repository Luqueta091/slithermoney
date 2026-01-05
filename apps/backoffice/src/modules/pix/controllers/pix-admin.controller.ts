import { IncomingMessage, ServerResponse } from 'http';
import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { readJson } from '../../../shared/http/body';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

type PixReprocessRequest = {
  transaction_id: string;
  action?: 'REPAIR_DEPOSIT' | 'MARK_PAID' | 'MARK_FAILED' | string;
  reason?: string;
  metadata?: Record<string, unknown> | null;
};

export async function handlePixReprocess(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'write');
  const body = await readJson<PixReprocessRequest>(req);
  const transactionId = body.transaction_id;

  if (!transactionId || !isUuid(transactionId)) {
    throw new HttpError(400, 'invalid_transaction_id', 'transaction_id invalido');
  }

  const result = await prisma.$transaction(async (tx) => {
    const transaction = await tx.pixTransaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new HttpError(404, 'pix_transaction_not_found', 'Transacao Pix nao encontrada');
    }

    if (transaction.txType === 'DEPOSIT') {
      const repaired = await reprocessDeposit(tx, transaction, body);
      await recordAuditLog(tx, {
        action: 'backoffice.pix.reprocess_deposit',
        actorUserId: auth.userId,
        actorRole: auth.role,
        targetType: 'pix_transaction',
        targetId: transaction.id,
        beforeData: repaired.before,
        afterData: repaired.after,
        metadata: {
          reason: body.reason,
          repaired: repaired.repaired,
        },
      });

      return {
        transaction,
        repaired: repaired.repaired,
      };
    }

    if (transaction.txType === 'WITHDRAWAL') {
      const action = normalizeAction(body.action);
      const updated = await resolveWithdrawal(tx, transaction, action, body);

      await recordAuditLog(tx, {
        action: `backoffice.pix.withdrawal_${action.toLowerCase()}`,
        actorUserId: auth.userId,
        actorRole: auth.role,
        targetType: 'pix_transaction',
        targetId: transaction.id,
        beforeData: updated.before,
        afterData: updated.after,
        metadata: {
          reason: body.reason,
          action,
        },
      });

      return {
        transaction: updated.transaction,
        repaired: updated.updated,
      };
    }

    throw new HttpError(409, 'pix_transaction_invalid', 'Transacao Pix invalida');
  });

  sendJson(res, 200, {
    id: result.transaction.id,
    account_id: result.transaction.accountId,
    tx_type: result.transaction.txType,
    status: result.transaction.status,
    amount_cents: result.transaction.amountCents.toString(),
    currency: result.transaction.currency,
    updated: result.repaired,
  });
}

type DepositRepairResult = {
  repaired: boolean;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

async function reprocessDeposit(
  tx: PrismaClient | Prisma.TransactionClient,
  transaction: {
    id: string;
    accountId: string;
    amountCents: bigint;
    currency: string;
    status: string;
    txid?: string | null;
    e2eId?: string | null;
  },
  body: PixReprocessRequest,
): Promise<DepositRepairResult> {
  if (transaction.status !== 'CONFIRMED') {
    throw new HttpError(409, 'pix_transaction_invalid', 'Deposito nao confirmado');
  }

  const existingLedger = await tx.ledgerEntry.findFirst({
    where: {
      entryType: 'DEPOSIT',
      referenceType: 'PIX',
      referenceId: transaction.id,
    },
    select: { id: true },
  });

  if (existingLedger) {
    return { repaired: false, before: null, after: null };
  }

  await tx.account.upsert({
    where: { id: transaction.accountId },
    create: { id: transaction.accountId },
    update: {},
  });

  const walletBefore = await tx.wallet.findUnique({
    where: { accountId: transaction.accountId },
  });

  const wallet = await tx.wallet.upsert({
    where: { accountId: transaction.accountId },
    create: {
      accountId: transaction.accountId,
      availableBalanceCents: transaction.amountCents,
    },
    update: {
      availableBalanceCents: { increment: transaction.amountCents },
    },
  });

  await tx.ledgerEntry.create({
    data: {
      accountId: transaction.accountId,
      walletId: wallet.id,
      entryType: 'DEPOSIT',
      direction: 'CREDIT',
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      referenceType: 'PIX',
      referenceId: transaction.id,
      externalReference: transaction.e2eId ?? transaction.txid ?? null,
      metadata: {
        txid: transaction.txid ?? null,
        e2e_id: transaction.e2eId ?? null,
        repaired: true,
        reason: body.reason,
      },
    },
  });

  return {
    repaired: true,
    before: {
      wallet: snapshotWallet(walletBefore),
    },
    after: {
      wallet: snapshotWallet(wallet),
    },
  };
}

type WithdrawalResolutionResult = {
  updated: boolean;
  transaction: {
    id: string;
    accountId: string;
    amountCents: bigint;
    currency: string;
    status: string;
  };
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

async function resolveWithdrawal(
  tx: PrismaClient | Prisma.TransactionClient,
  transaction: {
    id: string;
    accountId: string;
    amountCents: bigint;
    currency: string;
    status: string;
    txid?: string | null;
    externalReference?: string | null;
  },
  action: 'MARK_PAID' | 'MARK_FAILED',
  body: PixReprocessRequest,
): Promise<WithdrawalResolutionResult> {
  if (transaction.status === 'PAID' || transaction.status === 'FAILED') {
    if (
      (transaction.status === 'PAID' && action === 'MARK_PAID') ||
      (transaction.status === 'FAILED' && action === 'MARK_FAILED')
    ) {
      return {
        updated: false,
        transaction,
        before: null,
        after: null,
      };
    }

    throw new HttpError(409, 'pix_transaction_invalid', 'Transacao Pix ja finalizada');
  }

  if (transaction.status !== 'REQUESTED') {
    throw new HttpError(409, 'pix_transaction_invalid', 'Transacao Pix nao esta pendente');
  }

  const existingLedger = await tx.ledgerEntry.findFirst({
    where: {
      entryType: action === 'MARK_PAID' ? 'WITHDRAW_PAID' : 'WITHDRAW_FAILED',
      referenceType: 'PIX',
      referenceId: transaction.id,
    },
    select: { id: true },
  });

  if (existingLedger) {
    throw new HttpError(409, 'ledger_entry_exists', 'Lancamento ja registrado');
  }

  const walletBefore = await tx.wallet.findUnique({ where: { accountId: transaction.accountId } });
  const before = {
    transaction_status: transaction.status,
    wallet: snapshotWallet(walletBefore),
  };

  if (!walletBefore) {
    throw new HttpError(409, 'wallet_not_found', 'Carteira nao encontrada');
  }

  if (action === 'MARK_PAID') {
    const updated = await tx.pixTransaction.updateMany({
      where: { id: transaction.id, status: 'REQUESTED' },
      data: {
        status: 'PAID',
        completedAt: new Date(),
        updatedAt: new Date(),
      },
    });

    if (updated.count === 0) {
      return { updated: false, transaction, before, after: null };
    }

    const walletUpdated = await tx.wallet.updateMany({
      where: {
        accountId: transaction.accountId,
        blockedBalanceCents: { gte: transaction.amountCents },
      },
      data: {
        blockedBalanceCents: { decrement: transaction.amountCents },
      },
    });

    if (walletUpdated.count === 0) {
      throw new HttpError(409, 'insufficient_balance', 'Saldo bloqueado insuficiente');
    }

    const walletAfter = await tx.wallet.findUnique({ where: { accountId: transaction.accountId } });

    await tx.ledgerEntry.create({
      data: {
        accountId: transaction.accountId,
        walletId: walletAfter?.id ?? null,
        entryType: 'WITHDRAW_PAID',
        direction: 'DEBIT',
        amountCents: transaction.amountCents,
        currency: transaction.currency,
        referenceType: 'PIX',
        referenceId: transaction.id,
        externalReference: transaction.externalReference ?? null,
        metadata: {
          txid: transaction.txid ?? null,
          reason: body.reason,
        },
      },
    });

    const updatedTransaction = await tx.pixTransaction.findUnique({ where: { id: transaction.id } });

    return {
      updated: true,
      transaction: updatedTransaction ?? transaction,
      before,
      after: {
        transaction_status: updatedTransaction?.status ?? 'PAID',
        wallet: snapshotWallet(walletAfter),
      },
    };
  }

  const updated = await tx.pixTransaction.updateMany({
    where: { id: transaction.id, status: 'REQUESTED' },
    data: {
      status: 'FAILED',
      completedAt: new Date(),
      updatedAt: new Date(),
    },
  });

  if (updated.count === 0) {
    return { updated: false, transaction, before, after: null };
  }

  const walletUpdated = await tx.wallet.updateMany({
    where: {
      accountId: transaction.accountId,
      blockedBalanceCents: { gte: transaction.amountCents },
    },
    data: {
      blockedBalanceCents: { decrement: transaction.amountCents },
      availableBalanceCents: { increment: transaction.amountCents },
    },
  });

  if (walletUpdated.count === 0) {
    throw new HttpError(409, 'insufficient_balance', 'Saldo bloqueado insuficiente');
  }

  const walletAfter = await tx.wallet.findUnique({ where: { accountId: transaction.accountId } });

  await tx.ledgerEntry.create({
    data: {
      accountId: transaction.accountId,
      walletId: walletAfter?.id ?? null,
      entryType: 'WITHDRAW_FAILED',
      direction: 'CREDIT',
      amountCents: transaction.amountCents,
      currency: transaction.currency,
      referenceType: 'PIX',
      referenceId: transaction.id,
      externalReference: transaction.externalReference ?? null,
      metadata: {
        txid: transaction.txid ?? null,
        reason: body.reason,
      },
    },
  });

  const updatedTransaction = await tx.pixTransaction.findUnique({ where: { id: transaction.id } });

  return {
    updated: true,
    transaction: updatedTransaction ?? transaction,
    before,
    after: {
      transaction_status: updatedTransaction?.status ?? 'FAILED',
      wallet: snapshotWallet(walletAfter),
    },
  };
}

function normalizeAction(value: PixReprocessRequest['action']): 'MARK_PAID' | 'MARK_FAILED' {
  if (!value) {
    throw new HttpError(400, 'invalid_action', 'action obrigatoria');
  }

  const normalized = value.toUpperCase();
  if (normalized === 'MARK_PAID' || normalized === 'MARK_FAILED') {
    return normalized;
  }

  throw new HttpError(400, 'invalid_action', 'action invalida');
}

function snapshotWallet(wallet: {
  id: string;
  availableBalanceCents: bigint;
  inGameBalanceCents: bigint;
  blockedBalanceCents: bigint;
  currency: string;
} | null):
  | {
      id: string;
      available_balance_cents: string;
      in_game_balance_cents: string;
      blocked_balance_cents: string;
      currency: string;
    }
  | null {
  if (!wallet) {
    return null;
  }

  return {
    id: wallet.id,
    available_balance_cents: wallet.availableBalanceCents.toString(),
    in_game_balance_cents: wallet.inGameBalanceCents.toString(),
    blocked_balance_cents: wallet.blockedBalanceCents.toString(),
    currency: wallet.currency,
  };
}
