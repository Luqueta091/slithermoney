import { createHmac, randomUUID, timingSafeEqual } from 'crypto';

type TokenPayloadBase = {
  iat: number;
  exp: number;
  jti: string;
};

export type TokenValidationResult<T extends Record<string, unknown>> =
  | { ok: true; payload: T & TokenPayloadBase }
  | { ok: false; reason: string };

export function signToken<T extends Record<string, unknown>>(
  payload: T,
  secret: string,
  options: { expiresInSeconds: number; issuedAtSeconds?: number; tokenId?: string },
): string {
  if (!secret) {
    throw new Error('token secret is required');
  }

  const issuedAt = options.issuedAtSeconds ?? Math.floor(Date.now() / 1000);
  const tokenId = options.tokenId ?? randomUUID();
  const body: T & TokenPayloadBase = {
    ...payload,
    iat: issuedAt,
    exp: issuedAt + options.expiresInSeconds,
    jti: tokenId,
  };

  const headerSegment = encodeJson({ alg: 'HS256', typ: 'JWT' });
  const payloadSegment = encodeJson(body);
  const signingInput = `${headerSegment}.${payloadSegment}`;
  const signature = signHmac(signingInput, secret);

  return `${signingInput}.${signature}`;
}

export function verifyToken<T extends Record<string, unknown>>(
  token: string,
  secret: string,
  options: { nowSeconds?: number } = {},
): TokenValidationResult<T> {
  if (!secret) {
    return { ok: false, reason: 'missing_secret' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, reason: 'invalid_format' };
  }

  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const expected = signHmac(`${headerSegment}.${payloadSegment}`, secret);
  const provided = signatureSegment;

  if (!secureEquals(expected, provided)) {
    return { ok: false, reason: 'invalid_signature' };
  }

  const header = decodeJson<{ alg?: string; typ?: string }>(headerSegment);
  if (!header || header.alg !== 'HS256' || header.typ !== 'JWT') {
    return { ok: false, reason: 'invalid_header' };
  }

  const payload = decodeJson<T & Partial<TokenPayloadBase>>(payloadSegment);
  if (!payload) {
    return { ok: false, reason: 'invalid_payload' };
  }

  if (
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number' ||
    typeof payload.jti !== 'string'
  ) {
    return { ok: false, reason: 'invalid_claims' };
  }

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    return { ok: false, reason: 'expired' };
  }

  return {
    ok: true,
    payload: payload as T & TokenPayloadBase,
  };
}

function signHmac(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('base64url');
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeJson<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

function secureEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
