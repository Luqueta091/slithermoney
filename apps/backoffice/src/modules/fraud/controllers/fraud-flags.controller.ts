import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { readJson } from '../../../shared/http/body';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

type ResolveFlagRequest = {
  flag_id: string;
  resolution_note?: string;
};

export async function handleResolveFraudFlag(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'write');
  const body = await readJson<ResolveFlagRequest>(req);
  const flagId = body.flag_id;

  if (!flagId || !isUuid(flagId)) {
    throw new HttpError(400, 'invalid_flag_id', 'flag_id invalido');
  }

  const flag = await prisma.fraudFlag.findUnique({ where: { id: flagId } });
  if (!flag) {
    throw new HttpError(404, 'fraud_flag_not_found', 'Flag nao encontrada');
  }

  const before = snapshotFlag(flag);

  const updated = flag.status === 'resolved'
    ? flag
    : await prisma.fraudFlag.update({
        where: { id: flagId },
        data: {
          status: 'resolved',
          resolvedAt: new Date(),
          updatedAt: new Date(),
          details: {
            ...(flag.details && typeof flag.details === 'object' ? flag.details : {}),
            resolution_note: body.resolution_note,
          },
        },
      });

  await recordAuditLog(prisma, {
    action: 'backoffice.fraud_flags.resolve',
    actorUserId: auth.userId,
    actorRole: auth.role,
    targetType: 'fraud_flag',
    targetId: flagId,
    beforeData: before,
    afterData: snapshotFlag(updated),
  });

  sendJson(res, 200, snapshotFlag(updated));
}

function snapshotFlag(flag: {
  id: string;
  accountId?: string | null;
  flagType: string;
  severity: string;
  status: string;
  details?: unknown | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date | null;
}): {
  id: string;
  account_id: string | null;
  flag_type: string;
  severity: string;
  status: string;
  details?: unknown | null;
  created_at: Date;
  updated_at: Date;
  resolved_at: Date | null;
} {
  return {
    id: flag.id,
    account_id: flag.accountId ?? null,
    flag_type: flag.flagType,
    severity: flag.severity,
    status: flag.status,
    details: flag.details ?? null,
    created_at: flag.createdAt,
    updated_at: flag.updatedAt,
    resolved_at: flag.resolvedAt ?? null,
  };
}
