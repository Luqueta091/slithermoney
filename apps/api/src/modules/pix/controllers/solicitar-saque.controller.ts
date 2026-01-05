import { IncomingMessage, ServerResponse } from 'http';
import { HttpError } from '../../../shared/http/http-error';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { requireAccountId } from '../../../shared/http/account';
import { readIdempotencyKey } from '../../../shared/http/idempotency';
import { prisma } from '../../../shared/database/prisma';
import { config } from '../../../shared/config';
import { IdentidadeRepositoryPrisma } from '../../identidade/repository/identidade.repository.impl';
import { IdentidadeService } from '../../identidade/services/identidade.service';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { FraudFlagsService } from '../../fraud/services/fraud-flags.service';
import { solicitarSaqueInputSchema, PixWithdrawalResponse } from '../dtos/solicitar-saque.dto';
import { PixTransacoesRepositoryPrisma } from '../repository/pix-transacoes.repository.impl';
import { SolicitarSaqueService } from '../services/solicitar-saque.service';

const pixRepository = new PixTransacoesRepositoryPrisma(prisma);
const walletRepository = new CarteirasRepositoryPrisma(prisma);
const ledgerRepository = new LedgerRepositoryPrisma(prisma);
const ledgerService = new LedgerService(ledgerRepository);
const identityRepository = new IdentidadeRepositoryPrisma(prisma);
const identityService = new IdentidadeService(identityRepository);
const fraudFlagsService = new FraudFlagsService(prisma);
const service = new SolicitarSaqueService(
  prisma,
  pixRepository,
  walletRepository,
  ledgerService,
);

export async function handlePixWithdrawalRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const body = await readJson<unknown>(req);
  const parsed = solicitarSaqueInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  await identityService.assertWithdrawAllowed(accountId);

  const idempotencyKey = readIdempotencyKey(req);

  const { transaction, idempotencyKey: resolvedKey } = await service.requestWithdrawal(
    accountId,
    parsed.data,
    idempotencyKey,
  );

  await maybeFlagWithdrawalFrequency(accountId, transaction.id);

  sendJson(res, 200, mapResponse(transaction, resolvedKey));
}

function mapResponse(
  transaction: {
    id: string;
    accountId: string;
    status: string;
    amountCents: bigint;
    currency: string;
    externalReference?: string | null;
    createdAt: Date;
  },
  idempotencyKey: string,
): PixWithdrawalResponse {
  return {
    id: transaction.id,
    account_id: transaction.accountId,
    status: transaction.status as PixWithdrawalResponse['status'],
    amount_cents: transaction.amountCents.toString(),
    currency: transaction.currency,
    idempotency_key: idempotencyKey,
    external_reference: transaction.externalReference ?? null,
    created_at: transaction.createdAt,
  };
}

async function maybeFlagWithdrawalFrequency(accountId: string, transactionId: string): Promise<void> {
  const windowStart = new Date(Date.now() - config.FRAUD_WITHDRAWAL_WINDOW_HOURS * 60 * 60 * 1000);

  const count = await prisma.pixTransaction.count({
    where: {
      accountId,
      txType: 'WITHDRAWAL',
      createdAt: { gte: windowStart },
    },
  });

  if (count < config.FRAUD_WITHDRAWAL_THRESHOLD) {
    return;
  }

  await fraudFlagsService.createFlagIfOpen({
    accountId,
    flagType: 'WITHDRAWAL_FREQUENCY',
    severity: 'medium',
    details: {
      count,
      window_hours: config.FRAUD_WITHDRAWAL_WINDOW_HOURS,
      latest_transaction_id: transactionId,
    },
  });
}
