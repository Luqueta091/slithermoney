import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { ActionButton } from '../components/ActionButton';
import { type PixDepositResponse, createDeposit, listPixTransactions } from '../api/client';
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
  const [qrImage, setQrImage] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);
  const presetValues = [10, 20, 50, 100];

  useEffect(() => {
    return () => stopPolling();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadQr = async () => {
      const qrCode = transaction?.payload?.qr_code ?? null;
      const resolved = resolveQrImageSrc(qrCode);
      if (resolved) {
        setQrImage(resolved);
        return;
      }
      const copy = transaction?.payload?.copy_and_paste ?? null;
      if (!copy) {
        setQrImage(null);
        return;
      }
      try {
        const dataUrl = await QRCode.toDataURL(copy, { margin: 1, width: 280 });
        if (!cancelled) {
          setQrImage(dataUrl);
        }
      } catch {
        if (!cancelled) {
          setQrImage(null);
        }
      }
    };
    void loadQr();
    return () => {
      cancelled = true;
    };
  }, [transaction?.payload?.qr_code, transaction?.payload?.copy_and_paste]);

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

    if (cents < 500) {
      setError('Deposito minimo de R$ 5,00');
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

  const qrSrc = qrImage ?? resolveQrImageSrc(transaction?.payload?.qr_code);

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
      <div className="form-helper">Deposito minimo: R$ 5,00.</div>

      <div className="actions" style={{ flexWrap: 'wrap' }}>
        {presetValues.map((value) => (
          <ActionButton
            key={value}
            label={`R$ ${value}`}
            variant="ghost"
            onClick={() => {
              setError(null);
              setAmount(value.toFixed(2).replace('.', ','));
            }}
          />
        ))}
      </div>

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
          {qrSrc ? (
            <div className="pix-qr">
              <div className="card__label">QRCode</div>
              <img src={qrSrc} alt="QRCode Pix" className="pix-qr__image" />
            </div>
          ) : null}
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

function resolveQrImageSrc(value?: string): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith('data:image')) {
    return trimmed;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  const base64Like = /^[A-Za-z0-9+/=]+$/.test(trimmed);
  if (base64Like && trimmed.length > 200) {
    return `data:image/png;base64,${trimmed}`;
  }
  return null;
}
