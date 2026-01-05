import { useEffect, useRef, useState } from 'react';
import { ActionButton } from '../components/ActionButton';
import { type PixDepositResponse, confirmDeposit, createDeposit, listPixTransactions } from '../api/client';
import { formatCents, formatDate } from '../utils/format';

const POLL_INTERVAL_MS = 5000;

type DepositScreenProps = {
  accountId: string;
  onConfirmed: () => void;
};

export function DepositScreen({ accountId, onConfirmed }: DepositScreenProps): JSX.Element {
  const [amount, setAmount] = useState('');
  const [transaction, setTransaction] = useState<PixDepositResponse | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => stopPolling();
  }, []);

  const stopPolling = (): void => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = (txid: string): void => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      void refreshStatus(txid);
    }, POLL_INTERVAL_MS);
  };

  const refreshStatus = async (txid: string): Promise<void> => {
    try {
      const [item] = await listPixTransactions(accountId, { txid });
      if (!item) {
        return;
      }

      setStatus(item.status);
      if (item.status === 'CONFIRMED' || item.status === 'FAILED') {
        stopPolling();
        onConfirmed();
      }
    } catch (err) {
      setError(resolveError(err));
    }
  };

  const handleCreate = async (): Promise<void> => {
    const cents = parseAmountToCents(amount);
    if (!cents) {
      setError('Informe um valor valido');
      return;
    }

    setError(null);
    setIsLoading(true);
    try {
      const result = await createDeposit(accountId, cents);
      setTransaction(result);
      setStatus(result.status);
      if (result.txid) {
        startPolling(result.txid);
      }
    } catch (err) {
      setError(resolveError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (): Promise<void> => {
    const text = transaction?.payload?.copy_and_paste;
    if (!text) {
      return;
    }

    await navigator.clipboard.writeText(text);
  };

  const handleSimulate = async (): Promise<void> => {
    if (!transaction?.txid) {
      return;
    }

    const cents = Number.parseInt(transaction.amount_cents, 10);
    await confirmDeposit(transaction.txid, cents);
    await refreshStatus(transaction.txid);
  };

  return (
    <div className="card">
      <label className="form-field">
        <span className="form-label">Valor do deposito (R$)</span>
        <input
          className="form-input"
          value={amount}
          onChange={(event) => {
            setError(null);
            setAmount(event.target.value);
          }}
          placeholder="Ex: 20,00"
        />
      </label>

      <div className="actions">
        <ActionButton
          label={isLoading ? 'Gerando...' : 'Gerar Pix'}
          onClick={handleCreate}
          disabled={isLoading}
        />
      </div>

      {error ? <p className="error">{error}</p> : null}

      {transaction ? (
        <div className="card" style={{ gap: '10px' }}>
          <div>
            <div className="card__label">Status</div>
            <div className="card__value">{status ?? transaction.status}</div>
          </div>
          <div>
            <div className="card__label">Valor</div>
            <div className="card__value">{formatCents(transaction.amount_cents)}</div>
          </div>
          <div>
            <div className="card__label">Expira em</div>
            <div className="card__value">{formatDate(transaction.payload?.expires_at)}</div>
          </div>
          <div>
            <div className="card__label">Copia e cola</div>
            <div className="card__value">{transaction.payload?.copy_and_paste ?? '-'}</div>
          </div>

          <div className="actions">
            <ActionButton label="Copiar codigo" onClick={handleCopy} variant="ghost" />
            <ActionButton label="Atualizar status" onClick={() => transaction.txid && refreshStatus(transaction.txid)} />
            <ActionButton label="Simular confirmacao" onClick={handleSimulate} variant="ghost" />
          </div>
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

  return 'Falha ao gerar deposito';
}
