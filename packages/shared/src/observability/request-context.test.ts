import { describe, expect, it } from 'vitest';
import { getRequestContext, runWithRequestContext } from './request-context';

describe('request context', () => {
  it('returns the current context inside a scope', () => {
    const context = {
      request_id: 'req-123',
      trace_id: 'trace-123',
      user_id: 'user-123',
    };

    let observed = {};
    runWithRequestContext(context, () => {
      observed = getRequestContext();
    });

    expect(observed).toEqual(context);
  });
});
