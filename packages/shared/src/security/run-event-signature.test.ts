import { describe, expect, it } from 'vitest';
import { signRunEventPayload } from './run-event-signature';

describe('signRunEventPayload', () => {
  it('generates deterministic signatures for the same input', () => {
    const secret = 'secret';
    const timestamp = 1700000000;
    const nonce = 'nonce-1234567890';
    const body = '{"runId":"abc"}';

    const first = signRunEventPayload(secret, timestamp, nonce, body);
    const second = signRunEventPayload(secret, timestamp, nonce, body);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes signature when payload changes', () => {
    const secret = 'secret';
    const timestamp = 1700000000;
    const nonce = 'nonce-1234567890';
    const bodyA = '{"runId":"abc"}';
    const bodyB = '{"runId":"xyz"}';

    expect(signRunEventPayload(secret, timestamp, nonce, bodyA)).not.toBe(
      signRunEventPayload(secret, timestamp, nonce, bodyB),
    );
  });
});
