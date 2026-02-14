import { IncomingMessage, ServerResponse } from 'http';
import { HttpError } from '../../../shared/http/http-error';
import { readJson } from '../../../shared/http/body';
import { sendJson } from '../../../shared/http/response';
import { requireAccountId } from '../../../shared/http/account';
import { prisma } from '../../../shared/database/prisma';
import { identidadeInputSchema } from '../dtos/identidade.dto';
import { IdentidadeRepositoryPrisma } from '../repository/identidade.repository.impl';
import { IdentidadeService } from '../services/identidade.service';
import { FraudFlagsService } from '../../fraud/services/fraud-flags.service';

const repository = new IdentidadeRepositoryPrisma(prisma);
const fraudFlagsService = new FraudFlagsService(prisma);
const service = new IdentidadeService(repository, fraudFlagsService);

export async function handleUpsertIdentity(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('write');
  const body = await readJson<unknown>(req);
  const parsed = identidadeInputSchema.safeParse(body);

  if (!parsed.success) {
    throw new HttpError(400, 'validation_error', 'Payload inválido', {
      issues: parsed.error.flatten(),
    });
  }

  const identity = await service.upsert(accountId, parsed.data);

  sendJson(res, 200, mapIdentity(identity));
}

export async function handleGetIdentityMe(
  _req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const accountId = requireAccountId('read');
  const identity = await service.getByAccount(accountId);

  if (!identity) {
    throw new HttpError(404, 'identity_not_found', 'Identidade não encontrada');
  }

  sendJson(res, 200, mapIdentity(identity));
}

function mapIdentity(identity: {
  id: string;
  accountId: string;
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: identity.id,
    account_id: identity.accountId,
    full_name: identity.fullName,
    cpf: identity.cpf,
    pix_key: identity.pixKey,
    pix_key_type: identity.pixKeyType,
    status: identity.status,
    created_at: identity.createdAt,
    updated_at: identity.updatedAt,
  };
}
