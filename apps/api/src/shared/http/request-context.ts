import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import { runWithRequestContext } from '@slithermoney/shared';
import { logger } from '../observability/logger';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

type HeaderValue = string | string[] | undefined;

export function withRequestContext(
  req: IncomingMessage,
  res: ServerResponse,
  handler: Handler,
): void {
  const requestId = pickHeader(req.headers['x-request-id']) ?? randomUUID();
  const traceId = pickHeader(req.headers['x-trace-id']) ?? requestId;

  res.setHeader('x-request-id', requestId);

  runWithRequestContext(
    {
      request_id: requestId,
      trace_id: traceId,
    },
    () => {
      const startedAt = Date.now();
      res.on('finish', () => {
        logger.info('request_complete', {
          method: req.method,
          path: req.url,
          status_code: res.statusCode,
          duration_ms: Date.now() - startedAt,
        });
      });

      handler(req, res);
    },
  );
}

function pickHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
