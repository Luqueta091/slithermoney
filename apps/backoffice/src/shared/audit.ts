import { PrismaClient, Prisma } from '@prisma/client';
import { getRequestContext } from '@slithermoney/shared';
import { isUuid } from './validation/uuid';

export type AuditLogInput = {
  action: string;
  actorUserId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

export async function recordAuditLog(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: AuditLogInput,
): Promise<void> {
  const { request_id } = getRequestContext();
  const actorAccountId = input.actorUserId && isUuid(input.actorUserId) ? input.actorUserId : undefined;

  const metadata = compactRecord({
    ...(input.metadata ?? {}),
    actor_role: input.actorRole,
    actor_user_id: input.actorUserId,
  });

  await prisma.adminAuditLog.create({
    data: {
      action: input.action,
      actorAccountId,
      targetType: input.targetType,
      targetId: input.targetId,
      beforeData: input.beforeData ?? undefined,
      afterData: input.afterData ?? undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
      requestId: request_id ?? undefined,
    },
  });
}

function compactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}
