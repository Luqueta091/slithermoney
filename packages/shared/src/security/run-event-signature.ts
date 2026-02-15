import { createHmac } from 'crypto';

export function signRunEventPayload(
  secret: string,
  timestamp: number,
  nonce: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${rawBody}`).digest('hex');
}
