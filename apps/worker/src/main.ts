import http from 'http';
import { URL } from 'url';
import { config } from './shared/config';
import { logger } from './shared/observability/logger';
import { metrics, recordRetryError } from './shared/observability/metrics';
import { processPendingWithdrawals } from './processors/pix-withdrawals.processor';
import { expirePendingDeposits } from './processors/pix-deposit-expiration.processor';
import { reconcileConfirmedDeposits } from './processors/pix-reconciliation.processor';

logger.info('worker_started', {
  service: config.SERVICE_NAME,
  version: config.APP_VERSION,
});

const server = http.createServer((req, res) => {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://localhost:${config.PORT}`);

  if (method === 'GET' && url.pathname === '/health') {
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
      }),
    );
    return;
  }

  if (method === 'GET' && url.pathname === '/metrics') {
    if (!canAccessMetrics(req)) {
      res.statusCode = 404;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        status: 'ok',
        service: config.SERVICE_NAME,
        version: config.APP_VERSION,
        revision: config.GIT_SHA,
        metrics: metrics.snapshot(),
      }),
    );
    return;
  }

  res.statusCode = 404;
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ error: 'not_found' }));
});

server.listen(config.PORT, () => {
  logger.info('metrics_server_started', {
    port: config.PORT,
    service: config.SERVICE_NAME,
    version: config.APP_VERSION,
  });
});

server.on('error', (error) => {
  if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    logger.warn('metrics_server_port_in_use', {
      port: config.PORT,
      service: config.SERVICE_NAME,
    });
    return;
  }

  logger.error('metrics_server_error', {
    port: config.PORT,
    service: config.SERVICE_NAME,
    error: error instanceof Error ? error.message : 'unknown_error',
  });
});

const heartbeat = setInterval(() => {
  logger.debug('worker_heartbeat', {
    interval_ms: config.HEARTBEAT_MS,
  });
}, config.HEARTBEAT_MS);

let processingWithdrawals = false;
let processingExpiration = false;
let processingReconciliation = false;

const withdrawalInterval = setInterval(() => {
  if (processingWithdrawals) {
    return;
  }

  processingWithdrawals = true;
  processPendingWithdrawals()
    .catch((error) => {
      recordRetryError();
      logger.error('pix_withdrawal_poll_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    })
    .finally(() => {
      processingWithdrawals = false;
    });
}, config.PIX_WITHDRAWAL_POLL_MS);

const expirationInterval = setInterval(() => {
  if (processingExpiration) {
    return;
  }

  processingExpiration = true;
  expirePendingDeposits(config.PIX_DEPOSIT_EXPIRATION_MS)
    .catch((error) => {
      recordRetryError();
      logger.error('pix_deposit_expiration_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    })
    .finally(() => {
      processingExpiration = false;
    });
}, config.PIX_DEPOSIT_EXPIRATION_POLL_MS);

const reconciliationInterval = setInterval(() => {
  if (processingReconciliation) {
    return;
  }

  processingReconciliation = true;
  reconcileConfirmedDeposits({
    lookbackHours: config.PIX_RECONCILIATION_LOOKBACK_HOURS,
    batchSize: config.PIX_RECONCILIATION_BATCH_SIZE,
  })
    .catch((error) => {
      recordRetryError();
      logger.error('pix_reconciliation_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    })
    .finally(() => {
      processingReconciliation = false;
    });
}, config.PIX_RECONCILIATION_POLL_MS);

const shutdown = (signal: string) => {
  clearInterval(heartbeat);
  clearInterval(withdrawalInterval);
  clearInterval(expirationInterval);
  clearInterval(reconciliationInterval);
  server.close();
  logger.info('worker_shutdown', { signal });
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

function canAccessMetrics(req: http.IncomingMessage): boolean {
  if (config.NODE_ENV !== 'production') {
    return true;
  }

  if (!config.METRICS_INTERNAL_ENABLED) {
    return false;
  }

  const header = req.headers['x-metrics-key'];
  const key = Array.isArray(header) ? header[0] : header;
  return Boolean(key && key === config.METRICS_INTERNAL_KEY);
}
