import { IncomingMessage, ServerResponse } from 'http';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { HttpError } from '../../../shared/http/http-error';
import { prisma } from '../../../shared/database/prisma';
import {
  authLoginSchema,
  authLogoutSchema,
  authRefreshSchema,
  authSignupSchema,
  AuthResponse,
} from '../dtos/auth.dto';
import { AuthService } from '../services/auth.service';

const service = new AuthService(prisma);

export async function handleAuthSignup(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson<unknown>(req);
  const parsed = authSignupSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const session = await service.signup(parsed.data.email, parsed.data.password, getClientMetadata(req));
  sendJson(res, 200, mapAuthResponse(session));
}

export async function handleAuthLogin(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson<unknown>(req);
  const parsed = authLoginSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const session = await service.login(parsed.data.email, parsed.data.password, getClientMetadata(req));
  sendJson(res, 200, mapAuthResponse(session));
}

export async function handleAuthRefresh(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson<unknown>(req);
  const parsed = authRefreshSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const session = await service.refresh(parsed.data.refreshToken, getClientMetadata(req));
  sendJson(res, 200, mapAuthResponse(session));
}

export async function handleAuthLogout(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const body = await readJson<unknown>(req);
  const parsed = authLogoutSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  await service.logout(parsed.data.refreshToken);
  sendJson(res, 200, { ok: true });
}

function mapAuthResponse(input: {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}): AuthResponse {
  return {
    account_id: input.accountId,
    access_token: input.accessToken,
    refresh_token: input.refreshToken,
    token_type: 'Bearer',
    expires_in: input.expiresIn,
  };
}

function getClientMetadata(req: IncomingMessage): { userAgent?: string; ipAddress?: string } {
  const userAgent = readSingleHeader(req.headers['user-agent']);
  const forwardedFor = readSingleHeader(req.headers['x-forwarded-for']);
  const ipAddress = forwardedFor?.split(',')[0]?.trim() || req.socket.remoteAddress || undefined;
  return {
    userAgent: userAgent || undefined,
    ipAddress,
  };
}

function readSingleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}
