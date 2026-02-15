import { IncomingMessage } from 'http';
import { getRequestContext } from '@slithermoney/shared';
import { prisma } from '../database/prisma';
import { logger } from '../observability/logger';
import { HttpError } from './http-error';

export async function enforceRateLimit(options: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<void> {
  const now = Date.now();
  const windowStartMs = now - (now % options.windowMs);
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + options.windowMs * 2);
  const counter = await prisma.rateLimitCounter.upsert({
    where: {
      bucketKey_windowStart: {
        bucketKey: options.key,
        windowStart,
      },
    },
    create: {
      bucketKey: options.key,
      windowStart,
      count: 1,
      expiresAt,
    },
    update: {
      count: {
        increment: 1,
      },
      expiresAt,
    },
    select: {
      count: true,
    },
  });

  if (counter.count > options.limit) {
    throw new HttpError(429, 'rate_limited', 'Muitas requisições, tente novamente');
  }

  maybePruneExpiredRateLimitCounters();
}

export function getRateLimitIdentifier(req: IncomingMessage): string {
  const { user_id } = getRequestContext();
  if (user_id) {
    return `user:${user_id}`;
  }

  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.length > 0) {
    const [first] = forwardedFor.split(',');
    if (first?.trim()) {
      return `ip:${first.trim()}`;
    }
  }

  return `ip:${req.socket.remoteAddress ?? 'unknown'}`;
}

function maybePruneExpiredRateLimitCounters(): void {
  if (Math.random() > 0.01) {
    return;
  }

  void prisma.rateLimitCounter
    .deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    })
    .catch((error) => {
      logger.warn('rate_limit_prune_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    });
}
