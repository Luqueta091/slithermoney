import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { parseCommaList, parseDate, parseLimit, parseOffset } from '../../../shared/http/query';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

const ledgerEntryTypes = new Set([
  'DEPOSIT',
  'STAKE_RESERVED',
  'STAKE_RELEASED',
  'STAKE_LOST',
  'PRIZE',
  'HOUSE_FEE',
  'WITHDRAW_REQUEST',
  'WITHDRAW_PAID',
  'WITHDRAW_FAILED',
  'ADMIN_ADJUST',
]);

type SortOrder = 'asc' | 'desc';

export async function handleLedgerStatement(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'read');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const accountId = url.searchParams.get('account_id');
  const typesParam = url.searchParams.get('types') ?? url.searchParams.get('type');
  const types = parseCommaList(typesParam)?.map((item) => item.toUpperCase());
  const order = parseOrder(url.searchParams.get('order'));
  const from = parseDate(url.searchParams.get('from'), 'from');
  const to = parseDate(url.searchParams.get('to'), 'to');
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  if (!accountId || !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  if (types && types.some((type) => !ledgerEntryTypes.has(type))) {
    throw new HttpError(400, 'invalid_entry_type', 'Tipo de lancamento invalido');
  }

  const createdAt = buildDateFilter(from, to);
  const where = {
    accountId,
    ...(types ? { entryType: { in: types } } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: { createdAt: order },
      take: limit,
      skip: offset,
    }),
    prisma.ledgerEntry.count({ where }),
  ]);

  const response = {
    items: items.map((entry) => ({
      id: entry.id,
      account_id: entry.accountId,
      wallet_id: entry.walletId,
      entry_type: entry.entryType,
      direction: entry.direction,
      amount_cents: entry.amountCents.toString(),
      currency: entry.currency,
      reference_type: entry.referenceType,
      reference_id: entry.referenceId,
      external_reference: entry.externalReference,
      metadata: entry.metadata,
      created_at: entry.createdAt,
    })),
    pagination: {
      limit,
      offset,
      total,
    },
  };

  await recordAuditLog(prisma, {
    action: 'backoffice.ledger.read',
    actorUserId: auth.userId,
    actorRole: auth.role,
    targetType: 'account',
    targetId: accountId,
    metadata: {
      types: types ?? undefined,
      from: from?.toISOString() ?? undefined,
      to: to?.toISOString() ?? undefined,
      order,
      limit,
      offset,
      total,
    },
  });

  sendJson(res, 200, response);
}

function parseOrder(value: string | null): SortOrder {
  if (!value) {
    return 'desc';
  }

  const lowered = value.toLowerCase();
  if (lowered === 'asc' || lowered === 'desc') {
    return lowered;
  }

  throw new HttpError(400, 'invalid_order', 'Parametro order invalido');
}

function buildDateFilter(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}
