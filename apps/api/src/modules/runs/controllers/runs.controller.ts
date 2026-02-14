import { IncomingMessage, ServerResponse } from 'http';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { HttpError } from '../../../shared/http/http-error';
import { requireAccountId } from '../../../shared/http/account';
import { prisma } from '../../../shared/database/prisma';
import { config } from '../../../shared/config';
import { CarteirasRepositoryPrisma } from '../../carteiras/repository/carteiras.repository.impl';
import { LedgerRepositoryPrisma } from '../../ledger/repository/ledger.repository.impl';
import { LedgerService } from '../../ledger/services/ledger.service';
import { runStartInputSchema, RunStartResponse } from '../dtos/run-start.dto';
import { RunsRepositoryPrisma } from '../repository/runs.repository.impl';
import { RunsService } from '../services/runs.service';

const walletRepository = new CarteirasRepositoryPrisma(prisma);
const ledgerRepository = new LedgerRepositoryPrisma(prisma);
const ledgerService = new LedgerService(ledgerRepository);
const runsRepository = new RunsRepositoryPrisma(prisma);
const service = new RunsService(prisma, walletRepository, ledgerService, runsRepository);

export async function handleStartRun(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('write');
  const body = await readJson<unknown>(req);
  const parsed = runStartInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const result = await service.startRun(accountId, parsed.data, {
    arenaHost: config.GAME_SERVER_WS_URL,
    minStakeCents: config.RUN_MIN_STAKE_CENTS,
    maxStakeCents: config.RUN_MAX_STAKE_CENTS,
  });

  sendJson(res, 200, mapResponse(result));
}

function mapResponse(result: {
  run: {
    id: string;
    status: string;
    stakeCents: bigint;
    createdAt: Date;
  };
  joinToken: string;
  arenaHost: string;
}): RunStartResponse {
  return {
    run_id: result.run.id,
    status: result.run.status,
    stake_cents: result.run.stakeCents.toString(),
    currency: 'BRL',
    arena_host: result.arenaHost,
    join_token: result.joinToken,
    created_at: result.run.createdAt,
  };
}
