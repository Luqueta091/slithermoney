import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { sendJson } from '../../../shared/http/response';

export async function handleListStakes(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  const stakes = await prisma.stake.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  });

  sendJson(res, 200, {
    items: stakes.map((stake) => ({
      id: stake.id,
      label: stake.label,
      amount_cents: stake.amountCents.toString(),
      currency: stake.currency,
      is_active: stake.isActive,
      sort_order: stake.sortOrder,
    })),
  });
}
