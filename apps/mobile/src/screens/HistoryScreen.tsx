import { useEffect, useState } from 'react';
import { listLedger, listRuns, type LedgerEntry, type RunSummary } from '../api/client';
import { ActionButton } from '../components/ActionButton';
import { formatCents, formatDate } from '../utils/format';

type HistoryScreenProps = {
  accountId: string;
};

export function HistoryScreen({ accountId }: HistoryScreenProps): JSX.Element {
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void refresh();
  }, []);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const [ledgerResult, runsResult] = await Promise.all([
        listLedger(accountId, 12, 0),
        listRuns(accountId, 6, 0),
      ]);
      setLedger(ledgerResult.items);
      setRuns(runsResult.items);
    } catch (err) {
      setError(resolveError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{ gap: '16px' }}>
      <div className="actions">
        <ActionButton label={loading ? 'Atualizando...' : 'Atualizar'} onClick={refresh} />
      </div>
      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <div className="card__label">Ultimos movimentos</div>
        {ledger.length === 0 ? (
          <div className="form-helper">Sem movimentos recentes.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ledger.map((entry) => (
              <div key={entry.id} className="card" style={{ gap: '4px' }}>
                <div className="card__label">{entry.entry_type}</div>
                <div className="card__value">
                  {entry.direction === 'CREDIT' ? '+' : '-'} {formatCents(entry.amount_cents)}
                </div>
                <div className="form-helper">{formatDate(entry.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card__label">Ultimas runs</div>
        {runs.length === 0 ? (
          <div className="form-helper">Sem runs registradas.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {runs.map((run) => (
              <div key={run.id} className="card" style={{ gap: '4px' }}>
                <div className="card__label">{run.status}</div>
                <div className="card__value">Stake: {formatCents(run.stake_cents)}</div>
                <div className="card__value">Payout: {formatCents(run.payout_cents)}</div>
                <div className="form-helper">{formatDate(run.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function resolveError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Falha ao carregar historico';
}
