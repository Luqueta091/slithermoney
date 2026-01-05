import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { parseDate, parseLimit, parseOffset } from '../../../shared/http/query';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

export async function handleRuns(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'read');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const accountId = url.searchParams.get('account_id');
  const status = normalizeValue(url.searchParams.get('status'));
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
    ...(createdAt ? { createdAt } : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.run.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.run.count({ where }),
  ]);

  const response = {
    items: items.map((run) => ({
      id: run.id,
      account_id: run.accountId,
      arena_id: run.arenaId,
      stake_cents: run.stakeCents.toString(),
      status: run.status,
      multiplier: run.multiplier.toString(),
      payout_cents: run.payoutCents.toString(),
      house_fee_cents: run.houseFeeCents.toString(),
      result_reason: run.resultReason,
      created_at: run.createdAt,
      updated_at: run.updatedAt,
      ended_at: run.endedAt,
    })),
    pagination: {
      limit,
      offset,
      total,
    },
  };

  await recordAuditLog(prisma, {
    action: 'backoffice.runs.read',
    actorUserId: auth.userId,
    actorRole: auth.role,
    metadata: {
      account_id: accountId ?? undefined,
      status: status ?? undefined,
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
