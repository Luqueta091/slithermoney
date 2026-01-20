import { PixChargePayload } from '../dtos/criar-cobranca.dto';
import { PixChargeInput, PixChargeResult, PixGateway } from './pix.gateway';

type BspayConfig = {
  baseUrl: string;
  token: string;
  clientId?: string;
  clientSecret?: string;
  postbackUrl: string;
  payerName: string;
};

export class PixGatewayBspay implements PixGateway {
  private cachedToken: { value: string; expiresAt: number } | null = null;

  constructor(private readonly config: BspayConfig) {}

  async createCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const { baseUrl, postbackUrl, payerName } = this.config;
    const token = await this.getAccessToken();
    if (!token) {
      throw new Error('BSPAY token not configured');
    }
    if (!postbackUrl) {
      throw new Error('BSPAY_POSTBACK_URL not configured');
    }

    const amount = Number((input.amountCents / 100).toFixed(2));
    const response = await this.requestCharge(baseUrl, token, {
      amount,
      external_id: input.idempotencyKey,
      payerQuestion: 'Deposito SlitherMoney',
      postbackUrl,
      payer: {
        name: payerName,
        document: '',
        email: '',
      },
    });

    if (response.status === 401) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        const retry = await this.requestCharge(baseUrl, refreshed, {
          amount,
          external_id: input.idempotencyKey,
          payerQuestion: 'Deposito SlitherMoney',
          postbackUrl,
          payer: {
            name: payerName,
            document: '',
            email: '',
          },
        });
        if (retry.ok) {
          return this.parseChargeResponse(retry, input);
        }
        const body = await safeReadBody(retry);
        throw new Error(`BSPAY charge failed: ${retry.status} ${body}`);
      }
    }

    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new Error(`BSPAY charge failed: ${response.status} ${body}`);
    }

    return this.parseChargeResponse(response, input);
  }

  private async requestCharge(
    baseUrl: string,
    token: string,
    payload: Record<string, unknown>,
  ): Promise<Response> {
    return fetch(`${baseUrl.replace(/\/$/, '')}/v2/pix/qrcode`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  }

  private async parseChargeResponse(
    response: Response,
    input: PixChargeInput,
  ): Promise<PixChargeResult> {
    const payload = (await response.json()) as Record<string, unknown>;
    const txid = pickFirst(payload, [
      'transactionId',
      'transaction_id',
      'pix_id',
      'pixId',
      'requestBody.transactionId',
    ]);

    if (!txid) {
      throw new Error('BSPAY response missing transactionId');
    }

    const qrCode = pickFirst(payload, [
      'qr_code',
      'qrCode',
      'payload.qr_code',
      'payload.qrCode',
    ]);
    const copyAndPaste = pickFirst(payload, [
      'qrcode',
      'copy_and_paste',
      'copyAndPaste',
      'brcode',
      'brCode',
      'payload.qrcode',
      'payload.copy_and_paste',
      'payload.copyAndPaste',
      'payload.brcode',
      'payload.brCode',
    ]);
    const expiresAt = pickFirst(payload, [
      'calendar.dueDate',
      'calendar.expiration',
      'expires_at',
      'expiresAt',
      'payload.expires_at',
      'payload.expiresAt',
    ]);

    const chargePayload: PixChargePayload | Record<string, unknown> =
      qrCode || copyAndPaste || expiresAt
        ? {
            qr_code: String(qrCode ?? ''),
            copy_and_paste: String(copyAndPaste ?? ''),
            expires_at: resolveExpiresAt(expiresAt),
          }
        : (payload as Record<string, unknown>);

    return {
      txid: String(txid),
      provider: 'bspay',
      payload: chargePayload,
      externalReference:
        (pickFirst(payload, ['external_id', 'externalId']) as string | undefined) ??
        input.idempotencyKey,
      };
  }

  private async getAccessToken(): Promise<string> {
    if (this.config.token) {
      return this.config.token;
    }
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.value;
    }
    return (await this.refreshAccessToken()) ?? '';
  }

  private async refreshAccessToken(): Promise<string | null> {
    const { baseUrl, clientId, clientSecret } = this.config;
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
    this.cachedToken = { value: payload.access_token, expiresAt };
    return payload.access_token;
  }
}

function resolveExpiresAt(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const expiresAt = new Date(Date.now() + value * 1000);
    return expiresAt.toISOString();
  }
  return String(value);
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
