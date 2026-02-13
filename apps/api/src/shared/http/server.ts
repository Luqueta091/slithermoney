import http, { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { config } from '../config';
import { logger } from '../observability/logger';
import { metrics, recordHttpRequest, setHttpInFlight } from '../observability/metrics';
import { handleGetIdentityMe, handleUpsertIdentity } from '../../modules/identidade/controllers/identidade.controller';
import {
  handleGetProfileMe,
  handleUpdateProfileMe,
} from '../../modules/profile/controllers/profile.controller';
import { handleGetWalletMe } from '../../modules/carteiras/controllers/wallet.controller';
import { handleGetLedgerStatement } from '../../modules/ledger/controllers/ledger.controller';
import { handleCreatePixDeposit } from '../../modules/pix/controllers/criar-cobranca.controller';
import { handlePixWebhook } from '../../modules/pix/controllers/webhook-pix.controller';
import { handlePixWithdrawalRequest } from '../../modules/pix/controllers/solicitar-saque.controller';
import { handlePixTransactionsMe } from '../../modules/pix/controllers/pix-transactions.controller';
import { handleStartRun } from '../../modules/runs/controllers/runs.controller';
import { handleRunCashout, handleRunEliminated } from '../../modules/runs/controllers/run-events.controller';
import { handleRunsMe } from '../../modules/runs/controllers/runs-list.controller';
import { handleListStakes } from '../../modules/stakes/controllers/stakes.controller';
import { handleAuthLogin, handleAuthSignup } from '../../modules/auth/controllers/auth.controller';
import { isHttpError, HttpError } from './http-error';
import { withRequestContext } from './request-context';
import { enforceRateLimit, getRateLimitIdentifier } from './rate-limit';
import { sendError, sendJson } from './response';
import { ValidationError } from '../errors/validation-error';

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

const routes: Record<string, Handler> = {
  'GET /': (_req, res) => {
    sendJson(res, 200, {
      message: 'api ok',
    });
  },
  'GET /health': (_req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      service: config.SERVICE_NAME,
      version: config.APP_VERSION,
      revision: config.GIT_SHA,
    });
  },
  'GET /metrics': (_req, res) => {
    sendJson(res, 200, {
      status: 'ok',
      service: config.SERVICE_NAME,
      version: config.APP_VERSION,
      revision: config.GIT_SHA,
      metrics: metrics.snapshot(),
    });
  },
  'POST /auth/signup': handleAuthSignup,
  'POST /auth/login': handleAuthLogin,
  'POST /identity': handleUpsertIdentity,
  'GET /identity/me': handleGetIdentityMe,
  'GET /profile/me': handleGetProfileMe,
  'PATCH /profile/me': handleUpdateProfileMe,
  'GET /wallet/me': handleGetWalletMe,
  'GET /ledger/me': handleGetLedgerStatement,
  'POST /pix/deposits': handleCreatePixDeposit,
  'POST /pix/webhook': handlePixWebhook,
  'POST /pix/withdrawals': handlePixWithdrawalRequest,
  'GET /pix/transactions/me': handlePixTransactionsMe,
  'GET /stakes': handleListStakes,
  'POST /runs/start': handleStartRun,
  'GET /runs/me': handleRunsMe,
  'POST /runs/events/eliminated': handleRunEliminated,
  'POST /runs/events/cashout': handleRunCashout,
};

const rateLimitRules: Record<string, number> = {
  'POST /identity': config.RATE_LIMIT_IDENTITY_MAX,
  'PATCH /profile/me': config.RATE_LIMIT_IDENTITY_MAX,
  'POST /pix/deposits': config.RATE_LIMIT_PIX_MAX,
  'POST /pix/withdrawals': config.RATE_LIMIT_PIX_MAX,
  'POST /pix/webhook': config.RATE_LIMIT_WEBHOOK_MAX,
  'POST /runs/start': config.RATE_LIMIT_RUNS_MAX,
};

export function startServer(): void {
  let inFlight = 0;
  const server = http.createServer((req, res) => {
    withRequestContext(req, res, () => {
      const start = process.hrtime.bigint();
      let recorded = false;
      inFlight += 1;
      setHttpInFlight(inFlight);

      const record = () => {
        if (recorded) {
          return;
        }
        recorded = true;
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        recordHttpRequest(durationMs, res.statusCode);
        inFlight = Math.max(0, inFlight - 1);
        setHttpInFlight(inFlight);
      };

      res.on('finish', record);
      res.on('close', record);
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
    applyCors(req, res);
    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', `http://localhost:${config.PORT}`);
    const key = `${method} ${url.pathname}`;
    const handler = routes[key];

    if (!handler) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    const rule = rateLimitRules[key];
    if (rule) {
      const identifier = getRateLimitIdentifier(req);
      enforceRateLimit({
        key: `${key}:${identifier}`,
        limit: rule,
        windowMs: config.RATE_LIMIT_WINDOW_MS,
      });
    }

    await handler(req, res);
  } catch (error) {
    const err = toHttpError(error);
    if (isHttpError(err)) {
      sendError(res, err);
      return;
    }

    logger.error('request_failed', {
      error: err.message,
    });

    sendError(res, new HttpError(500, 'internal_error', 'Internal server error'));
  }
}

function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = req.headers.origin;
  if (!origin) {
    return;
  }

  const allowedOrigins = parseAllowedOrigins(config.CORS_ALLOWED_ORIGINS);
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    res.setHeader('access-control-allow-origin', origin);
  }

  res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader(
    'access-control-allow-headers',
    'content-type,x-user-id,x-request-id,x-trace-id,x-idempotency-key,x-game-server-key,x-pix-webhook-key',
  );
}

function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function toHttpError(error: unknown): Error | HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (error instanceof ValidationError) {
    return new HttpError(400, 'validation_error', error.message, error.details);
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Unknown error');
}
