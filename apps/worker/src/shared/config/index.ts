import { z } from 'zod';
import { loadEnv } from '@slithermoney/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('worker'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  PORT: z.coerce.number().int().positive().default(7000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
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
  HEARTBEAT_MS: 30000,
  PIX_WITHDRAWAL_POLL_MS: 10000,
  PIX_DEPOSIT_EXPIRATION_MS: 1800000,
  PIX_DEPOSIT_EXPIRATION_POLL_MS: 60000,
  PIX_RECONCILIATION_POLL_MS: 60000,
  PIX_RECONCILIATION_LOOKBACK_HOURS: 24,
  PIX_RECONCILIATION_BATCH_SIZE: 50,
});
