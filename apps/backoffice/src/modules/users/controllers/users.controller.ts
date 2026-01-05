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
  const cpfInput = url.searchParams.get('cpf');
  const cpf = cpfInput ? sanitizeCpf(cpfInput) : undefined;

  if (!accountId && !cpf) {
    throw new HttpError(400, 'missing_query', 'Informe account_id ou cpf');
  }

  if (accountId && !isUuid(accountId)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id invalido');
  }

  if (cpf && cpf.length !== 11) {
    throw new HttpError(400, 'invalid_cpf', 'CPF invalido');
  }

  const account = accountId
    ? await prisma.account.findUnique({
        where: { id: accountId },
        include: {
          identityProfile: true,
          wallet: true,
          fraudFlags: true,
        },
      })
    : await prisma.account.findFirst({
        where: {
          identityProfile: {
            cpf,
          },
        },
        include: {
          identityProfile: true,
          wallet: true,
          fraudFlags: true,
        },
      });

  if (!account) {
    throw new HttpError(404, 'account_not_found', 'Conta nao encontrada');
  }

  const response = {
    account: {
      id: account.id,
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
      cpf_masked: cpf ? maskCpf(cpf) : undefined,
    },
  });

  sendJson(res, 200, response);
}

function sanitizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length <= 3) {
    return '***';
  }

  return `${'*'.repeat(digits.length - 3)}${digits.slice(-3)}`;
}
