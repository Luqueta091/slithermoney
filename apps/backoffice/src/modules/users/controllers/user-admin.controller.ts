import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { readJson } from '../../../shared/http/body';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

type UserStatusRequest = {
  account_id: string;
  reason?: string;
};

export async function handleBanUser(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleUpdateStatus(req, res, 'banned', 'backoffice.users.ban');
}

export async function handleUnbanUser(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleUpdateStatus(req, res, 'active', 'backoffice.users.unban');
}

async function handleUpdateStatus(
  req: IncomingMessage,
  res: ServerResponse,
  status: 'active' | 'banned',
  action: string,
): Promise<void> {
  const auth = requireBackofficeAuth(req, 'write');
  const body = await readJson<UserStatusRequest>(req);
  const accountId = body.account_id;

  if (!accountId || !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  const before = { status: account.status };
  const updated = account.status === status
    ? account
    : await prisma.account.update({
        where: { id: account.id },
        data: {
          status,
          updatedAt: new Date(),
        },
      });

  await recordAuditLog(prisma, {
    action,
    actorUserId: auth.userId,
    actorRole: auth.role,
    targetType: 'account',
    targetId: account.id,
    beforeData: before,
    afterData: { status: updated.status },
    metadata: {
      reason: body.reason,
    },
  });

  sendJson(res, 200, {
    id: updated.id,
    status: updated.status,
    created_at: updated.createdAt,
    updated_at: updated.updatedAt,
  });
}
