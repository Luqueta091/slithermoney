import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { config } from '../../../shared/config';
import { readJson } from '../../../shared/http/body';
import { HttpError } from '../../../shared/http/http-error';
import { requireAccountId } from '../../../shared/http/account';
import { sendJson } from '../../../shared/http/response';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { RunsRepositoryPrisma } from '../repository/runs.repository.impl';
import { RunsService } from '../services/runs.service';
import {
  runOfflineCashoutInputSchema,
  runOfflineEliminatedInputSchema,
} from '../dtos/run-offline.dto';

const walletRepository = new CarteirasRepositoryPrisma(prisma);
const ledgerRepository = new LedgerRepositoryPrisma(prisma);
const ledgerService = new LedgerService(ledgerRepository);
const runsRepository = new RunsRepositoryPrisma(prisma);
const service = new RunsService(prisma, walletRepository, ledgerService, runsRepository);

export async function handleOfflineRunCashout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('write');
  const body = await readJson<unknown>(req);
  const validated = runOfflineCashoutInputSchema.safeParse(body);

  if (!validated.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: validated.error.flatten(),
    });
  }

  await assertRunOwnership(validated.data.runId, accountId);
  const run = await service.cashoutRun(
    {
      runId: validated.data.runId,
      multiplier: validated.data.multiplier,
      sizeScore: validated.data.sizeScore,
    },
    { feeBps: config.CASHOUT_FEE_BPS },
  );

  sendJson(res, 200, {
    run_id: run.id,
    status: run.status,
    payout_cents: run.payoutCents.toString(),
    house_fee_cents: run.houseFeeCents.toString(),
    multiplier: Number(run.multiplier),
    ended_at: run.endedAt ?? null,
  });
}

export async function handleOfflineRunEliminated(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('write');
  const body = await readJson<unknown>(req);
  const validated = runOfflineEliminatedInputSchema.safeParse(body);

  if (!validated.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: validated.error.flatten(),
    });
  }

  await assertRunOwnership(validated.data.runId, accountId);
  const run = await service.eliminateRun({
    runId: validated.data.runId,
    reason: validated.data.reason,
    sizeScore: validated.data.sizeScore,
    multiplier: validated.data.multiplier,
  });

  sendJson(res, 200, {
    run_id: run.id,
    status: run.status,
    result_reason: run.resultReason ?? null,
    ended_at: run.endedAt ?? null,
  });
}

async function assertRunOwnership(runId: string, accountId: string): Promise<void> {
  const run = await prisma.run.findUnique({
    where: { id: runId },
    select: { accountId: true },
  });

  if (!run) {
    throw new HttpError(404, 'run_not_found', 'Run não encontrada');
  }

  if (run.accountId !== accountId) {
    throw new HttpError(403, 'forbidden', 'Run nao pertence ao usuario');
  }
}
