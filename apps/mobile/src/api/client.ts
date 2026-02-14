import { clearSession, loadSession, saveSession, type Session } from '../storage/session';

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
let refreshInFlight: Promise<Session | null> | null = null;

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  accountId?: string,
): Promise<T> {
  const requiresAuth = Boolean(accountId);
  let session = requiresAuth ? await getSessionForAccount(accountId as string) : null;

  const firstResponse = await performRequest(path, options, session?.accessToken);

  if (firstResponse.response.status === 401 && requiresAuth) {
    session = await refreshCurrentSession();
    if (!session || session.accountId !== accountId) {
      clearSession();
      throw new ApiError(401, 'unauthorized', 'Sessao expirada');
    }

    const retry = await performRequest(path, options, session.accessToken);
    return parseResponse<T>(retry.response, retry.payload);
  }

  return parseResponse<T>(firstResponse.response, firstResponse.payload);
}

export type Profile = {
  account_id: string;
  email: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
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
  access_token: string;
  refresh_token: string;
  token_type: 'Bearer';
  expires_in: number;
};

export async function getProfile(accountId: string): Promise<Profile> {
  return apiRequest<Profile>('/profile/me', { method: 'GET' }, accountId);
}

export async function updateProfile(
  accountId: string,
  input: { displayName: string },
): Promise<Profile> {
  return apiRequest<Profile>(
    '/profile/me',
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
    accountId,
  );
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

export async function logout(refreshToken: string): Promise<void> {
  await apiRequest<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
  });
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
  input: { pixKey: string; pixKeyType?: 'cpf' },
): Promise<PixWithdrawalResponse> {
  return apiRequest<PixWithdrawalResponse>(
    '/pix/withdrawals',
    {
      method: 'POST',
      body: JSON.stringify({
        amountCents,
        pixKey: input.pixKey,
        pixKeyType: input.pixKeyType ?? 'cpf',
      }),
    },
    accountId,
  );
}

export function toSession(response: AuthResponse): Session {
  return {
    accountId: response.account_id,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    tokenType: response.token_type,
    expiresAt: Date.now() + response.expires_in * 1000,
  };
}

async function performRequest(
  path: string,
  options: RequestInit,
  accessToken?: string,
): Promise<{ response: Response; payload: unknown }> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('content-type') && options.body) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get('content-type') ?? '';
  const isJson = contentType.includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;
  return { response, payload };
}

function parseResponse<T>(response: Response, payload: unknown): T {
  if (!response.ok) {
    const errorPayload = payload as ApiErrorPayload | null;
    const message = errorPayload?.message ?? 'Falha ao conectar na API';
    throw new ApiError(response.status, errorPayload?.code, message, errorPayload?.details);
  }

  return payload as T;
}

async function getSessionForAccount(accountId: string): Promise<Session> {
  const session = loadSession();
  if (!session || session.accountId !== accountId) {
    throw new ApiError(401, 'unauthorized', 'Sessao invalida');
  }

  if (session.expiresAt <= Date.now()) {
    const refreshed = await refreshCurrentSession();
    if (!refreshed || refreshed.accountId !== accountId) {
      clearSession();
      throw new ApiError(401, 'unauthorized', 'Sessao expirada');
    }
    return refreshed;
  }

  return session;
}

async function refreshCurrentSession(): Promise<Session | null> {
  if (refreshInFlight) {
    return refreshInFlight;
  }

  const current = loadSession();
  if (!current?.refreshToken) {
    return null;
  }

  refreshInFlight = (async () => {
    try {
      const response = await performRequest('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });

      const parsed = parseResponse<AuthResponse>(response.response, response.payload);
      const next = toSession(parsed);
      saveSession(next);
      return next;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}
