import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'crypto';
import { promisify } from 'util';
import { Prisma, PrismaClient } from '@prisma/client';
import { signToken } from '@slithermoney/shared';
import { ValidationError } from '../../../shared/errors/validation-error';
import { HttpError } from '../../../shared/http/http-error';
import { config } from '../../../shared/config';

const scrypt = promisify(scryptCallback);

type PasswordHash = {
  salt: string;
  hash: string;
};

type SessionTokens = {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  async signup(
    email: string,
    password: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<SessionTokens> {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.prisma.account.findFirst({
      where: { email: normalizedEmail },
      select: { id: true },
    });
    if (existing) {
      throw new ValidationError('Email ja cadastrado');
    }

    const passwordHash = await hashPassword(password);
    const account = await this.prisma.account.create({
      data: {
        email: normalizedEmail,
        passwordHash: passwordHash.hash,
        passwordSalt: passwordHash.salt,
      },
      select: { id: true },
    });

    return this.issueSession(account.id, metadata);
  }

  async login(
    email: string,
    password: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<SessionTokens> {
    const normalizedEmail = normalizeEmail(email);
    const account = await this.prisma.account.findFirst({
      where: { email: normalizedEmail },
      select: { id: true, passwordHash: true, passwordSalt: true, status: true },
    });

    if (!account || !account.passwordHash || !account.passwordSalt) {
      throw new ValidationError('Email ou senha invalidos');
    }

    const isValid = await verifyPassword(
      password,
      { hash: account.passwordHash, salt: account.passwordSalt },
    );

    if (!isValid) {
      throw new ValidationError('Email ou senha invalidos');
    }

    assertAccountActive(account.status);
    return this.issueSession(account.id, metadata);
  }

  async refresh(
    refreshToken: string,
    metadata: { userAgent?: string; ipAddress?: string } = {},
  ): Promise<SessionTokens> {
    const hashedToken = hashRefreshToken(refreshToken);
    const now = new Date();

    const currentToken = await this.prisma.authRefreshToken.findFirst({
      where: {
        tokenHash: hashedToken,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      include: {
        account: {
          select: {
            id: true,
            status: true,
          },
        },
      },
    });

    if (!currentToken || !currentToken.account) {
      throw new HttpError(401, 'unauthorized', 'Refresh token invalido');
    }

    assertAccountActive(currentToken.account.status);

    const session = await this.prisma.$transaction(async (tx) => {
      const next = await createRefreshToken(tx, currentToken.account.id, metadata);
      await tx.authRefreshToken.update({
        where: { id: currentToken.id },
        data: {
          revokedAt: now,
          replacedBy: next.id,
          updatedAt: now,
        },
      });

      const accessToken = createAccessToken(currentToken.account.id);
      return {
        accountId: currentToken.account.id,
        accessToken,
        refreshToken: next.raw,
        expiresIn: config.AUTH_ACCESS_TOKEN_EXPIRES_SECONDS,
      };
    });

    return session;
  }

  async logout(refreshToken: string): Promise<void> {
    const hashedToken = hashRefreshToken(refreshToken);
    await this.prisma.authRefreshToken.updateMany({
      where: {
        tokenHash: hashedToken,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  private async issueSession(
    accountId: string,
    metadata: { userAgent?: string; ipAddress?: string },
  ): Promise<SessionTokens> {
    const accessToken = createAccessToken(accountId);

    const refresh = await createRefreshToken(this.prisma, accountId, metadata);

    return {
      accountId,
      accessToken,
      refreshToken: refresh.raw,
      expiresIn: config.AUTH_ACCESS_TOKEN_EXPIRES_SECONDS,
    };
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(16).toString('hex');
  const hashBuffer = (await scrypt(password.trim(), salt, 64)) as Buffer;
  return { salt, hash: hashBuffer.toString('hex') };
}

async function verifyPassword(password: string, stored: PasswordHash): Promise<boolean> {
  const hashBuffer = (await scrypt(password.trim(), stored.salt, 64)) as Buffer;
  const storedBuffer = Buffer.from(stored.hash, 'hex');
  if (storedBuffer.length !== hashBuffer.length) {
    return false;
  }
  return timingSafeEqual(storedBuffer, hashBuffer);
}

function createAccessToken(accountId: string): string {
  return signToken(
    {
      sub: accountId,
      type: 'access',
    },
    config.AUTH_ACCESS_TOKEN_SECRET,
    {
      expiresInSeconds: config.AUTH_ACCESS_TOKEN_EXPIRES_SECONDS,
    },
  );
}

async function createRefreshToken(
  prisma: PrismaClient | Prisma.TransactionClient,
  accountId: string,
  metadata: { userAgent?: string; ipAddress?: string },
): Promise<{ id: string; raw: string }> {
  const raw = randomBytes(48).toString('base64url');
  const tokenHash = hashRefreshToken(raw);
  const expiresAt = new Date(Date.now() + config.AUTH_REFRESH_TOKEN_EXPIRES_SECONDS * 1000);

  const created = await prisma.authRefreshToken.create({
    data: {
      id: randomUUID(),
      accountId,
      tokenHash,
      expiresAt,
      userAgent: sanitizeUserAgent(metadata.userAgent),
      ipAddress: sanitizeIpAddress(metadata.ipAddress),
    },
    select: {
      id: true,
    },
  });

  return {
    id: created.id,
    raw,
  };
}

function hashRefreshToken(rawToken: string): string {
  return createHash('sha256')
    .update(`${config.AUTH_REFRESH_TOKEN_SECRET}:${rawToken}`)
    .digest('hex');
}

function sanitizeUserAgent(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 255);
}

function sanitizeIpAddress(value?: string): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 64);
}

function assertAccountActive(status: string): void {
  if (status !== 'active') {
    throw new HttpError(403, 'account_banned', 'Conta inativa');
  }
}
