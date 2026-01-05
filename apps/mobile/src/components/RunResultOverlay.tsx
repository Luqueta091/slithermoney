import { useEffect } from 'react';
import { ActionButton } from './ActionButton';
import { formatCents } from '../utils/format';

type RunResultOverlayProps = {
  open: boolean;
  kind: 'cashout' | 'eliminated';
  stake?: number | null;
  payout?: number | null;
  multiplier?: number | null;
  finalLength?: number | null;
  pending?: boolean;
  onPlayAgain: () => void;
  onExit: () => void;
};

export function RunResultOverlay({
  open,
  kind,
  stake,
  payout,
  multiplier,
  finalLength,
  pending = false,
  onPlayAgain,
  onExit,
}: RunResultOverlayProps): JSX.Element | null {
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onExit]);

  if (!open) {
    return null;
  }

  const hasStake = Number.isFinite(stake);
  const hasPayout = Number.isFinite(payout);
  const hasMultiplier = Number.isFinite(multiplier);
  const hasLength = Number.isFinite(finalLength);

  const profit =
    hasStake && hasPayout ? (payout as number) - (stake as number) : null;
  const profitPositive = profit !== null ? profit > 0 : false;

  const title = kind === 'cashout' ? 'Cashout realizado' : 'Voce foi eliminado';
  const outcomeLabel = kind === 'cashout' ? 'Lucro liquido' : 'Perda';
  const outcomeValue =
    kind === 'cashout'
      ? profit !== null
        ? formatSignedCents(profit)
        : '—'
      : hasStake
        ? `- ${formatCents(stake as number)}`
        : '—';

  return (
    <div className="run-result-overlay" role="dialog" aria-modal="true" aria-labelledby="run-result-title">
      <div className="run-result-backdrop" />
      <div className="run-result-card">
        <p className="run-result-kicker">Resultado da run</p>
        <h2 className="run-result-title" id="run-result-title">
          {title}
        </h2>

        <div className="run-result-metrics">
          {pending ? (
            <div className="run-result-row run-result-pending">
              <span>Processando cashout...</span>
              <strong>—</strong>
            </div>
          ) : null}
          <div className="run-result-row">
            <span>Resultado financeiro</span>
            <strong
              className={`run-result-value ${kind === 'cashout' ? (profitPositive ? 'is-positive' : 'is-negative') : 'is-negative'}`}
            >
              {outcomeValue}
            </strong>
          </div>

          <div className="run-result-row">
            <span>Stake</span>
            <strong>{hasStake ? formatCents(stake as number) : '—'}</strong>
          </div>

          {kind === 'cashout' ? (
            <div className="run-result-row">
              <span>Payout</span>
              <strong>{hasPayout ? formatCents(payout as number) : '—'}</strong>
            </div>
          ) : null}

          {hasMultiplier ? (
            <div className="run-result-row">
              <span>Multiplicador</span>
              <strong>{(multiplier as number).toFixed(2)}x</strong>
            </div>
          ) : null}

          <div className="run-result-row">
            <span>Comprimento final</span>
            <strong>{hasLength ? Math.floor(finalLength as number) : '—'}</strong>
          </div>
        </div>

        <div className="run-result-actions">
          <ActionButton
            label="Jogar novamente"
            onClick={onPlayAgain}
            disabled={pending}
            autoFocus
          />
          <ActionButton label="Sair" onClick={onExit} variant="ghost" disabled={pending} />
        </div>
      </div>
    </div>
  );
}

function formatSignedCents(value: number): string {
  const sign = value >= 0 ? '' : '- ';
  return `${sign}${formatCents(Math.abs(value))}`;
}
