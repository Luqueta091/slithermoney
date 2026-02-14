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

const DEV_ACCESS_TOKEN_SECRET = 'dev-access-token-secret';
const DEV_REFRESH_TOKEN_SECRET = 'dev-refresh-token-secret';
const DEV_RUN_JOIN_TOKEN_SECRET = 'dev-run-join-token-secret';
const DEV_PIX_WEBHOOK_TOKEN = 'dev-pix-webhook-token';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SERVICE_NAME: z.string().default('api'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AUTH_ACCESS_TOKEN_SECRET: z.string().optional().default(DEV_ACCESS_TOKEN_SECRET),
  AUTH_REFRESH_TOKEN_SECRET: z.string().optional().default(DEV_REFRESH_TOKEN_SECRET),
  AUTH_ACCESS_TOKEN_EXPIRES_SECONDS: z.coerce.number().int().positive().default(900),
  AUTH_REFRESH_TOKEN_EXPIRES_SECONDS: z.coerce.number().int().positive().default(2592000),
  AUTH_LEGACY_HEADER_ENABLED: booleanFromEnv.default(true),
  AUTH_LEGACY_HEADER_DEADLINE: z.string().optional().default(''),
  GAME_SERVER_WS_URL: z.string().default('ws://localhost:4000'),
  RUN_JOIN_TOKEN_SECRET: z.string().optional().default(DEV_RUN_JOIN_TOKEN_SECRET),
  RUN_JOIN_TOKEN_EXPIRES_SECONDS: z.coerce.number().int().positive().default(120),
  RUN_MIN_STAKE_CENTS: z.coerce.number().int().positive().default(100),
  RUN_MAX_STAKE_CENTS: z.coerce.number().int().positive().default(100000),
  GAME_SERVER_WEBHOOK_KEY: z.string().optional().default(''),
  CASHOUT_FEE_BPS: z.coerce.number().int().min(0).default(1000),
  FRAUD_WITHDRAWAL_THRESHOLD: z.coerce.number().int().min(1).default(3),
  FRAUD_WITHDRAWAL_WINDOW_HOURS: z.coerce.number().int().min(1).default(24),
  FRAUD_CASHOUT_MULTIPLIER_THRESHOLD: z.coerce.number().positive().default(10),
  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
  PIX_WEBHOOK_TOKEN: z.string().optional().default(DEV_PIX_WEBHOOK_TOKEN),
  PIX_WEBHOOK_LEGACY_HEADER_ENABLED: booleanFromEnv.default(true),
  PIX_WEBHOOK_SECRET: z.string().optional().default(''),
  PIX_PROVIDER: z.enum(['stub', 'bspay']).default('stub'),
  BSPAY_BASE_URL: z.string().default('https://api.bspay.co'),
  BSPAY_TOKEN: z.string().optional().default(''),
  BSPAY_CLIENT_ID: z.string().optional().default(''),
  BSPAY_CLIENT_SECRET: z.string().optional().default(''),
  BSPAY_POSTBACK_URL: z.string().optional().default(''),
  BSPAY_PAYER_NAME: z.string().default('SlitherMoney'),
  BSPAY_QR_EXPIRATION_SECONDS: z.coerce.number().int().positive().default(600),
  METRICS_INTERNAL_ENABLED: booleanFromEnv.default(false),
  METRICS_INTERNAL_KEY: z.string().optional().default(''),
  JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(65536),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(10),
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
  AUTH_ACCESS_TOKEN_SECRET: DEV_ACCESS_TOKEN_SECRET,
  AUTH_REFRESH_TOKEN_SECRET: DEV_REFRESH_TOKEN_SECRET,
  AUTH_ACCESS_TOKEN_EXPIRES_SECONDS: 900,
  AUTH_REFRESH_TOKEN_EXPIRES_SECONDS: 2592000,
  AUTH_LEGACY_HEADER_ENABLED: true,
  AUTH_LEGACY_HEADER_DEADLINE: '',
  GAME_SERVER_WS_URL: 'ws://localhost:4000',
  RUN_JOIN_TOKEN_SECRET: DEV_RUN_JOIN_TOKEN_SECRET,
  RUN_JOIN_TOKEN_EXPIRES_SECONDS: 120,
  RUN_MIN_STAKE_CENTS: 100,
  RUN_MAX_STAKE_CENTS: 100000,
  GAME_SERVER_WEBHOOK_KEY: '',
  CASHOUT_FEE_BPS: 1000,
  FRAUD_WITHDRAWAL_THRESHOLD: 3,
  FRAUD_WITHDRAWAL_WINDOW_HOURS: 24,
  FRAUD_CASHOUT_MULTIPLIER_THRESHOLD: 10,
  CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
  PIX_WEBHOOK_TOKEN: DEV_PIX_WEBHOOK_TOKEN,
  PIX_WEBHOOK_LEGACY_HEADER_ENABLED: true,
  PIX_WEBHOOK_SECRET: '',
  PIX_PROVIDER: 'stub',
  BSPAY_BASE_URL: 'https://api.bspay.co',
  BSPAY_TOKEN: '',
  BSPAY_CLIENT_ID: '',
  BSPAY_CLIENT_SECRET: '',
  BSPAY_POSTBACK_URL: '',
  BSPAY_PAYER_NAME: 'SlitherMoney',
  BSPAY_QR_EXPIRATION_SECONDS: 600,
  METRICS_INTERNAL_ENABLED: false,
  METRICS_INTERNAL_KEY: '',
  JSON_BODY_LIMIT_BYTES: 65536,
  RATE_LIMIT_WINDOW_MS: 60000,
  RATE_LIMIT_AUTH_MAX: 10,
  RATE_LIMIT_IDENTITY_MAX: 10,
  RATE_LIMIT_PIX_MAX: 20,
  RATE_LIMIT_RUNS_MAX: 30,
  RATE_LIMIT_WEBHOOK_MAX: 60,
});

assertProductionSecurityConfig(config);

function assertProductionSecurityConfig(current: ApiConfig): void {
  if (current.NODE_ENV !== 'production') {
    return;
  }

  const missing: string[] = [];
  if (
    !current.AUTH_ACCESS_TOKEN_SECRET ||
    current.AUTH_ACCESS_TOKEN_SECRET === DEV_ACCESS_TOKEN_SECRET
  ) {
    missing.push('AUTH_ACCESS_TOKEN_SECRET');
  }
  if (
    !current.AUTH_REFRESH_TOKEN_SECRET ||
    current.AUTH_REFRESH_TOKEN_SECRET === DEV_REFRESH_TOKEN_SECRET
  ) {
    missing.push('AUTH_REFRESH_TOKEN_SECRET');
  }
  if (!current.PIX_WEBHOOK_TOKEN || current.PIX_WEBHOOK_TOKEN === DEV_PIX_WEBHOOK_TOKEN) {
    missing.push('PIX_WEBHOOK_TOKEN');
  }
  if (!current.GAME_SERVER_WEBHOOK_KEY) {
    missing.push('GAME_SERVER_WEBHOOK_KEY');
  }
  if (
    !current.RUN_JOIN_TOKEN_SECRET ||
    current.RUN_JOIN_TOKEN_SECRET === DEV_RUN_JOIN_TOKEN_SECRET
  ) {
    missing.push('RUN_JOIN_TOKEN_SECRET');
  }
  if (current.METRICS_INTERNAL_ENABLED && !current.METRICS_INTERNAL_KEY) {
    missing.push('METRICS_INTERNAL_KEY');
  }

  if (missing.length > 0) {
    throw new Error(`Missing required production security config: ${missing.join(', ')}`);
  }

  if (
    current.PIX_PROVIDER === 'bspay' &&
    current.BSPAY_POSTBACK_URL &&
    !current.BSPAY_POSTBACK_URL.includes('token=')
  ) {
    throw new Error('BSPAY_POSTBACK_URL must include webhook token query parameter');
  }
}
