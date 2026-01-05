import { IncomingMessage } from 'http';
import { getRequestContext } from '@slithermoney/shared';
import { HttpError } from './http-error';

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitBucket>();

export function enforceRateLimit(options: { key: string; limit: number; windowMs: number }): void {
  const now = Date.now();
  const bucket = buckets.get(options.key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(options.key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;
  if (bucket.count > options.limit) {
    throw new HttpError(429, 'rate_limited', 'Muitas requisições, tente novamente');
  }
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
