import { IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import { prisma } from '../../../shared/database/prisma';
import { requireAccountId } from '../../../shared/http/account';
import { sendJson } from '../../../shared/http/response';
import { LedgerEntryResponse } from '../dtos/ledger.dto';
import { parseLedgerStatementQuery } from './ledger-query';
import { LedgerRepositoryPrisma } from '../repository/ledger.repository.impl';
import { LedgerService } from '../services/ledger.service';

const repository = new LedgerRepositoryPrisma(prisma);
const service = new LedgerService(repository);

export async function handleGetLedgerStatement(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId();
  const url = new URL(req.url ?? '/', 'http://localhost');
  const query = parseLedgerStatementQuery(url);

  const result = await service.getStatement(accountId, query);

  sendJson(res, 200, {
    items: result.items.map(mapEntry),
    pagination: {
      limit: query.limit,
      offset: query.offset,
      total: result.total,
    },
  });
}

function mapEntry(entry: {
  id: string;
  accountId: string;
  walletId?: string | null;
  entryType: string;
  direction: string;
  amountCents: bigint;
  currency: string;
  referenceType?: string | null;
  referenceId?: string | null;
  externalReference?: string | null;
  metadata?: unknown | null;
  createdAt: Date;
}): LedgerEntryResponse {
  return {
    id: entry.id,
    account_id: entry.accountId,
    wallet_id: entry.walletId ?? null,
    entry_type: entry.entryType as LedgerEntryResponse['entry_type'],
    direction: entry.direction as LedgerEntryResponse['direction'],
    amount_cents: entry.amountCents.toString(),
    currency: entry.currency,
    reference_type: entry.referenceType ?? null,
    reference_id: entry.referenceId ?? null,
    external_reference: entry.externalReference ?? null,
    metadata: entry.metadata ?? null,
    created_at: entry.createdAt,
  };
}
