import { getRequestContext } from '@slithermoney/shared';
import { isUuid } from '../validation/uuid';
import { HttpError } from './http-error';

export function requireAccountId(): string {
  const { user_id } = getRequestContext();

  if (!user_id) {
    throw new HttpError(401, 'unauthorized', 'Header x-user-id é obrigatório');
  }

  if (!isUuid(user_id)) {
    throw new HttpError(400, 'invalid_account_id', 'account_id inválido');
  }

  return user_id;
}
