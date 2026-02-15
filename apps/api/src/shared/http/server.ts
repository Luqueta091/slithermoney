import http, { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { setRequestContext } from '@slithermoney/shared';
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
import {
  handleOfflineRunCashout,
  handleOfflineRunEliminated,
} from '../../modules/runs/controllers/run-offline.controller';
import { handleRunsMe } from '../../modules/runs/controllers/runs-list.controller';
import { handleListStakes } from '../../modules/stakes/controllers/stakes.controller';
import {
  handleAuthLogin,
  handleAuthLogout,
  handleAuthRefresh,
  handleAuthSignup,
} from '../../modules/auth/controllers/auth.controller';
import { resolveAccountAuth } from './auth';
import { isHttpError, HttpError } from './http-error';
import { withRequestContext } from './request-context';
import { enforceRateLimit, getRateLimitIdentifier } from './rate-limit';
import { sendError, sendJson } from './response';
import { ValidationError } from '../errors/validation-error';

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

type RouteAuth = 'public' | 'read' | 'write';

type RouteConfig = {
  handler: Handler;
  auth: RouteAuth;
  rateLimit?: number;
};

const routes: Record<string, RouteConfig> = {
  'GET /': {
    auth: 'public',
    handler: (_req, res) => {
      sendJson(res, 200, {
        message: 'api ok',
      });
    },
  },
  'GET /health': {
    auth: 'public',
    handler: (_req, res) => {
      sendJson(res, 200, {
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
      });
    },
  },
  'GET /metrics': {
    auth: 'public',
    handler: (req, res) => {
      enforceMetricsAccess(req);
      sendJson(res, 200, {
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
        metrics: metrics.snapshot(),
      });
    },
  },
  'POST /auth/signup': {
    auth: 'public',
    handler: handleAuthSignup,
    rateLimit: config.RATE_LIMIT_AUTH_MAX,
  },
  'POST /auth/login': {
    auth: 'public',
    handler: handleAuthLogin,
    rateLimit: config.RATE_LIMIT_AUTH_MAX,
  },
  'POST /auth/refresh': {
    auth: 'public',
    handler: handleAuthRefresh,
    rateLimit: config.RATE_LIMIT_AUTH_MAX,
  },
  'POST /auth/logout': {
    auth: 'public',
    handler: handleAuthLogout,
    rateLimit: config.RATE_LIMIT_AUTH_MAX,
  },
  'POST /identity': {
    auth: 'write',
    handler: handleUpsertIdentity,
    rateLimit: config.RATE_LIMIT_IDENTITY_MAX,
  },
  'GET /identity/me': {
    auth: 'read',
    handler: handleGetIdentityMe,
  },
  'GET /profile/me': {
    auth: 'read',
    handler: handleGetProfileMe,
  },
  'PATCH /profile/me': {
    auth: 'write',
    handler: handleUpdateProfileMe,
    rateLimit: config.RATE_LIMIT_IDENTITY_MAX,
  },
  'GET /wallet/me': {
    auth: 'read',
    handler: handleGetWalletMe,
  },
  'GET /ledger/me': {
    auth: 'read',
    handler: handleGetLedgerStatement,
  },
  'POST /pix/deposits': {
    auth: 'write',
    handler: handleCreatePixDeposit,
    rateLimit: config.RATE_LIMIT_PIX_MAX,
  },
  'POST /pix/webhook': {
    auth: 'public',
    handler: handlePixWebhook,
    rateLimit: config.RATE_LIMIT_WEBHOOK_MAX,
  },
  'POST /pix/withdrawals': {
    auth: 'write',
    handler: handlePixWithdrawalRequest,
    rateLimit: config.RATE_LIMIT_PIX_MAX,
  },
  'GET /pix/transactions/me': {
    auth: 'read',
    handler: handlePixTransactionsMe,
  },
  'GET /stakes': {
    auth: 'public',
    handler: handleListStakes,
  },
  'POST /runs/start': {
    auth: 'write',
    handler: handleStartRun,
    rateLimit: config.RATE_LIMIT_RUNS_MAX,
  },
  'GET /runs/me': {
    auth: 'read',
    handler: handleRunsMe,
  },
  'POST /runs/offline/cashout': {
    auth: 'write',
    handler: handleOfflineRunCashout,
    rateLimit: config.RATE_LIMIT_RUNS_MAX,
  },
  'POST /runs/offline/eliminated': {
    auth: 'write',
    handler: handleOfflineRunEliminated,
    rateLimit: config.RATE_LIMIT_RUNS_MAX,
  },
  'POST /runs/events/eliminated': {
    auth: 'public',
    handler: handleRunEliminated,
    rateLimit: config.RATE_LIMIT_WEBHOOK_MAX,
  },
  'POST /runs/events/cashout': {
    auth: 'public',
    handler: handleRunCashout,
    rateLimit: config.RATE_LIMIT_WEBHOOK_MAX,
  },
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
    const route = routes[key];

    if (!route) {
      sendJson(res, 404, { error: 'not_found' });
      return;
    }

    if (route.auth === 'read' || route.auth === 'write') {
      const auth = await resolveAccountAuth(req, route.auth);
      setRequestContext({
        user_id: auth.accountId,
        auth_source: auth.source,
        auth_token_id: auth.tokenId,
      });
    }

    if (route.rateLimit) {
      const identifier = getRateLimitIdentifier(req);
      await enforceRateLimit({
        key: `${key}:${identifier}`,
        limit: route.rateLimit,
        windowMs: config.RATE_LIMIT_WINDOW_MS,
      });
    }

    await route.handler(req, res);
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
    'authorization,content-type,x-user-id,x-request-id,x-trace-id,x-idempotency-key,x-game-server-key,x-run-event-timestamp,x-run-event-nonce,x-run-event-signature,x-pix-webhook-key,x-metrics-key',
  );
}

function parseAllowedOrigins(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function enforceMetricsAccess(req: IncomingMessage): void {
  if (config.NODE_ENV !== 'production') {
    return;
  }

  if (!config.METRICS_INTERNAL_ENABLED) {
    throw new HttpError(404, 'not_found', 'Not found');
  }

  const headerValue = req.headers['x-metrics-key'];
  const provided = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!provided || provided !== config.METRICS_INTERNAL_KEY) {
    throw new HttpError(401, 'unauthorized', 'Metrics key invalida');
  }
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
