import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { requireAccountId } from '../../../shared/http/account';
import { HttpError } from '../../../shared/http/http-error';
import { sendJson } from '../../../shared/http/response';
import { pixTransactionStatusSchema, pixTransactionTypeSchema } from '../dtos/criar-cobranca.dto';

export async function handlePixTransactionsMe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const statusParam = url.searchParams.get('status');
  const txTypeParam = url.searchParams.get('tx_type');
  const txid = url.searchParams.get('txid');
  const id = url.searchParams.get('id');
  const limit = parseLimit(url.searchParams.get('limit'));
  const offset = parseOffset(url.searchParams.get('offset'));

  const status = statusParam ? parseStatus(statusParam) : undefined;
  const txType = txTypeParam ? parseTxType(txTypeParam) : undefined;

  const where = {
    accountId,
    ...(status ? { status } : {}),
    ...(txType ? { txType } : {}),
    ...(txid ? { txid } : {}),
    ...(id ? { id } : {}),
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

  sendJson(res, 200, {
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

  return Math.min(parsed, 100);
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

function parseStatus(value: string): string {
  const parsed = pixTransactionStatusSchema.safeParse(value.toUpperCase());
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_status', 'status invalido');
  }

  return parsed.data;
}

function parseTxType(value: string): string {
  const parsed = pixTransactionTypeSchema.safeParse(value.toUpperCase());
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_tx_type', 'tx_type invalido');
  }

  return parsed.data;
}
