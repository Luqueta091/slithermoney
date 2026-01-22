export type ApiErrorPayload = {
  code?: string;
  message?: string;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, code: string | undefined, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accountId?: string,
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('content-type') && options.body) {
    headers.set('content-type', 'application/json');
  }
  if (accountId) {
    headers.set('x-user-id', accountId);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    const message = errorPayload?.message ?? 'Falha ao conectar na API';
    throw new ApiError(response.status, errorPayload?.code, message, errorPayload?.details);
  }

  return payload as T;
}

export type IdentityProfile = {
  id: string;
  account_id: string;
  full_name: string;
  cpf: string;
  pix_key: string;
  pix_key_type: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export type IdentityInput = {
  fullName: string;
  cpf: string;
  pixKey: string;
  pixKeyType: 'cpf' | 'phone' | 'email' | 'random';
};

export type Wallet = {
  id: string;
  account_id: string;
  available_balance_cents: string;
  in_game_balance_cents: string;
  blocked_balance_cents: string;
  currency: string;
};

export type Stake = {
  id: string;
  label: string;
  amount_cents: string;
  currency: string;
  is_active: boolean;
  sort_order: number;
};

export type RunStartResponse = {
  run_id: string;
  status: string;
  stake_cents: string;
  currency: string;
  arena_host: string;
  join_token: string;
  created_at: string;
};

export type RunCashoutEventResponse = {
  run_id: string;
  status: string;
  payout_cents: string;
  house_fee_cents: string;
  multiplier: number;
  ended_at: string | null;
};

export type RunEliminatedEventResponse = {
  run_id: string;
  status: string;
  result_reason: string | null;
  ended_at: string | null;
};

export type LedgerEntry = {
  id: string;
  entry_type: string;
  direction: string;
  amount_cents: string;
  currency: string;
  created_at: string;
  reference_type?: string | null;
  reference_id?: string | null;
};

export type RunSummary = {
  id: string;
  status: string;
  stake_cents: string;
  multiplier: string;
  payout_cents: string;
  house_fee_cents: string;
  result_reason?: string | null;
  created_at: string;
  ended_at?: string | null;
};

export type PixTransaction = {
  id: string;
  account_id: string;
  tx_type: string;
  status: string;
  amount_cents: string;
  currency: string;
  idempotency_key: string;
  txid?: string | null;
  e2e_id?: string | null;
  provider?: string | null;
  external_reference?: string | null;
  payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

export type PixDepositResponse = {
  id: string;
  account_id: string;
  status: string;
  amount_cents: string;
  currency: string;
  idempotency_key: string;
  txid: string | null;
  payload: {
    qr_code?: string;
    copy_and_paste?: string;
    expires_at?: string;
  } | null;
  created_at: string;
};

export type PixWithdrawalResponse = {
  id: string;
  account_id: string;
  status: string;
  amount_cents: string;
  currency: string;
  idempotency_key: string;
  external_reference?: string | null;
  created_at: string;
};

export type AuthResponse = {
  account_id: string;
};

export async function getIdentity(accountId: string): Promise<IdentityProfile> {
  return apiRequest<IdentityProfile>('/identity/me', { method: 'GET' }, accountId);
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function upsertIdentity(
  accountId: string,
  input: IdentityInput,
): Promise<IdentityProfile> {
  return apiRequest<IdentityProfile>(
    '/identity',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
    accountId,
  );
}

export async function getWallet(accountId: string): Promise<Wallet> {
  return apiRequest<Wallet>('/wallet/me', { method: 'GET' }, accountId);
}

export async function listStakes(): Promise<Stake[]> {
  const response = await apiRequest<{ items: Stake[] }>('/stakes', { method: 'GET' });
  if (!response || !Array.isArray(response.items)) {
    return [];
  }
  return response.items;
}

export async function startRun(
  accountId: string,
  stakeCents: number,
): Promise<RunStartResponse> {
  return apiRequest<RunStartResponse>(
    '/runs/start',
    {
      method: 'POST',
      body: JSON.stringify({ stakeCents }),
    },
    accountId,
  );
}

export async function reportRunCashout(input: {
  runId: string;
  multiplier: number;
  sizeScore?: number;
}): Promise<RunCashoutEventResponse> {
  return apiRequest<RunCashoutEventResponse>('/runs/events/cashout', {
    method: 'POST',
    body: JSON.stringify({
      runId: input.runId,
      eventVersion: 1,
      multiplier: input.multiplier,
      sizeScore: input.sizeScore,
    }),
  });
}

export async function reportRunEliminated(input: {
  runId: string;
  reason: string;
  multiplier?: number;
  sizeScore?: number;
}): Promise<RunEliminatedEventResponse> {
  return apiRequest<RunEliminatedEventResponse>('/runs/events/eliminated', {
    method: 'POST',
    body: JSON.stringify({
      runId: input.runId,
      eventVersion: 1,
      reason: input.reason,
      multiplier: input.multiplier,
      sizeScore: input.sizeScore,
    }),
  });
}

export async function listLedger(
  accountId: string,
  limit = 20,
  offset = 0,
): Promise<{ items: LedgerEntry[]; total: number }> {
  const response = await apiRequest<{
    items: LedgerEntry[];
    pagination: { total: number };
  }>(`/ledger/me?limit=${limit}&offset=${offset}`, { method: 'GET' }, accountId);

  return { items: response.items, total: response.pagination.total };
}

export async function listRuns(
  accountId: string,
  limit = 10,
  offset = 0,
): Promise<{ items: RunSummary[]; total: number }> {
  const response = await apiRequest<{
    items: RunSummary[];
    pagination: { total: number };
  }>(`/runs/me?limit=${limit}&offset=${offset}`, { method: 'GET' }, accountId);

  return { items: response.items, total: response.pagination.total };
}

export async function createDeposit(
  accountId: string,
  amountCents: number,
): Promise<PixDepositResponse> {
  return apiRequest<PixDepositResponse>(
    '/pix/deposits',
    {
      method: 'POST',
      body: JSON.stringify({ amountCents }),
    },
    accountId,
  );
}

export async function listPixTransactions(
  accountId: string,
  query: { txid?: string; id?: string } = {},
): Promise<PixTransaction[]> {
  const params = new URLSearchParams();
  if (query.txid) params.set('txid', query.txid);
  if (query.id) params.set('id', query.id);

  const response = await apiRequest<{ items: PixTransaction[] }>(
    `/pix/transactions/me?${params.toString()}`,
    { method: 'GET' },
    accountId,
  );

  return response.items;
}

export async function requestWithdrawal(
  accountId: string,
  amountCents: number,
): Promise<PixWithdrawalResponse> {
  return apiRequest<PixWithdrawalResponse>(
    '/pix/withdrawals',
    {
      method: 'POST',
      body: JSON.stringify({ amountCents }),
    },
    accountId,
  );
}
