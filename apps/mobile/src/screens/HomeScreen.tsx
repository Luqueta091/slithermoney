import { useEffect, useMemo, useState } from 'react';
import { type IdentityProfile, type RunStartResponse, type Stake, type Wallet, getWallet, listStakes, startRun } from '../api/client';
import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { formatCents } from '../utils/format';
import { DepositScreen } from './DepositScreen';
import { WithdrawScreen } from './WithdrawScreen';
import { HistoryScreen } from './HistoryScreen';
import { GameScreen } from './GameScreen';

const TABS = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'deposit', label: 'Depositar' },
  { id: 'withdraw', label: 'Sacar' },
  { id: 'history', label: 'Historico' },
  { id: 'play', label: 'Jogar' },
] as const;

type TabId = (typeof TABS)[number]['id'];

type HomeScreenProps = {
  accountId: string;
  identity: IdentityProfile | null;
  onSignOut: () => void;
};

export function HomeScreen({ accountId, identity, onSignOut }: HomeScreenProps): JSX.Element {
  const [tab, setTab] = useState<TabId>('lobby');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [selectedStakeId, setSelectedStakeId] = useState<string | null>(null);
  const [customStake, setCustomStake] = useState('');
  const [run, setRun] = useState<RunStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, []);

  const loadInitialData = async (): Promise<void> => {
    try {
      const [walletResult, stakesResult] = await Promise.all([getWallet(accountId), listStakes()]);
      setWallet(walletResult);
      setStakes(stakesResult);
      if (!selectedStakeId && stakesResult.length > 0) {
        setSelectedStakeId(stakesResult[0].id);
      }
    } catch (err) {
      setError(resolveError(err));
    }
  };

  const refreshWallet = async (): Promise<void> => {
    try {
      const walletResult = await getWallet(accountId);
      setWallet(walletResult);
    } catch (err) {
      setError(resolveError(err));
    }
  };

  const selectedStake = useMemo(
    () => stakes.find((stake) => stake.id === selectedStakeId) ?? null,
    [stakes, selectedStakeId],
  );

  const stakeCents = useMemo(() => {
    if (customStake.trim()) {
      return parseAmountToCents(customStake);
    }

    return selectedStake ? Number.parseInt(selectedStake.amount_cents, 10) : null;
  }, [customStake, selectedStake]);

  const handleStartRun = async (): Promise<void> => {
    if (!stakeCents || stakeCents <= 0) {
      setError('Informe uma stake valida');
      return;
    }

    setError(null);
    setLoadingRun(true);
    try {
      const result = await startRun(accountId, stakeCents);
      setRun(result);
      setTab('play');
    } catch (err) {
      setError(resolveError(err));
    } finally {
      setLoadingRun(false);
    }
  };

  // If playing, show simple GameScreen
  if (tab === 'play' || (tab === 'play' && run)) {
    return (
      <GameScreen
        run={run}
        onExit={() => {
          setRun(null);
          setTab('lobby');
          refreshWallet();
        }}
      />
    );
  }

  // Helper to render other views (Deposit, Withdraw, History) inside a "Back" capable container
  // accessing them from the main lobby
  if (tab !== 'lobby') {
    let content: JSX.Element | null = null;
    switch (tab) {
      case 'deposit':
        content = <DepositScreen accountId={accountId} onConfirmed={refreshWallet} />;
        break;
      case 'withdraw':
        content = <WithdrawScreen accountId={accountId} onUpdated={refreshWallet} />;
        break;
      case 'history':
        content = <HistoryScreen accountId={accountId} />;
        break;
    }

    return (
      <ScreenContainer>
        <div className="actions" style={{ marginBottom: 20 }}>
          <ActionButton label="Voltar para o Jogo" onClick={() => setTab('lobby')} variant="ghost" />
        </div>
        {content}
      </ScreenContainer>
    );
  }

  // LOBBY VIEW (Slither Style)
  return (
    <div className="slither-container">
      {/* Background/Particles could go here if we had them */}
      <div className="slither-background" />

      {/* Top Left: Identity */}
      <div className="slither-corner top-left">
        <div className="slither-text">
          <strong>{identity?.full_name ?? 'Jogador'}</strong>
        </div>
        <button type="button" className="slither-link" onClick={onSignOut}>
          Sair
        </button>
      </div>

      {/* Top Right: Wallet */}
      <div className="slither-corner top-right">
        <div className="slither-text">
          Sua Carteira
        </div>
        <div className="slither-text" style={{ fontSize: 18, color: '#fff' }}>
          {formatCents(wallet?.available_balance_cents ?? '0')}
        </div>
      </div>

      {/* Center: Title & Play Form */}
      <div className="slither-center">
        <h1 className="slither-logo">
          slither<span>.money</span>
        </h1>

        <div className="slither-input-wrapper">
          <input
            className="slither-input"
            value={customStake}
            onChange={(event) => {
              setError(null);
              setCustomStake(event.target.value);
              // Clear simple stake selection if typing custom
              if (event.target.value) setSelectedStakeId(null);
            }}
            placeholder="Valor da aposta (R$)"
          />
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 8 }}>
            {stakes.slice(0, 3).map((stake) => (
              <button
                key={stake.id}
                type="button"
                onClick={() => {
                  setCustomStake('');
                  setSelectedStakeId(stake.id);
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.2)',
                  borderRadius: 12,
                  color: stake.id === selectedStakeId ? '#4ade80' : 'rgba(255,255,255,0.5)',
                  padding: '4px 8px',
                  fontSize: 12,
                  cursor: 'pointer'
                }}
              >
                {stake.label}
              </button>
            ))}
          </div>
        </div>

        {error ? <p className="error" style={{ textAlign: 'center' }}>{error}</p> : null}

        <button
          className="slither-button"
          onClick={handleStartRun}
          disabled={loadingRun}
        >
          {loadingRun ? 'Carregando' : 'Joga'}
        </button>

        {loadingRun && <div className="spinner" />}
      </div>

      {/* Bottom Left: Actions */}
      <div className="slither-corner bottom-left">
        <div className="slither-link-column" onClick={() => setTab('deposit')}>
          <div className="slither-link-icon">
            <span style={{ fontSize: 24, color: '#e2e8f0' }}>+</span>
          </div>
          <span className="slither-link-label">Depositar</span>
        </div>
      </div>

      {/* Bottom Right: History/Withdraw */}
      <div className="slither-corner bottom-right">
        <div style={{ display: 'flex', gap: 24 }}>
          <div className="slither-link-column" onClick={() => setTab('withdraw')}>
            <div className="slither-link-icon">
              <span style={{ fontSize: 24, color: '#e2e8f0' }}>$</span>
            </div>
            <span className="slither-link-label">Sacar</span>
          </div>
          <div className="slither-link-column" onClick={() => setTab('history')}>
            <div className="slither-link-icon">
              <span style={{ fontSize: 24, color: '#e2e8f0' }}>H</span>
            </div>
            <span className="slither-link-label">Histórico</span>
          </div>
        </div>
      </div>

      {/* Very Bottom: Footer Links */}
      <div style={{
        position: 'absolute',
        bottom: 10,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 16,
        opacity: 0.5
      }}>
        <span className="slither-text" style={{ fontSize: 10 }}>privacy</span>
        <span className="slither-text" style={{ fontSize: 10 }}>terms</span>
        <span className="slither-text" style={{ fontSize: 10 }}>contact</span>
      </div>

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

  return 'Erro ao carregar dados';
}
