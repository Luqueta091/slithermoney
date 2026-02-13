import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { readJson } from '../../../shared/http/body';
import { requireAccountId } from '../../../shared/http/account';
import { sendJson } from '../../../shared/http/response';
import { ProfileResponse, updateProfileInputSchema } from '../dtos/profile.dto';

export async function handleGetProfileMe(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!account) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  sendJson(res, 200, mapProfile(account));
}

export async function handleUpdateProfileMe(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const body = await readJson<unknown>(req);
  const parsed = updateProfileInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload invalido', {
      issues: parsed.error.flatten(),
    });
  }

  const existing = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true },
  });

  if (!existing) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  const account = await prisma.account.update({
    where: { id: accountId },
    data: {
      displayName: parsed.data.displayName.trim(),
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  sendJson(res, 200, mapProfile(account));
}

function mapProfile(account: {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProfileResponse {
  return {
    account_id: account.id,
    email: account.email,
    display_name: account.displayName,
    created_at: account.createdAt,
    updated_at: account.updatedAt,
  };
}
