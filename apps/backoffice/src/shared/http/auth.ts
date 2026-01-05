import { IncomingMessage } from 'http';
import { HttpError } from './http-error';
import { config } from '../config';

export type BackofficeRole = 'admin' | 'support';

export type BackofficeAuth = {
  role: BackofficeRole;
  userId?: string;
};

const allowedRoles = new Set<BackofficeRole>(['admin', 'support']);

type HeaderValue = string | string[] | undefined;

export function requireBackofficeAuth(
  req: IncomingMessage,
  access: 'read' | 'write' = 'read',
): BackofficeAuth {
  const role = pickHeader(req.headers['x-backoffice-role']);

  if (!role || !isAllowedRole(role)) {
    throw new HttpError(401, 'backoffice_unauthorized', 'Backoffice role required');
  }

  if (access === 'write' && role !== 'admin') {
    throw new HttpError(403, 'backoffice_forbidden', 'Backoffice role not allowed');
  }

  const accessKey = pickHeader(req.headers['x-backoffice-key']);
  if (config.BACKOFFICE_ACCESS_KEY && accessKey !== config.BACKOFFICE_ACCESS_KEY) {
    throw new HttpError(401, 'backoffice_unauthorized', 'Backoffice key invalid');
  }

  const userId = pickHeader(req.headers['x-backoffice-user-id']);

  return {
    role,
    userId,
  };
}

function isAllowedRole(value: string): value is BackofficeRole {
  return allowedRoles.has(value as BackofficeRole);
}

function pickHeader(value: HeaderValue): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
