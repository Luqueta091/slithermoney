import { useEffect, useMemo, useState } from 'react';
import { type RunStartResponse, type Stake, type Wallet, getWallet, listStakes, startRun } from '../api/client';
import { ActionButton } from '../components/ActionButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { formatCents } from '../utils/format';
import { DepositScreen } from './DepositScreen';
import { WithdrawScreen } from './WithdrawScreen';
import { HistoryScreen } from './HistoryScreen';
import { GameScreen } from './GameScreen';
import { useAuth } from '../context/auth';
import { InputField } from '../components/InputField';
import { IdentityScreen, type PixKeyType } from './IdentityScreen';
import { sanitizeCpf } from '../utils/validation';

const TABS = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'deposit', label: 'Depositar' },
  { id: 'withdraw', label: 'Sacar' },
  { id: 'history', label: 'Historico' },
  { id: 'play', label: 'Jogar' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function HomeScreen(): JSX.Element {
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn';
  const needsIdentity = auth.status === 'needsIdentity';
  const accountId = auth.accountId ?? '';
  const identity = auth.identity;
  const [tab, setTab] = useState<TabId>('lobby');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [stakes, setStakes] = useState<Stake[]>([]);
  const [selectedStakeId, setSelectedStakeId] = useState<string | null>(null);
  const [customStake, setCustomStake] = useState('');
  const [run, setRun] = useState<RunStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('email');
  const [pixKey, setPixKey] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);

  useEffect(() => {
    void loadInitialData();
  }, [signedIn, accountId]);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const update = () => setIsMobile(media.matches);
    update();
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

  useEffect(() => {
    const update = () => {
      if (!isMobile) {
        setIsPortrait(false);
        return;
      }
      setIsPortrait(window.matchMedia('(orientation: portrait)').matches);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) {
      return;
    }
    const orientation = screen.orientation;
    if (!orientation || typeof orientation.lock !== 'function') {
      return;
    }
    orientation.lock('landscape').catch(() => undefined);
    return () => {
      if (typeof orientation.unlock === 'function') {
        orientation.unlock();
      }
    };
  }, [isMobile]);

  useEffect(() => {
    if (signedIn) {
      setAuthOpen(false);
      return;
    }
    if (needsIdentity) {
      setAuthOpen(true);
      setAuthMode('signup');
    }
  }, [signedIn, needsIdentity]);

  const loadInitialData = async (): Promise<void> => {
    try {
      const stakesResult = await listStakes();
      setStakes(stakesResult);
      if (!selectedStakeId && stakesResult.length > 0) {
        setSelectedStakeId(stakesResult[0].id);
      }
      if (signedIn && accountId) {
        const walletResult = await getWallet(accountId);
        setWallet(walletResult);
      } else {
        setWallet(null);
      }
    } catch (err) {
      setError(resolveError(err));
    }
  };

  const refreshWallet = async (): Promise<void> => {
    try {
      if (!signedIn || !accountId) {
        return;
      }
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
    if (!ensureAuthenticated('play')) {
      return;
    }
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

  const renderAuthModal = (): JSX.Element | null => {
    if (!authOpen) {
      return null;
    }

    return (
      <div className="auth-overlay">
        <div className="auth-card">
          {authMode === 'signup' ? (
            <IdentityScreen
              accountId={accountId}
              email={email}
              password={password}
              onEmailChange={(value) => {
                auth.resetError();
                setEmail(value);
              }}
              onPasswordChange={(value) => {
                auth.resetError();
                setPassword(value);
              }}
              fullName={fullName}
              cpf={cpf}
              pixKey={pixKey}
              pixKeyType={pixKeyType}
              termsAccepted={termsAccepted}
              onTermsChange={(value) => {
                auth.resetError();
                setTermsAccepted(value);
              }}
              onFullNameChange={(value) => {
                auth.resetError();
                setFullName(value);
              }}
              onCpfChange={(value) => {
                auth.resetError();
                setCpf(value);
              }}
              onPixKeyChange={(value) => {
                auth.resetError();
                setPixKey(value);
              }}
              onPixKeyTypeChange={(value) => {
                auth.resetError();
                setPixKeyType(value);
              }}
              onSubmit={() =>
                (async () => {
                  auth.resetError();
                  const ok = await auth.signUpWithEmail(email, password);
                  if (!ok) {
                    return;
                  }
                  await auth.completeIdentity({
                    fullName: fullName.trim(),
                    cpf: sanitizeCpf(cpf),
                    pixKey: pixKey.trim(),
                    pixKeyType,
                  });
                })()
              }
              onSwitchToLogin={() => {
                auth.resetError();
                setAuthMode('login');
              }}
              onBack={() => {
                auth.resetError();
                setAuthOpen(false);
              }}
              onSignOut={() => {
                auth.signOut();
                setAuthOpen(false);
                setTermsAccepted(false);
              }}
              error={auth.error}
            />
          ) : (
            <>
              <div className="hero">
                <p className="kicker">Sessao</p>
                <h2 className="title">Entrar</h2>
                <p className="subtitle">Use seu email e senha para continuar.</p>
              </div>
              <div className="card">
                <InputField
                  label="Email"
                  value={email}
                  onChange={(value) => {
                    auth.resetError();
                    setEmail(value);
                  }}
                  placeholder="voce@email.com"
                  type="email"
                />
                <InputField
                  label="Senha"
                  value={password}
                  onChange={(value) => {
                    auth.resetError();
                    setPassword(value);
                  }}
                  placeholder="••••••••"
                  type="password"
                />
                {auth.error ? <p className="error">{auth.error}</p> : null}
              </div>
              <div className="actions">
                <ActionButton label="Entrar" onClick={() => auth.signIn(email, password)} />
                <ActionButton
                  label="Criar conta"
                  onClick={() => {
                    auth.resetError();
                    setAuthMode('signup');
                  }}
                  variant="ghost"
                />
                <ActionButton label="Voltar" onClick={() => setAuthOpen(false)} variant="ghost" />
              </div>
            </>
          )}
        </div>
      </div>
    );
  };

  // LOBBY VIEW (Slither Style)
  return (
    <div className="slither-container">
      {/* Background/Particles could go here if we had them */}
      <div className="slither-background" />
      {renderAuthModal()}
      {isMobile && isPortrait ? (
        <div className="landscape-overlay">
          <div className="landscape-card">
            <div className="landscape-title">Gire o celular</div>
            <div className="landscape-subtitle">Este jogo funciona em modo horizontal.</div>
          </div>
        </div>
      ) : null}

      {/* Top Left: Identity */}
      <div className="slither-corner top-left">
        <div className="slither-text">
          <strong>{identity?.full_name ?? 'Jogador'}</strong>
        </div>
        {signedIn ? (
          <button type="button" className="slither-link" onClick={auth.signOut}>
            Sair
          </button>
        ) : (
          <button type="button" className="slither-link" onClick={() => setAuthOpen(true)}>
            Entrar
          </button>
        )}
      </div>

      {/* Top Right: Wallet */}
      {!authOpen && !needsIdentity ? (
        <div className="slither-corner top-right">
          <div className="slither-text">
            Sua Carteira
          </div>
          <div className="slither-text" style={{ fontSize: 18, color: '#fff' }}>
            {formatCents(wallet?.available_balance_cents ?? '0')}
          </div>
        </div>
      ) : null}

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
      {!authOpen && !needsIdentity ? (
        <div className="slither-corner bottom-left">
          <div
            className="slither-link-column"
            onClick={() => {
              if (!ensureAuthenticated('deposit')) {
                return;
              }
              setTab('deposit');
            }}
          >
            <div className="slither-link-icon">
              <span style={{ fontSize: 24, color: '#e2e8f0' }}>+</span>
            </div>
            <span className="slither-link-label">Depositar</span>
          </div>
        </div>
      ) : null}

      {/* Bottom Right: History/Withdraw */}
      {!authOpen && !needsIdentity ? (
        <div className="slither-corner bottom-right">
          <div style={{ display: 'flex', gap: 24 }}>
            <div
              className="slither-link-column"
              onClick={() => {
                if (!ensureAuthenticated('withdraw')) {
                  return;
                }
                setTab('withdraw');
              }}
            >
              <div className="slither-link-icon">
                <span style={{ fontSize: 24, color: '#e2e8f0' }}>$</span>
              </div>
              <span className="slither-link-label">Sacar</span>
            </div>
            <div
              className="slither-link-column"
              onClick={() => {
                if (!ensureAuthenticated('history')) {
                  return;
                }
                setTab('history');
              }}
            >
              <div className="slither-link-icon">
                <span style={{ fontSize: 24, color: '#e2e8f0' }}>H</span>
              </div>
              <span className="slither-link-label">Histórico</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* Very Bottom: Footer Links */}
      {!authOpen && !needsIdentity ? (
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
      ) : null}

    </div>
  );

  function ensureAuthenticated(nextTab?: TabId): boolean {
    if (signedIn) {
      return true;
    }
    setAuthOpen(true);
    setAuthMode(needsIdentity ? 'signup' : 'login');
    if (nextTab) {
      setTab('lobby');
    }
    return false;
  }
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
