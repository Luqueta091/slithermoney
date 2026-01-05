import { randomUUID } from 'crypto';
import { PixChargePayload } from '../dtos/criar-cobranca.dto';
import { PixChargeInput, PixChargeResult, PixGateway } from './pix.gateway';

export class PixGatewayStub implements PixGateway {
  async createCharge(input: PixChargeInput): Promise<PixChargeResult> {
    const txid = randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const payload: PixChargePayload = {
      qr_code: `pix:${txid}`,
      copy_and_paste: `00020101021226840014br.gov.bcb.pix2563payload.${txid}5204000053039865802BR5925SlitherMoney6009SaoPaulo61080540900062070503***6304`,
      expires_at: expiresAt,
    };

    return {
      txid,
      provider: 'mock',
      payload,
      externalReference: input.idempotencyKey,
    };
  }
}
