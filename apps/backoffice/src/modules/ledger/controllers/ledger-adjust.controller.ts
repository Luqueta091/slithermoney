import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { readJson } from '../../../shared/http/body';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

type AdjustWalletRequest = {
  account_id: string;
  amount_cents: number | string;
  direction: 'CREDIT' | 'DEBIT' | string;
  reason?: string;
  metadata?: Record<string, unknown> | null;
};

export async function handleWalletAdjust(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'write');
  const body = await readJson<AdjustWalletRequest>(req);
  const accountId = body.account_id;

  if (!accountId || !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  const amount = parseAmountCents(body.amount_cents);
  const direction = normalizeDirection(body.direction);
  const metadata = parseMetadata(body.metadata);

  const result = await prisma.$transaction(async (tx) => {
    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
    }

    const existingWallet = await tx.wallet.findUnique({ where: { accountId } });
    const walletBefore = snapshotWallet(existingWallet);

    if (!existingWallet) {
      await tx.wallet.create({
        data: {
          accountId,
          availableBalanceCents: 0n,
          inGameBalanceCents: 0n,
          blockedBalanceCents: 0n,
        },
      });
    }

    if (direction === 'DEBIT') {
      const updated = await tx.wallet.updateMany({
        where: { accountId, availableBalanceCents: { gte: amount } },
        data: {
          availableBalanceCents: { decrement: amount },
        },
      });

      if (updated.count === 0) {
        throw new HttpError(409, 'insufficient_balance', 'Saldo insuficiente');
      }
    } else {
      await tx.wallet.update({
        where: { accountId },
        data: {
          availableBalanceCents: { increment: amount },
        },
      });
    }

    const walletAfter = await tx.wallet.findUnique({ where: { accountId } });
    const adjustmentId = randomUUID();

    const ledgerEntry = await tx.ledgerEntry.create({
      data: {
        accountId,
        walletId: walletAfter?.id ?? null,
        entryType: 'ADMIN_ADJUST',
        direction,
        amountCents: amount,
        currency: walletAfter?.currency ?? 'BRL',
        referenceType: 'ADMIN',
        referenceId: adjustmentId,
        metadata: {
          adjustment_id: adjustmentId,
          reason: body.reason,
          ...metadata,
        },
      },
    });

    await recordAuditLog(tx, {
      action: 'backoffice.wallet.adjust',
      actorUserId: auth.userId,
      actorRole: auth.role,
      targetType: 'account',
      targetId: accountId,
      beforeData: {
        wallet: walletBefore,
      },
      afterData: {
        wallet: snapshotWallet(walletAfter),
        ledger_entry_id: ledgerEntry.id,
      },
      metadata: {
        direction,
        amount_cents: amount.toString(),
        reason: body.reason,
      },
    });

    return {
      ledgerEntryId: ledgerEntry.id,
      wallet: walletAfter,
    };
  });

  sendJson(res, 200, {
    ledger_entry_id: result.ledgerEntryId,
    wallet: snapshotWallet(result.wallet),
  });
}

function parseAmountCents(value: number | string): bigint {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_amount', 'amount_cents invalido');
  }

  return BigInt(parsed);
}

function normalizeDirection(value: string): 'CREDIT' | 'DEBIT' {
  const normalized = value?.toUpperCase();
  if (normalized === 'CREDIT' || normalized === 'DEBIT') {
    return normalized;
  }

  throw new HttpError(400, 'invalid_direction', 'direction invalida');
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'invalid_metadata', 'metadata invalida');
  }

  return value as Record<string, unknown>;
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
