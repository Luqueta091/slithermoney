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

  const renderContent = (): JSX.Element => {
    switch (tab) {
      case 'deposit':
        return <DepositScreen accountId={accountId} onConfirmed={refreshWallet} />;
      case 'withdraw':
        return <WithdrawScreen accountId={accountId} onUpdated={refreshWallet} />;
      case 'history':
        return <HistoryScreen accountId={accountId} />;
      case 'lobby':
      default:
        return (
          <div className="card">
            <div className="card__label">Saldo</div>
            <div className="card__value">{formatCents(wallet?.available_balance_cents ?? '0')}</div>
            <div className="card__label">Em jogo</div>
            <div className="card__value">{formatCents(wallet?.in_game_balance_cents ?? '0')}</div>
            <div className="card__label">Stake rapida</div>
            <div className="chips">
              {stakes.map((stake) => (
                <button
                  key={stake.id}
                  type="button"
                  className={`chip ${stake.id === selectedStakeId ? 'active' : ''}`}
                  onClick={() => {
                    setCustomStake('');
                    setSelectedStakeId(stake.id);
                  }}
                >
                  {stake.label}
                </button>
              ))}
            </div>

            <label className="form-field">
              <span className="form-label">Stake custom (R$)</span>
              <input
                className="form-input"
                value={customStake}
                onChange={(event) => {
                  setError(null);
                  setCustomStake(event.target.value);
                }}
                placeholder="Ex: 15,00"
              />
              <span className="form-helper">A stake sera reservada ao iniciar a run.</span>
            </label>

            {error ? <p className="error">{error}</p> : null}

            <div className="actions">
              <ActionButton
                label={loadingRun ? 'Iniciando...' : 'Iniciar run'}
                onClick={handleStartRun}
                disabled={loadingRun}
              />
              <ActionButton label="Atualizar saldo" onClick={refreshWallet} variant="ghost" />
            </div>
          </div>
        );
    }
  };

  if (tab === 'play') {
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

  return (
    <ScreenContainer>
      <div className="hero">
        <p className="kicker">Conta ativa</p>
        <h1 className="title">{identity?.full_name ?? 'Jogador'}</h1>
      </div>

      <div className="tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`tab ${tab === item.id ? 'active' : ''}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {renderContent()}

      <div className="actions">
        <ActionButton label="Sair" onClick={onSignOut} variant="ghost" />
      </div>
    </ScreenContainer>
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
