import { IncomingMessage } from 'http';
import { HttpError } from './http-error';

export function readIdempotencyKey(req: IncomingMessage): string | undefined {
  const headerValue = req.headers['x-idempotency-key'] ?? req.headers['idempotency-key'];

  if (!headerValue) {
    return undefined;
  }

  if (Array.isArray(headerValue)) {
    throw new HttpError(400, 'invalid_idempotency_key', 'Chave de idempotencia invalida');
  }

  const trimmed = headerValue.trim();
  if (!trimmed) {
    throw new HttpError(400, 'invalid_idempotency_key', 'Chave de idempotencia invalida');
  }

  return trimmed;
}
