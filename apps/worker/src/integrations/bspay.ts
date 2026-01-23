type BspayTokenConfig = {
  baseUrl: string;
  token?: string;
  clientId?: string;
  clientSecret?: string;
};

type BspayPaymentInput = {
  amount: number;
  externalId: string;
  description: string;
  postbackUrl?: string;
  creditParty: {
    name: string;
    keyType: string;
    key: string;
    taxId: string;
  };
};

type BspayPaymentResult = {
  transactionId: string;
  status?: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

export async function createBspayPayment(
  config: BspayTokenConfig,
  input: BspayPaymentInput,
): Promise<BspayPaymentResult> {
  const token = await getAccessToken(config);
  if (!token) {
    throw new Error('BSPAY token not configured');
  }

  const response = await requestPayment(config.baseUrl, token, input);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken(config);
    if (refreshed) {
      const retry = await requestPayment(config.baseUrl, refreshed, input);
      if (retry.ok) {
        return parsePaymentResponse(retry);
      }
      const body = await safeReadBody(retry);
      throw new Error(`BSPAY payment failed: ${retry.status} ${body}`);
    }
  }

  if (!response.ok) {
    const body = await safeReadBody(response);
    throw new Error(`BSPAY payment failed: ${response.status} ${body}`);
  }

  return parsePaymentResponse(response);
}

async function requestPayment(
  baseUrl: string,
  token: string,
  input: BspayPaymentInput,
): Promise<Response> {
  return fetch(`${baseUrl.replace(/\/$/, '')}/v2/pix/payment`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      amount: input.amount,
      external_id: input.externalId,
      description: input.description,
      postbackUrl: input.postbackUrl,
      creditParty: input.creditParty,
    }),
  });
}

async function parsePaymentResponse(response: Response): Promise<BspayPaymentResult> {
  const payload = (await response.json()) as Record<string, unknown>;
  const transactionId = pickFirst(payload, [
    'transactionId',
    'transaction_id',
    'pix_id',
    'pixId',
    'requestBody.transactionId',
  ]);

  if (!transactionId) {
    throw new Error('BSPAY response missing transactionId');
  }

  const status = pickFirst(payload, [
    'status',
    'statusCode.description',
    'requestBody.statusCode.description',
  ]);

  return {
    transactionId: String(transactionId),
    status: status ? String(status) : undefined,
  };
}

async function getAccessToken(config: BspayTokenConfig): Promise<string> {
  if (config.token) {
    return config.token;
  }
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.value;
  }
  return (await refreshAccessToken(config)) ?? '';
}

async function refreshAccessToken(config: BspayTokenConfig): Promise<string | null> {
  const { baseUrl, clientId, clientSecret } = config;
  if (!clientId || !clientSecret) {
    return null;
  }
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v2/oauth/token`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${credentials}`,
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!payload?.access_token) {
    return null;
  }
  const ttlSeconds = typeof payload.expires_in === 'number' ? payload.expires_in : 0;
  const expiresAt = Date.now() + Math.max(0, ttlSeconds - 30) * 1000;
  cachedToken = { value: payload.access_token, expiresAt };
  return payload.access_token;
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

function pickFirst(source: unknown, paths: string[]): unknown {
  if (!source || typeof source !== 'object') {
    return undefined;
  }

  for (const path of paths) {
    const value = readPath(source as Record<string, unknown>, path);
    if (value !== undefined && value !== null) {
      return value;
    }
  }

  return undefined;
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
