import { z } from 'zod';
import { REALTIME_PROTOCOL_VERSION } from '@slithermoney/contracts';
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

const DEV_RUN_JOIN_TOKEN_SECRET = 'dev-run-join-token-secret';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  SERVICE_NAME: z.string().default('game-server'),
  APP_VERSION: z.string().default('0.1.0'),
  GIT_SHA: z.string().default('dev'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  TICK_RATE: z.coerce.number().int().positive().default(30),
  SNAPSHOT_RATE: z.coerce.number().int().positive().default(30),
  ROOM_CAPACITY: z.coerce.number().int().positive().default(50),
  NPC_ONLY: z.coerce.boolean().default(true),
  BOT_COUNT: z.coerce.number().int().nonnegative().default(20),
  WORLD_RADIUS: z.coerce.number().positive().default(3000),
  PELLET_TARGET: z.coerce.number().int().positive().default(1260),
  MAX_PELLETS: z.coerce.number().int().positive().default(7000),
  MAX_SEND_POINTS: z.coerce.number().int().positive().default(140),
  BOOST_DROP_SPACING: z.coerce.number().positive().default(26),
  DEATH_PELLET_TARGET: z.coerce.number().int().positive().default(16),
  PROTOCOL_VERSION: z.coerce.number().int().positive().default(REALTIME_PROTOCOL_VERSION),
  PING_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  PONG_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  API_BASE_URL: z.string().default('http://localhost:3000'),
  GAME_SERVER_WEBHOOK_KEY: z.string().optional().default(''),
  RUN_JOIN_TOKEN_SECRET: z.string().optional().default(DEV_RUN_JOIN_TOKEN_SECRET),
  METRICS_INTERNAL_ENABLED: booleanFromEnv.default(false),
  METRICS_INTERNAL_KEY: z.string().optional().default(''),
  API_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  CASHOUT_HOLD_MS: z.coerce.number().int().positive().default(3000),
});

export type GameServerConfig = z.infer<typeof schema>;

export const config: GameServerConfig = loadEnv(schema, {
  NODE_ENV: 'development',
  PORT: 4000,
  SERVICE_NAME: 'game-server',
  APP_VERSION: '0.1.0',
  GIT_SHA: 'dev',
  LOG_LEVEL: 'info',
  TICK_RATE: 30,
  SNAPSHOT_RATE: 30,
  ROOM_CAPACITY: 50,
  NPC_ONLY: true,
  BOT_COUNT: 20,
  WORLD_RADIUS: 3000,
  PELLET_TARGET: 1260,
  MAX_PELLETS: 7000,
  MAX_SEND_POINTS: 140,
  BOOST_DROP_SPACING: 26,
  DEATH_PELLET_TARGET: 16,
  PROTOCOL_VERSION: REALTIME_PROTOCOL_VERSION,
  PING_INTERVAL_MS: 10000,
  PONG_TIMEOUT_MS: 30000,
  API_BASE_URL: 'http://localhost:3000',
  GAME_SERVER_WEBHOOK_KEY: '',
  RUN_JOIN_TOKEN_SECRET: DEV_RUN_JOIN_TOKEN_SECRET,
  METRICS_INTERNAL_ENABLED: false,
  METRICS_INTERNAL_KEY: '',
  API_REQUEST_TIMEOUT_MS: 5000,
  CASHOUT_HOLD_MS: 3000,
});

assertProductionSecurityConfig(config);

function assertProductionSecurityConfig(current: GameServerConfig): void {
  if (current.NODE_ENV !== 'production') {
    return;
  }

  const missing: string[] = [];
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
}
