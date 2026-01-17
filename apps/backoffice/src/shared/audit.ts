import { PrismaClient, Prisma } from '@prisma/client';
import { getRequestContext } from '@slithermoney/shared';
import { isUuid } from './validation/uuid';

export type AuditLogInput = {
  action: string;
  actorUserId?: string;
  actorRole?: string;
  targetType?: string;
  targetId?: string;
  beforeData?: Prisma.InputJsonValue | null;
  afterData?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function recordAuditLog(
  prisma: PrismaClient | Prisma.TransactionClient,
  input: AuditLogInput,
): Promise<void> {
  const { request_id } = getRequestContext();
  const actorAccountId = input.actorUserId && isUuid(input.actorUserId) ? input.actorUserId : undefined;

  const baseMetadata =
    input.metadata && typeof input.metadata === 'object' && !Array.isArray(input.metadata)
      ? (input.metadata as Record<string, Prisma.InputJsonValue>)
      : {};
  const metadata = compactRecord({
    ...baseMetadata,
    ...(input.actorRole ? { actor_role: input.actorRole } : {}),
    ...(input.actorUserId ? { actor_user_id: input.actorUserId } : {}),
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

function compactRecord(record: Record<string, Prisma.InputJsonValue>): Record<string, Prisma.InputJsonValue> {
  const entries = Object.entries(record).filter(([, value]) => value !== undefined);
  return Object.fromEntries(entries);
}
