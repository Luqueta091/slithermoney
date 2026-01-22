import { IncomingMessage, ServerResponse } from 'http';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { HttpError } from '../../../shared/http/http-error';
import { prisma } from '../../../shared/database/prisma';
import { authLoginSchema, authSignupSchema } from '../dtos/auth.dto';
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

  const accountId = await service.signup(parsed.data.email, parsed.data.password);
  sendJson(res, 200, { account_id: accountId });
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

  const accountId = await service.login(parsed.data.email, parsed.data.password);
  sendJson(res, 200, { account_id: accountId });
}
