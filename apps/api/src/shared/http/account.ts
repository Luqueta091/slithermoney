import { getRequestContext } from '@slithermoney/shared';
import { isUuid } from '../validation/uuid';
import { HttpError } from './http-error';

export function requireAccountId(mode: 'read' | 'write' = 'write'): string {
  const { user_id, auth_source } = getRequestContext();

  if (!user_id) {
    throw new HttpError(401, 'unauthorized', 'Autenticacao obrigatoria');
  }

  if (!isUuid(user_id)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id inválido');
  }

  if (mode === 'write' && auth_source !== 'jwt') {
    throw new HttpError(401, 'unauthorized', 'Access token obrigatorio');
  }

  return user_id;
}
