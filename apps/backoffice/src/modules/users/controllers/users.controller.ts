import { IncomingMessage, ServerResponse } from 'http';
import { prisma } from '../../../shared/database/prisma';
import { HttpError } from '../../../shared/http/http-error';
import { requireBackofficeAuth } from '../../../shared/http/auth';
import { sendJson } from '../../../shared/http/response';
import { recordAuditLog } from '../../../shared/audit';
import { isUuid } from '../../../shared/validation/uuid';

export async function handleUserLookup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const auth = requireBackofficeAuth(req, 'read');
  const url = new URL(req.url ?? '/', 'http://localhost');
  const accountId = url.searchParams.get('account_id');
  const emailInput = url.searchParams.get('email');
  const email = emailInput?.trim().toLowerCase() || undefined;

  if (!accountId && !email) {
    throw new HttpError(400, 'missing_query', 'Informe account_id ou email');
  }

  if (accountId && !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  if (email && !isEmail(email)) {
    throw new HttpError(400, 'invalid_email', 'Email invalido');
  }

  let account = null;
  if (accountId) {
    account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        identityProfile: true,
        wallet: true,
        fraudFlags: true,
      },
    });
  } else {
    account = await prisma.account.findUnique({
      where: {
        email: email as string,
      },
      include: {
        identityProfile: true,
        wallet: true,
        fraudFlags: true,
      },
    });
  }

  if (!account) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  const response = {
    account: {
      id: account.id,
      email: account.email,
      display_name: account.displayName,
      status: account.status,
      created_at: account.createdAt,
      updated_at: account.updatedAt,
    },
    identity: account.identityProfile
      ? {
          id: account.identityProfile.id,
          full_name: account.identityProfile.fullName,
          cpf: account.identityProfile.cpf,
          pix_key: account.identityProfile.pixKey,
          pix_key_type: account.identityProfile.pixKeyType,
          status: account.identityProfile.status,
          created_at: account.identityProfile.createdAt,
          updated_at: account.identityProfile.updatedAt,
        }
      : null,
    wallet: account.wallet
      ? {
          id: account.wallet.id,
          available_balance_cents: account.wallet.availableBalanceCents.toString(),
          in_game_balance_cents: account.wallet.inGameBalanceCents.toString(),
          blocked_balance_cents: account.wallet.blockedBalanceCents.toString(),
          currency: account.wallet.currency,
          created_at: account.wallet.createdAt,
          updated_at: account.wallet.updatedAt,
        }
      : null,
    fraud_flags: account.fraudFlags.map((flag) => ({
      id: flag.id,
      flag_type: flag.flagType,
      severity: flag.severity,
      status: flag.status,
      details: flag.details,
      created_at: flag.createdAt,
      updated_at: flag.updatedAt,
      resolved_at: flag.resolvedAt,
    })),
  };

  await recordAuditLog(prisma, {
    action: 'backoffice.users.read',
    actorUserId: auth.userId,
    actorRole: auth.role,
    targetType: 'account',
    targetId: account.id,
    metadata: {
      account_id: accountId ?? undefined,
      email: email ?? undefined,
    },
  });

  sendJson(res, 200, response);
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
