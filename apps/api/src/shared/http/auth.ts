import { IncomingMessage } from 'http';
import { verifyToken } from '@slithermoney/shared';
import { prisma } from '../database/prisma';
import { config } from '../config';
import { logger } from '../observability/logger';
import { isUuid } from '../validation/uuid';
import { HttpError } from './http-error';

export type AccountAuthMode = 'read' | 'write';

type ResolvedAccountAuth = {
  accountId: string;
  source: 'jwt' | 'legacy_header';
  tokenId?: string;
};

type AccessTokenClaims = {
  sub?: string;
  type?: string;
};

export async function resolveAccountAuth(
  req: IncomingMessage,
  mode: AccountAuthMode,
): Promise<ResolvedAccountAuth> {
  const bearerToken = extractBearerToken(req.headers.authorization);
  if (bearerToken) {
    const parsed = verifyToken<AccessTokenClaims>(bearerToken, config.AUTH_ACCESS_TOKEN_SECRET);
    if (!parsed.ok) {
      throw new HttpError(401, 'unauthorized', 'Access token invalido');
    }

    const accountId = parsed.payload.sub;
    if (!accountId || !isUuid(accountId) || parsed.payload.type !== 'access') {
      throw new HttpError(401, 'unauthorized', 'Access token invalido');
    }

    await assertAccountActive(accountId);
    return {
      accountId,
      source: 'jwt',
      tokenId: parsed.payload.jti,
    };
  }

  if (mode === 'read' && isLegacyHeaderAllowed()) {
    const legacyAccountId = readSingleHeader(req.headers['x-user-id']);
    if (legacyAccountId) {
      if (!isUuid(legacyAccountId)) {
        throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
      }

      await assertAccountActive(legacyAccountId);
      logger.warn('legacy_auth_header_used', {
        account_id: legacyAccountId,
        path: req.url,
      });

      return {
        accountId: legacyAccountId,
        source: 'legacy_header',
      };
    }
  }

  throw new HttpError(401, 'unauthorized', 'Autenticacao obrigatoria');
}

function extractBearerToken(value: string | string[] | undefined): string | null {
  const raw = readSingleHeader(value);
  if (!raw) {
    return null;
  }

  const [type, token] = raw.trim().split(/\s+/, 2);
  if (!type || !token || type.toLowerCase() !== 'bearer') {
    return null;
  }

  return token;
}

function readSingleHeader(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function isLegacyHeaderAllowed(): boolean {
  if (!config.AUTH_LEGACY_HEADER_ENABLED) {
    return false;
  }

  const deadline = config.AUTH_LEGACY_HEADER_DEADLINE?.trim();
  if (!deadline) {
    return true;
  }

  const parsed = Date.parse(deadline);
  if (Number.isNaN(parsed)) {
    return false;
  }

  return Date.now() <= parsed;
}

async function assertAccountActive(accountId: string): Promise<void> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      status: true,
    },
  });

  if (!account) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  if (account.status !== 'active') {
    throw new HttpError(403, 'account_banned', 'Conta inativa');
  }
}
