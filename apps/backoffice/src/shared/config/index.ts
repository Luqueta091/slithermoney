import { z } from 'zod';
import { loadEnv } from '@slithermoney/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  SERVICE_NAME: z.string().default('backoffice'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  BACKOFFICE_ACCESS_KEY: z.string().optional().default(''),
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
});
