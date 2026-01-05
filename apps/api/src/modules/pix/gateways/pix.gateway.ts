import { PixChargePayload } from '../dtos/criar-cobranca.dto';

export type PixChargeInput = {
  accountId: string;
  amountCents: number;
  currency: string;
  idempotencyKey: string;
};

export type PixChargeResult = {
  txid: string;
  provider: string;
  payload: PixChargePayload | Record<string, unknown>;
  externalReference?: string | null;
};

export interface PixGateway {
  createCharge(input: PixChargeInput): Promise<PixChargeResult>;
}
