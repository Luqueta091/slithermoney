import http, { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { config } from './shared/config';
import { logger } from './shared/observability/logger';
import { handleDashboard } from './modules/dashboard/controllers/dashboard.controller';
import { handleUserLookup } from './modules/users/controllers/users.controller';
import { handleBanUser, handleUnbanUser } from './modules/users/controllers/user-admin.controller';
import { handlePixTransactions } from './modules/pix/controllers/pix.controller';
import {
  handlePixReprocess,
  handlePixWithdrawalApprove,
  handlePixWithdrawalReject,
} from './modules/pix/controllers/pix-admin.controller';
import { handleLedgerStatement } from './modules/ledger/controllers/ledger.controller';
import { handleWalletAdjust } from './modules/ledger/controllers/ledger-adjust.controller';
import { handleRuns } from './modules/runs/controllers/runs.controller';
import { handleUpdateStake } from './modules/config/controllers/stakes.controller';
import { handleResolveFraudFlag } from './modules/fraud/controllers/fraud-flags.controller';
import { handleWithdrawalsUi } from './modules/ui/withdrawals-ui';
import { HttpError, isHttpError } from './shared/http/http-error';
import { withRequestContext } from './shared/http/request-context';
import { sendError, sendJson } from './shared/http/response';

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

const routes: Record<string, Handler> = {
  'GET /': (_req, res) => {
    sendJson(res, 200, { message: 'backoffice ok' });
  },
  'GET /health': (_req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      service: config.SERVICE_NAME,
      version: config.APP_VERSION,
      revision: config.GIT_SHA,
    });
  },
  'GET /dashboard': handleDashboard,
  'GET /users': handleUserLookup,
  'POST /users/ban': handleBanUser,
  'POST /users/unban': handleUnbanUser,
  'GET /backoffice': handleWithdrawalsUi,
  'GET /pix/transactions': handlePixTransactions,
  'POST /pix/transactions/reprocess': handlePixReprocess,
  'POST /pix/withdrawals/approve': handlePixWithdrawalApprove,
  'POST /pix/withdrawals/reject': handlePixWithdrawalReject,
  'GET /ledger': handleLedgerStatement,
  'POST /wallet/adjust': handleWalletAdjust,
  'GET /runs': handleRuns,
  'PATCH /config/stakes': handleUpdateStake,
  'POST /fraud/flags/resolve': handleResolveFraudFlag,
};

export function startServer(): void {
  const server = http.createServer((req, res) => {
    withRequestContext(req, res, () => {
      void handleRequest(req, res);
    });
  });

  server.listen(config.PORT, () => {
    logger.info('server_started', {
      port: config.PORT,
      service: config.SERVICE_NAME,
      version: config.APP_VERSION,
    });
  });
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://localhost:${config.PORT}`);
    const key = `${method} ${url.pathname}`;
    const handler = routes[key];

    if (!handler) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    await handler(req, res);
  } catch (error) {
    const err = toHttpError(error);
    if (isHttpError(err)) {
      sendError(res, err);
      return;
    }

    logger.error('request_failed', { error: err.message });
    sendError(res, new HttpError(500, 'internal_error', 'Internal server error'));
  }
}

function toHttpError(error: unknown): Error | HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown error');
}

startServer();
