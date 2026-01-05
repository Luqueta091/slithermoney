import { ValidationError } from '../../../shared/errors/validation-error';
import {
  CarteirasRepository,
  WalletRecord,
} from '../repository/carteiras.repository';

export class CarteirasService {
  constructor(private readonly repository: CarteirasRepository) {}

  async getWallet(accountId: string): Promise<WalletRecord> {
    return this.repository.withTransaction(async (tx) => {
      return this.repository.ensureAccountAndWallet(accountId, tx);
    });
  }

  async creditAvailable(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'credito');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);
      return this.repository.updateBalances(
        accountId,
        { availableBalanceCents: amount },
        tx,
      );
    });
  }

  async debitAvailable(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'debito');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);

      const updated = await this.repository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: -amount },
        { availableBalanceCents: amount },
        tx,
      );

      if (!updated) {
        throw new ValidationError('Saldo insuficiente');
      }

      return updated;
    });
  }

  async blockAmount(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'bloqueio');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);

      const updated = await this.repository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: -amount, blockedBalanceCents: amount },
        { availableBalanceCents: amount },
        tx,
      );

      if (!updated) {
        throw new ValidationError('Saldo insuficiente');
      }

      return updated;
    });
  }

  async unblockAmount(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'desbloqueio');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);

      const updated = await this.repository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: amount, blockedBalanceCents: -amount },
        { blockedBalanceCents: amount },
        tx,
      );

      if (!updated) {
        throw new ValidationError('Saldo bloqueado insuficiente');
      }

      return updated;
    });
  }

  async reserveForGame(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'reserva');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);

      const updated = await this.repository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: -amount, inGameBalanceCents: amount },
        { availableBalanceCents: amount },
        tx,
      );

      if (!updated) {
        throw new ValidationError('Saldo insuficiente');
      }

      return updated;
    });
  }

  async releaseFromGame(accountId: string, amountCents: number): Promise<WalletRecord> {
    const amount = assertPositiveAmount(amountCents, 'liberacao');

    return this.repository.withTransaction(async (tx) => {
      await this.repository.ensureAccountAndWallet(accountId, tx);

      const updated = await this.repository.updateBalancesWithGuard(
        accountId,
        { availableBalanceCents: amount, inGameBalanceCents: -amount },
        { inGameBalanceCents: amount },
        tx,
      );

      if (!updated) {
        throw new ValidationError('Saldo em jogo insuficiente');
      }

      return updated;
    });
  }
}

function assertPositiveAmount(amountCents: number, label: string): bigint {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError(`Valor invalido para ${label}`);
  }

  return BigInt(amountCents);
}
