import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { requireAccountId } from '../../../shared/http/account';
import { sendJson } from '../../../shared/http/response';
import { WalletResponse } from '../dtos/wallet.dto';
import { CarteirasRepositoryPrisma } from '../repository/carteiras.repository.impl';
import { CarteirasService } from '../services/carteiras.service';

const repository = new CarteirasRepositoryPrisma(prisma);
const service = new CarteirasService(repository);

export async function handleGetWalletMe(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('read');
  const wallet = await service.getWallet(accountId);

  sendJson(res, 200, mapWallet(wallet));
}

function mapWallet(wallet: {
  id: string;
  accountId: string;
  availableBalanceCents: bigint;
  inGameBalanceCents: bigint;
  blockedBalanceCents: bigint;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
}): WalletResponse {
  return {
    id: wallet.id,
    account_id: wallet.accountId,
    available_balance_cents: wallet.availableBalanceCents.toString(),
    in_game_balance_cents: wallet.inGameBalanceCents.toString(),
    blocked_balance_cents: wallet.blockedBalanceCents.toString(),
    currency: wallet.currency,
    created_at: wallet.createdAt,
    updated_at: wallet.updatedAt,
  };
}
