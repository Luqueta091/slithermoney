import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { readJson } from '../../../shared/http/body';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

type UpdateStakeRequest = {
  stake_id: string;
  label?: string;
  amount_cents?: number | string;
  is_active?: boolean;
  sort_order?: number;
};

export async function handleUpdateStake(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'write');
  const body = await readJson<UpdateStakeRequest>(req);
  const stakeId = body.stake_id;

  if (!stakeId || !isUuid(stakeId)) {
    throw new HttpError(400, 'invalid_stake_id', 'stake_id invalido');
  }

  const updateData = buildUpdateData(body);
  if (Object.keys(updateData).length === 0) {
    throw new HttpError(400, 'invalid_payload', 'Nenhuma alteracao informada');
  }

  const stake = await prisma.stake.findUnique({ where: { id: stakeId } });
  if (!stake) {
    throw new HttpError(404, 'stake_not_found', 'Stake nao encontrada');
  }

  const updated = await prisma.stake.update({
    where: { id: stakeId },
    data: updateData,
  });

  await recordAuditLog(prisma, {
    action: 'backoffice.config.stakes.update',
    actorUserId: auth.userId,
    actorRole: auth.role,
    targetType: 'stake',
    targetId: stakeId,
    beforeData: snapshotStake(stake),
    afterData: snapshotStake(updated),
  });

  sendJson(res, 200, snapshotStake(updated));
}

function buildUpdateData(body: UpdateStakeRequest): {
  label?: string;
  amountCents?: bigint;
  isActive?: boolean;
  sortOrder?: number;
  updatedAt?: Date;
} {
  const data: {
    label?: string;
    amountCents?: bigint;
    isActive?: boolean;
    sortOrder?: number;
    updatedAt?: Date;
  } = {};

  if (body.label !== undefined) {
    const label = body.label.trim();
    if (!label) {
      throw new HttpError(400, 'invalid_label', 'label invalido');
    }
    data.label = label;
  }

  if (body.amount_cents !== undefined) {
    const amount = parseAmountCents(body.amount_cents);
    data.amountCents = amount;
  }

  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') {
      throw new HttpError(400, 'invalid_is_active', 'is_active invalido');
    }
    data.isActive = body.is_active;
  }

  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order) || body.sort_order < 0) {
      throw new HttpError(400, 'invalid_sort_order', 'sort_order invalido');
    }
    data.sortOrder = body.sort_order;
  }

  if (Object.keys(data).length > 0) {
    data.updatedAt = new Date();
  }

  return data;
}

function parseAmountCents(value: number | string): bigint {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : value;

  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_amount', 'amount_cents invalido');
  }

  return BigInt(parsed);
}

function snapshotStake(stake: {
  id: string;
  label: string;
  amountCents: bigint;
  currency: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}): {
  id: string;
  label: string;
  amount_cents: string;
  currency: string;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
} {
  return {
    id: stake.id,
    label: stake.label,
    amount_cents: stake.amountCents.toString(),
    currency: stake.currency,
    is_active: stake.isActive,
    sort_order: stake.sortOrder,
    created_at: stake.createdAt,
    updated_at: stake.updatedAt,
  };
}
