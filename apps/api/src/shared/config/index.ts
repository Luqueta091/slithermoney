import { z } from 'zod';
import { loadEnv } from '@slithermoney/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SERVICE_NAME: z.string().default('api'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GAME_SERVER_WS_URL: z.string().default('ws://localhost:4000'),
  RUN_MIN_STAKE_CENTS: z.coerce.number().int().positive().default(100),
  RUN_MAX_STAKE_CENTS: z.coerce.number().int().positive().default(100000),
  GAME_SERVER_WEBHOOK_KEY: z.string().optional().default(''),
  CASHOUT_FEE_BPS: z.coerce.number().int().min(0).default(1000),
  FRAUD_WITHDRAWAL_THRESHOLD: z.coerce.number().int().min(1).default(3),
  FRAUD_WITHDRAWAL_WINDOW_HOURS: z.coerce.number().int().min(1).default(24),
  FRAUD_CASHOUT_MULTIPLIER_THRESHOLD: z.coerce.number().positive().default(10),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  PIX_WEBHOOK_SECRET: z.string().optional().default(''),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_IDENTITY_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_PIX_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_RUNS_MAX: z.coerce.number().int().positive().default(30),
  RATE_LIMIT_WEBHOOK_MAX: z.coerce.number().int().positive().default(60),
});

export type ApiConfig = z.infer<typeof schema>;

export const config: ApiConfig = loadEnv(schema, {
  NODE_ENV: 'development',
  PORT: 3000,
  SERVICE_NAME: 'api',
  APP_VERSION: '0.1.0',
  GIT_SHA: 'dev',
  LOG_LEVEL: 'info',
  GAME_SERVER_WS_URL: 'ws://localhost:4000',
  RUN_MIN_STAKE_CENTS: 100,
  RUN_MAX_STAKE_CENTS: 100000,
  GAME_SERVER_WEBHOOK_KEY: '',
  CASHOUT_FEE_BPS: 1000,
  FRAUD_WITHDRAWAL_THRESHOLD: 3,
  FRAUD_WITHDRAWAL_WINDOW_HOURS: 24,
  FRAUD_CASHOUT_MULTIPLIER_THRESHOLD: 10,
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  PIX_WEBHOOK_SECRET: '',
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_IDENTITY_MAX: 10,
  RATE_LIMIT_PIX_MAX: 20,
  RATE_LIMIT_RUNS_MAX: 30,
  RATE_LIMIT_WEBHOOK_MAX: 60,
});
