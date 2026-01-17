import { IncomingMessage, ServerResponse } from 'http';
import { HttpError } from '../../../shared/http/http-error';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { requireAccountId } from '../../../shared/http/account';
import { readIdempotencyKey } from '../../../shared/http/idempotency';
import { prisma } from '../../../shared/database/prisma';
import { criarCobrancaInputSchema, PixDepositResponse } from '../dtos/criar-cobranca.dto';
import { config } from '../../../shared/config';
import { PixGatewayBspay } from '../gateways/pix.gateway.bspay';
import { PixGatewayStub } from '../gateways/pix.gateway.stub';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { CriarCobrancaService } from '../services/criar-cobranca.service';

const repository = new PixTransacoesRepositoryPrisma(prisma);
const service = new CriarCobrancaService(repository, buildGateway());

export async function handleCreatePixDeposit(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const body = await readJson<unknown>(req);
  const parsed = criarCobrancaInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const idempotencyKey = readIdempotencyKey(req);

  const { transaction, idempotencyKey: resolvedKey } = await service.createDeposit(
    accountId,
    parsed.data,
    idempotencyKey,
  );

  sendJson(res, 200, mapDeposit(transaction, resolvedKey));
}

function mapDeposit(
  transaction: {
    id: string;
    accountId: string;
    status: string;
    amountCents: bigint;
    currency: string;
    txid?: string | null;
    payload?: unknown | null;
    createdAt: Date;
  },
  idempotencyKey: string,
): PixDepositResponse {
  return {
    id: transaction.id,
    account_id: transaction.accountId,
    status: transaction.status as PixDepositResponse['status'],
    amount_cents: transaction.amountCents.toString(),
    currency: transaction.currency,
    idempotency_key: idempotencyKey,
    txid: transaction.txid ?? null,
    payload: (transaction.payload ?? null) as PixDepositResponse['payload'],
    created_at: transaction.createdAt,
  };
}

function buildGateway() {
  if (config.PIX_PROVIDER === 'bspay') {
    return new PixGatewayBspay({
      baseUrl: config.BSPAY_BASE_URL,
      token: config.BSPAY_TOKEN,
      postbackUrl: config.BSPAY_POSTBACK_URL,
      payerName: config.BSPAY_PAYER_NAME,
    });
  }

  return new PixGatewayStub();
}
