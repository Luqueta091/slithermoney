import { URL } from 'url';
import { HttpError } from '../../../shared/http/http-error';
import { ledgerEntryTypeSchema, LedgerStatementQuery } from '../dtos/ledger.dto';

export function parseLedgerStatementQuery(url: URL): LedgerStatementQuery {
  const limit = parseNumber(url.searchParams.get('limit'), 20, 1, 100);
  const offset = parseNumber(url.searchParams.get('offset'), 0, 0, 1000000);
  const order = parseOrder(url.searchParams.get('order'));
  const types = parseTypes(url.searchParams.getAll('type'), url.searchParams.get('types'));
  const from = parseDate(url.searchParams.get('from'));
  const to = parseDate(url.searchParams.get('to'));

  if (from && to && from > to) {
    throw new HttpError(400, 'invalid_date_range', 'Intervalo de datas inválido');
  }

  return {
    types,
    from,
    to,
    limit,
    offset,
    order,
  };
}

function parseNumber(
  value: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new HttpError(400, 'invalid_pagination', 'Parâmetros de paginação inválidos');
  }

  return parsed;
}

function parseOrder(value: string | null): 'asc' | 'desc' {
  if (!value) {
    return 'desc';
  }

  if (value === 'asc' || value === 'desc') {
    return value;
  }

  throw new HttpError(400, 'invalid_order', 'Ordenação inválida');
}

function parseTypes(values: string[], commaSeparated?: string | null) {
  const aggregated = new Set<string>();

  for (const item of values) {
    if (item) {
      aggregated.add(item);
    }
  }

  if (commaSeparated) {
    commaSeparated
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => aggregated.add(item));
  }

  if (aggregated.size === 0) {
    return undefined;
  }

  const entries = Array.from(aggregated).map((value) => {
    const parsed = ledgerEntryTypeSchema.safeParse(value);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_type', `Tipo inválido: ${value}`);
    }
    return parsed.data;
  });

  return entries;
}

function parseDate(value: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'invalid_date', 'Data inválida');
  }

  return date;
}
