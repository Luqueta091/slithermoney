import { useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { listPixTransactions, requestWithdrawal } from '../api/client';
import { formatCents } from '../utils/format';

const WITHDRAW_STATUS_FINAL = new Set(['PAID', 'FAILED']);

type WithdrawScreenProps = {
  accountId: string;
  onUpdated: () => void;
};

export function WithdrawScreen({ accountId, onUpdated }: WithdrawScreenProps): JSX.Element {
  const [amount, setAmount] = useState('');
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [requestedCents, setRequestedCents] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleRequest = async (): Promise<void> => {
    const cents = parseAmountToCents(amount);
    if (!cents) {
      setError('Informe um valor valido');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const result = await requestWithdrawal(accountId, cents);
      setTransactionId(result.id);
      setStatus(result.status);
      setRequestedCents(cents);
      onUpdated();
    } catch (err) {
      setError(resolveError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const refreshStatus = async (): Promise<void> => {
    if (!transactionId) {
      return;
    }

    try {
      const [item] = await listPixTransactions(accountId, { id: transactionId });
      if (!item) {
        return;
      }

      setStatus(item.status);
      if (WITHDRAW_STATUS_FINAL.has(item.status)) {
        onUpdated();
      }
    } catch (err) {
      setError(resolveError(err));
    }
  };

  return (
    <div className="card">
      <label className="form-field">
        <span className="form-label">Valor do saque (R$)</span>
        <input
          className="form-input"
          value={amount}
          onChange={(event) => {
            setError(null);
            setAmount(event.target.value);
          }}
          placeholder="Ex: 50,00"
        />
      </label>

      <div className="actions">
        <ActionButton
          label={isLoading ? 'Solicitando...' : 'Solicitar saque'}
          onClick={handleRequest}
          disabled={isLoading}
        />
        <ActionButton label="Atualizar status" onClick={refreshStatus} variant="ghost" />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {transactionId ? (
        <div className="card" style={{ gap: '10px' }}>
          <div className="card__label">Solicitacao</div>
          <div className="card__value">{transactionId}</div>
          <div className="card__label">Status</div>
          <div className="card__value">{status ?? '-'}</div>
          <div className="card__label">Valor</div>
          <div className="card__value">{formatCents(requestedCents ?? 0)}</div>
          <div className="form-helper">O worker precisa estar rodando para concluir o saque.</div>
        </div>
      ) : null}
    </div>
  );
}

function parseAmountToCents(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100);
}

function resolveError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Falha ao solicitar saque';
}
