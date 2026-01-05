import { HttpError } from './http-error';

export function parseLimit(value: string | null, options?: { defaultLimit?: number; maxLimit?: number }): number {
  const resolvedDefault = options?.defaultLimit ?? 50;
  const maxLimit = options?.maxLimit ?? 200;

  if (value === null || value === undefined || value === '') {
    return resolvedDefault;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new HttpError(400, 'invalid_limit', 'Parametro limit invalido');
  }

  return Math.min(parsed, maxLimit);
}

export function parseOffset(value: string | null): number {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new HttpError(400, 'invalid_offset', 'Parametro offset invalido');
  }

  return parsed;
}

export function parseDate(value: string | null, field: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new HttpError(400, 'invalid_date', `Parametro ${field} invalido`);
  }

  return date;
}

export function parseCommaList(value: string | null): string[] | undefined {
  if (!value) {
    return undefined;
  }

  const items = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length ? items : undefined;
}
