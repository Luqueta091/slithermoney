import { PixChargePayload } from '../dtos/criar-cobranca.dto';
import { PixChargeInput, PixChargeResult, PixGateway } from './pix.gateway';

type BspayConfig = {
  baseUrl: string;
  token: string;
  postbackUrl: string;
  payerName: string;
};

export class PixGatewayBspay implements PixGateway {
  constructor(private readonly config: BspayConfig) {}

  async createCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const { baseUrl, token, postbackUrl, payerName } = this.config;
    if (!token) {
      throw new Error('BSPAY_TOKEN not configured');
    }
    if (!postbackUrl) {
      throw new Error('BSPAY_POSTBACK_URL not configured');
    }

    const amount = Number((input.amountCents / 100).toFixed(2));
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/v2/pix/qrcode`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        amount,
        external_id: input.idempotencyKey,
        payerQuestion: 'Deposito SlitherMoney',
        postbackUrl,
        payer: {
          name: payerName,
          document: '',
          email: '',
        },
      }),
    });

    if (!response.ok) {
      const body = await safeReadBody(response);
      throw new Error(`BSPAY charge failed: ${response.status} ${body}`);
    }

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
