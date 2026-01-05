import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { parseDate } from '../../../shared/http/query';
import { recordAuditLog } from '../../../shared/audit';

export async function handleDashboard(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'read');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const from = parseDate(url.searchParams.get('from'), 'from');
  const to = parseDate(url.searchParams.get('to'), 'to');
  const createdAt = buildDateFilter(from, to);

  const [depositGroups, withdrawalGroups, runGroups, houseFeeAgg, accountCount] = await Promise.all([
    prisma.pixTransaction.groupBy({
      by: ['status'],
      where: {
        txType: 'DEPOSIT',
        ...(createdAt ? { createdAt } : {}),
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.pixTransaction.groupBy({
      by: ['status'],
      where: {
        txType: 'WITHDRAWAL',
        ...(createdAt ? { createdAt } : {}),
      },
      _count: { _all: true },
      _sum: { amountCents: true },
    }),
    prisma.run.groupBy({
      by: ['status'],
      where: createdAt ? { createdAt } : undefined,
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      _sum: { amountCents: true },
      where: {
        entryType: 'HOUSE_FEE',
        ...(createdAt ? { createdAt } : {}),
      },
    }),
    prisma.account.count({
      where: createdAt ? { createdAt } : undefined,
    }),
  ]);

  const depositsTotal = sumGroupAmounts(depositGroups);
  const withdrawalsTotal = sumGroupAmounts(withdrawalGroups);

  const response = {
    range: {
      from: from?.toISOString() ?? null,
      to: to?.toISOString() ?? null,
    },
    deposits: {
      total_cents: depositsTotal.toString(),
      count: sumGroupCounts(depositGroups),
      by_status: depositGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
        amount_cents: (group._sum.amountCents ?? 0n).toString(),
      })),
    },
    withdrawals: {
      total_cents: withdrawalsTotal.toString(),
      count: sumGroupCounts(withdrawalGroups),
      by_status: withdrawalGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
        amount_cents: (group._sum.amountCents ?? 0n).toString(),
      })),
    },
    runs: {
      total: sumGroupCounts(runGroups),
      by_status: runGroups.map((group) => ({
        status: group.status,
        count: group._count._all,
      })),
    },
    revenue: {
      house_fee_cents: (houseFeeAgg._sum.amountCents ?? 0n).toString(),
    },
    users: {
      total: accountCount,
    },
  };

  await recordAuditLog(prisma, {
    action: 'backoffice.dashboard.read',
    actorUserId: auth.userId,
    actorRole: auth.role,
    metadata: {
      from: response.range.from,
      to: response.range.to,
    },
  });

  sendJson(res, 200, response);
}

type GroupWithAmount = {
  _sum: { amountCents: bigint | null };
  _count: { _all: number };
};

type GroupWithCount = {
  _count: { _all: number };
};

function sumGroupAmounts(groups: GroupWithAmount[]): bigint {
  return groups.reduce((total, group) => total + (group._sum.amountCents ?? 0n), 0n);
}

function sumGroupCounts(groups: GroupWithCount[]): number {
  return groups.reduce((total, group) => total + group._count._all, 0);
}

function buildDateFilter(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) {
    return undefined;
  }

  return {
    ...(from ? { gte: from } : {}),
    ...(to ? { lte: to } : {}),
  };
}
