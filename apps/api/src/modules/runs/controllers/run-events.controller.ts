import { IncomingMessage, ServerResponse } from 'http';
import { readJsonWithRaw } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { HttpError } from '../../../shared/http/http-error';
import { prisma } from '../../../shared/database/prisma';
import { config } from '../../../shared/config';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { FraudFlagsService } from '../../fraud/services/fraud-flags.service';
import { runEliminatedInputSchema, RunEliminatedResponse } from '../dtos/run-eliminated.dto';
import { runCashoutInputSchema, RunCashoutResponse } from '../dtos/run-cashout.dto';
import { RunsRepositoryPrisma } from '../repository/runs.repository.impl';
import { RunsService } from '../services/runs.service';
import { enforceRunEventsAuth } from '../services/run-events-auth.service';

const HOUSE_FEE_BPS = 1000;

const walletRepository = new CarteirasRepositoryPrisma(prisma);
const ledgerRepository = new LedgerRepositoryPrisma(prisma);
const ledgerService = new LedgerService(ledgerRepository);
const runsRepository = new RunsRepositoryPrisma(prisma);
const fraudFlagsService = new FraudFlagsService(prisma);
const service = new RunsService(prisma, walletRepository, ledgerService, runsRepository);

export async function handleRunEliminated(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { raw, parsed } = await readJsonWithRaw<unknown>(req);
  await enforceRunEventsAuth(req, raw);

  const validated = runEliminatedInputSchema.safeParse(parsed);

  if (!validated.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: validated.error.flatten(),
    });
  }

  const run = await service.eliminateRun({
    runId: validated.data.runId,
    reason: validated.data.reason,
    sizeScore: validated.data.sizeScore,
    multiplier: validated.data.multiplier,
  });

  sendJson(res, 200, mapResponse(run));
}

export async function handleRunCashout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const { raw, parsed } = await readJsonWithRaw<unknown>(req);
  await enforceRunEventsAuth(req, raw);

  const validated = runCashoutInputSchema.safeParse(parsed);

  if (!validated.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: validated.error.flatten(),
    });
  }

  const run = await service.cashoutRun(
    {
      runId: validated.data.runId,
      multiplier: validated.data.multiplier,
      sizeScore: validated.data.sizeScore,
    },
    { feeBps: HOUSE_FEE_BPS },
  );

  await maybeFlagHighCashout(run);

  sendJson(res, 200, mapCashoutResponse(run));
}

function mapResponse(run: {
  id: string;
  status: string;
  resultReason?: string | null;
  endedAt?: Date | null;
}): RunEliminatedResponse {
  return {
    run_id: run.id,
    status: run.status,
    result_reason: run.resultReason ?? null,
    ended_at: run.endedAt ?? null,
  };
}

function mapCashoutResponse(run: {
  id: string;
  accountId: string;
  stakeCents: bigint;
  status: string;
  payoutCents: bigint;
  houseFeeCents: bigint;
  multiplier: unknown;
  endedAt?: Date | null;
}): RunCashoutResponse {
  return {
    run_id: run.id,
    status: run.status,
    payout_cents: run.payoutCents.toString(),
    house_fee_cents: run.houseFeeCents.toString(),
    multiplier: Number(run.multiplier),
    ended_at: run.endedAt ?? null,
  };
}

async function maybeFlagHighCashout(run: {
  id: string;
  accountId: string;
  stakeCents: bigint;
  payoutCents: bigint;
  multiplier: unknown;
}): Promise<void> {
  const multiplier = Number(run.multiplier);
  if (!Number.isFinite(multiplier)) {
    return;
  }

  if (multiplier < config.FRAUD_CASHOUT_MULTIPLIER_THRESHOLD) {
    return;
  }

  await fraudFlagsService.createFlagIfOpen({
    accountId: run.accountId,
    flagType: 'HIGH_CASHOUT_MULTIPLIER',
    severity: 'high',
    details: {
      run_id: run.id,
      multiplier,
      stake_cents: run.stakeCents.toString(),
      payout_cents: run.payoutCents.toString(),
    },
  });
}
