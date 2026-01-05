import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { requireAccountId } from '../../../shared/http/account';
import { HttpError } from '../../../shared/http/http-error';
import { sendJson } from '../../../shared/http/response';

export async function handleRunsMe(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const accountId = requireAccountId();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const status = normalizeValue(url.searchParams.get('status'));
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  const where = {
    accountId,
    ...(status ? { status } : {}),
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

  sendJson(res, 200, {
    items: items.map((run) => ({
      id: run.id,
      status: run.status,
      stake_cents: run.stakeCents.toString(),
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
  });
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 20;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_limit', 'limit invalido');
  }

  return Math.min(parsed, 50);
}

function parseOffset(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, 'invalid_offset', 'offset invalido');
  }

  return parsed;
}

function normalizeValue(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.toUpperCase() : undefined;
}
