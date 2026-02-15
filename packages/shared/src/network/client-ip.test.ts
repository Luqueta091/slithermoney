import { describe, expect, it } from 'vitest';
import { IncomingMessage } from 'http';
import { extractClientIp } from './client-ip';

function buildRequest(
  remoteAddress: string,
  headers?: Record<string, string | string[] | undefined>,
): IncomingMessage {
  return {
    headers: headers ?? {},
    socket: {
      remoteAddress,
    },
  } as unknown as IncomingMessage;
}

describe('extractClientIp', () => {
  it('uses remote address when trust proxy is disabled', () => {
    const req = buildRequest('10.0.0.8', {
      'x-forwarded-for': '198.51.100.9, 172.16.0.4',
    });

    expect(
      extractClientIp(req, {
        trustProxyEnabled: false,
        trustedProxyCidrs: ['10.0.0.0/8'],
      }),
    ).toBe('10.0.0.8');
  });

  it('returns nearest untrusted address when trust proxy is enabled', () => {
    const req = buildRequest('10.0.0.8', {
      'x-forwarded-for': '198.51.100.9, 203.0.113.7',
    });

    expect(
      extractClientIp(req, {
        trustProxyEnabled: true,
        trustedProxyCidrs: ['10.0.0.0/8'],
      }),
    ).toBe('203.0.113.7');
  });

  it('normalizes ipv4-mapped remote addresses', () => {
    const req = buildRequest('::ffff:10.20.30.40');

    expect(
      extractClientIp(req, {
        trustProxyEnabled: false,
        trustedProxyCidrs: [],
      }),
    ).toBe('10.20.30.40');
  });

  it('ignores malformed forwarded entries', () => {
    const req = buildRequest('10.0.0.8', {
      'x-forwarded-for': 'malformed, 198.51.100.9',
    });

    expect(
      extractClientIp(req, {
        trustProxyEnabled: true,
        trustedProxyCidrs: ['10.0.0.0/8'],
      }),
    ).toBe('198.51.100.9');
  });
});
