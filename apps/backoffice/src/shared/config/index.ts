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
  PORT: z.coerce.number().int().positive().default(5000),
  SERVICE_NAME: z.string().default('backoffice'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  BACKOFFICE_ACCESS_KEY: z.string().optional().default(''),
  METRICS_INTERNAL_ENABLED: booleanFromEnv.default(false),
  METRICS_INTERNAL_KEY: z.string().optional().default(''),
  JSON_BODY_LIMIT_BYTES: z.coerce.number().int().positive().default(131072),
});

export type BackofficeConfig = z.infer<typeof schema>;

export const config: BackofficeConfig = loadEnv(schema, {
  NODE_ENV: 'development',
  PORT: 5000,
  SERVICE_NAME: 'backoffice',
  APP_VERSION: '0.1.0',
  GIT_SHA: 'dev',
  LOG_LEVEL: 'info',
  BACKOFFICE_ACCESS_KEY: '',
  METRICS_INTERNAL_ENABLED: false,
  METRICS_INTERNAL_KEY: '',
  JSON_BODY_LIMIT_BYTES: 131072,
});

assertProductionSecurityConfig(config);

function assertProductionSecurityConfig(current: BackofficeConfig): void {
  if (current.NODE_ENV !== 'production') {
    return;
  }

  const missing: string[] = [];
  if (!current.BACKOFFICE_ACCESS_KEY) {
    missing.push('BACKOFFICE_ACCESS_KEY');
  }
  if (current.METRICS_INTERNAL_ENABLED && !current.METRICS_INTERNAL_KEY) {
    missing.push('METRICS_INTERNAL_KEY');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required production security config: ${missing.join(', ')}`);
  }
}
