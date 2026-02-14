import { z } from 'zod';
import { loadEnv } from '@slithermoney/shared';

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') {
      return true;
    }
    if (normalized === 'false') {
      return false;
    }
  }
  return value;
}, z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('worker'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  PORT: z.coerce.number().int().positive().default(7000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  PIX_PROVIDER: z.enum(['stub', 'bspay']).default('stub'),
  BSPAY_BASE_URL: z.string().default('https://api.bspay.co'),
  BSPAY_TOKEN: z.string().optional().default(''),
  BSPAY_CLIENT_ID: z.string().optional().default(''),
  BSPAY_CLIENT_SECRET: z.string().optional().default(''),
  BSPAY_POSTBACK_URL: z.string().optional().default(''),
  METRICS_INTERNAL_ENABLED: booleanFromEnv.default(false),
  METRICS_INTERNAL_KEY: z.string().optional().default(''),
  HEARTBEAT_MS: z.coerce.number().int().positive().default(30000),
  PIX_WITHDRAWAL_POLL_MS: z.coerce.number().int().positive().default(10000),
  PIX_DEPOSIT_EXPIRATION_MS: z.coerce.number().int().positive().default(1800000),
  PIX_DEPOSIT_EXPIRATION_POLL_MS: z.coerce.number().int().positive().default(60000),
  PIX_RECONCILIATION_POLL_MS: z.coerce.number().int().positive().default(60000),
  PIX_RECONCILIATION_LOOKBACK_HOURS: z.coerce.number().int().positive().default(24),
  PIX_RECONCILIATION_BATCH_SIZE: z.coerce.number().int().positive().default(50),
});

export type WorkerConfig = z.infer<typeof schema>;

export const config: WorkerConfig = loadEnv(schema, {
  NODE_ENV: 'development',
  SERVICE_NAME: 'worker',
  APP_VERSION: '0.1.0',
  GIT_SHA: 'dev',
  PORT: 7000,
  LOG_LEVEL: 'info',
  PIX_PROVIDER: 'stub',
  BSPAY_BASE_URL: 'https://api.bspay.co',
  BSPAY_TOKEN: '',
  BSPAY_CLIENT_ID: '',
  BSPAY_CLIENT_SECRET: '',
  BSPAY_POSTBACK_URL: '',
  METRICS_INTERNAL_ENABLED: false,
  METRICS_INTERNAL_KEY: '',
  HEARTBEAT_MS: 30000,
  PIX_WITHDRAWAL_POLL_MS: 10000,
  PIX_DEPOSIT_EXPIRATION_MS: 1800000,
  PIX_DEPOSIT_EXPIRATION_POLL_MS: 60000,
  PIX_RECONCILIATION_POLL_MS: 60000,
  PIX_RECONCILIATION_LOOKBACK_HOURS: 24,
  PIX_RECONCILIATION_BATCH_SIZE: 50,
});

assertProductionSecurityConfig(config);

function assertProductionSecurityConfig(current: WorkerConfig): void {
  if (current.NODE_ENV !== 'production') {
    return;
  }

  if (current.METRICS_INTERNAL_ENABLED && !current.METRICS_INTERNAL_KEY) {
    throw new Error('Missing required production security config: METRICS_INTERNAL_KEY');
  }

  if (
    current.PIX_PROVIDER === 'bspay' &&
    current.BSPAY_POSTBACK_URL &&
    !current.BSPAY_POSTBACK_URL.includes('token=')
  ) {
    throw new Error('BSPAY_POSTBACK_URL must include webhook token query parameter');
  }
}
