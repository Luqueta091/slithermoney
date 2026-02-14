import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { HttpError } from '../../../shared/http/http-error';
import { prisma } from '../../../shared/database/prisma';
import { config } from '../../../shared/config';
import { logger } from '../../../shared/observability/logger';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { pixWebhookInputSchema, PixWebhookResponse } from '../dtos/webhook-pix.dto';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { ConfirmarDepositoService } from '../services/confirmar-deposito.service';

const pixRepository = new PixTransacoesRepositoryPrisma(prisma);
const walletRepository = new CarteirasRepositoryPrisma(prisma);
const ledgerRepository = new LedgerRepositoryPrisma(prisma);
const ledgerService = new LedgerService(ledgerRepository);
const service = new ConfirmarDepositoService(
  prisma,
  pixRepository,
  walletRepository,
  ledgerService,
);

export async function handlePixWebhook(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  enforcePixWebhookKey(req);
  const body = await readJson<unknown>(req);
  const parsed = pixWebhookInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const transaction = await service.confirm(parsed.data);

  sendJson(res, 200, mapResponse(transaction));
}

function enforcePixWebhookKey(req: IncomingMessage): void {
  if (isValidWebhookToken(req)) {
    return;
  }

  if (
    config.PIX_WEBHOOK_LEGACY_HEADER_ENABLED &&
    config.PIX_WEBHOOK_SECRET &&
    isValidLegacyWebhookHeader(req)
  ) {
    logger.warn('pix_webhook_legacy_header_used');
    return;
  }

  throw new HttpError(401, 'unauthorized', 'Chave do webhook Pix invalida');
}

function isValidWebhookToken(req: IncomingMessage): boolean {
  if (!config.PIX_WEBHOOK_TOKEN) {
    return false;
  }

  const url = new URL(req.url ?? '/', 'http://localhost');
  const token = url.searchParams.get('token');
  if (!token) {
    return false;
  }

  return token === config.PIX_WEBHOOK_TOKEN;
}

function isValidLegacyWebhookHeader(req: IncomingMessage): boolean {
  const headerValue = req.headers['x-pix-webhook-key'];
  if (!headerValue || Array.isArray(headerValue)) {
    return false;
  }

  return headerValue === config.PIX_WEBHOOK_SECRET;
}

function mapResponse(transaction: {
  id: string;
  accountId: string;
  status: string;
  txid?: string | null;
  e2eId?: string | null;
  amountCents: bigint;
  currency: string;
  completedAt?: Date | null;
}): PixWebhookResponse {
  return {
    id: transaction.id,
    account_id: transaction.accountId,
    status: transaction.status as PixWebhookResponse['status'],
    txid: transaction.txid ?? '',
    e2e_id: transaction.e2eId ?? null,
    amount_cents: transaction.amountCents.toString(),
    currency: transaction.currency,
    completed_at: transaction.completedAt ?? null,
  };
}
