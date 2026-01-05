import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { parseDate, parseLimit, parseOffset } from '../../../shared/http/query';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

export async function handlePixTransactions(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'read');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const accountId = url.searchParams.get('account_id');
  const status = normalizeValue(url.searchParams.get('status'));
  const txType = normalizeValue(url.searchParams.get('tx_type'));
  const from = parseDate(url.searchParams.get('from'), 'from');
  const to = parseDate(url.searchParams.get('to'), 'to');
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  if (accountId && !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  const createdAt = buildDateFilter(from, to);

  const where = {
    ...(accountId ? { accountId } : {}),
    ...(status ? { status } : {}),
    ...(txType ? { txType } : {}),
    ...(createdAt ? { createdAt } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.pixTransaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.pixTransaction.count({ where }),
  ]);

  const response = {
    items: items.map((item) => ({
      id: item.id,
      account_id: item.accountId,
      tx_type: item.txType,
      status: item.status,
      amount_cents: item.amountCents.toString(),
      currency: item.currency,
      idempotency_key: item.idempotencyKey,
      txid: item.txid,
      e2e_id: item.e2eId,
      provider: item.provider,
      external_reference: item.externalReference,
      payload: item.payload,
      created_at: item.createdAt,
      updated_at: item.updatedAt,
      completed_at: item.completedAt,
    })),
    pagination: {
      limit,
      offset,
      total,
    },
  };

  await recordAuditLog(prisma, {
    action: 'backoffice.pix_transactions.read',
    actorUserId: auth.userId,
    actorRole: auth.role,
    metadata: {
      account_id: accountId ?? undefined,
      status: status ?? undefined,
      tx_type: txType ?? undefined,
      from: from?.toISOString() ?? undefined,
      to: to?.toISOString() ?? undefined,
      limit,
      offset,
      total,
    },
  });

  sendJson(res, 200, response);
}

function normalizeValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : undefined;
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
