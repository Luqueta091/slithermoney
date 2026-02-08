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
import { IdentityScreen } from './IdentityScreen';
import { type PixKeyType } from '../utils/pixKey';
import { sanitizeCpf } from '../utils/validation';

const TABS = [
  { id: 'lobby', label: 'Lobby' },
  { id: 'deposit', label: 'Depositar' },
  { id: 'withdraw', label: 'Sacar' },
  { id: 'history', label: 'Historico' },
  { id: 'play', label: 'Jogar' },
] as const;

const FEATURED_STAKE_VALUES = [100, 500, 2000];

const LEADERBOARD_ENTRIES = [
  { name: 'vipercore', value: '$13,704.34' },
  { name: 'nebulafox', value: '$13,237.94' },
  { name: 'slimepilot', value: '$11,384.94' },
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
  const [customStake] = useState('');
  const [run, setRun] = useState<RunStartResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingRun, setLoadingRun] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'profile'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [cpf, setCpf] = useState('');
  const [pixKeyType, setPixKeyType] = useState<PixKeyType>('email');
  const [pixKey, setPixKey] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [nicknameSaving, setNicknameSaving] = useState(false);
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

  useEffect(() => {
    if (!identity) {
      return;
    }
    if (!pixKey) {
      setPixKey(identity.pix_key ?? '');
      if (identity.pix_key_type) {
        setPixKeyType(identity.pix_key_type as PixKeyType);
      }
    }
  }, [identity, pixKey, pixKeyType]);

  useEffect(() => {
    if (identity?.full_name) {
      setNicknameDraft(identity.full_name);
    }
  }, [identity?.full_name]);

  const featuredStakes = useMemo(() => pickFeaturedStakes(stakes), [stakes]);

  useEffect(() => {
    if (featuredStakes.length === 0) {
      return;
    }

    if (!selectedStakeId || !featuredStakes.some((stake) => stake.id === selectedStakeId)) {
      setSelectedStakeId(featuredStakes[0].id);
    }
  }, [featuredStakes, selectedStakeId]);

  const selectedStake = useMemo(() => {
    const fromFeatured = featuredStakes.find((stake) => stake.id === selectedStakeId) ?? null;
    if (fromFeatured) {
      return fromFeatured;
    }
    return stakes.find((stake) => stake.id === selectedStakeId) ?? null;
  }, [featuredStakes, stakes, selectedStakeId]);

  const stakeCents = useMemo(() => {
    if (customStake.trim()) {
      return parseAmountToCents(customStake);
    }

    return selectedStake ? Number.parseInt(selectedStake.amount_cents, 10) : null;
  }, [customStake, selectedStake]);

  const loadInitialData = async (): Promise<void> => {
    try {
      const stakesResult = await listStakes();
      setStakes(stakesResult);
      const featured = pickFeaturedStakes(stakesResult);
      if (!selectedStakeId && featured.length > 0) {
        setSelectedStakeId(featured[0].id);
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

  if (tab !== 'lobby') {
    let content: JSX.Element | null = null;
    switch (tab) {
      case 'deposit':
        content = <DepositScreen accountId={accountId} onConfirmed={refreshWallet} />;
        break;
      case 'withdraw':
        content = (
          <WithdrawScreen
            accountId={accountId}
            onUpdated={refreshWallet}
            pixKey={pixKey}
            pixKeyType={pixKeyType}
          />
        );
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
          {authMode === 'profile' ? (
            <>
              <div className="hero">
                <p className="kicker">Perfil</p>
                <h2 className="title">Editar nickname</h2>
                <p className="subtitle">Altere o nome exibido na home.</p>
              </div>
              <div className="card">
                <InputField
                  label="Nickname"
                  value={nicknameDraft}
                  onChange={(value) => {
                    auth.resetError();
                    setNicknameError(null);
                    setNicknameDraft(value);
                  }}
                  placeholder="Seu nickname"
                />
                {nicknameError ? <p className="error">{nicknameError}</p> : null}
                {auth.error ? <p className="error">{auth.error}</p> : null}
              </div>
              <div className="actions">
                <ActionButton
                  label={nicknameSaving ? 'Salvando...' : 'Salvar nickname'}
                  disabled={nicknameSaving}
                  onClick={async () => {
                    if (!signedIn || !identity) {
                      setNicknameError('Sessao invalida');
                      return;
                    }

                    const nextName = nicknameDraft.trim();
                    if (!nextName) {
                      setNicknameError('Informe um nickname valido');
                      return;
                    }

                    const pixType = normalizePixKeyType(identity.pix_key_type);
                    if (!pixType) {
                      setNicknameError('Tipo de chave Pix invalido no perfil');
                      return;
                    }

                    auth.resetError();
                    setNicknameError(null);
                    setNicknameSaving(true);
                    const success = await auth.completeIdentity({
                      fullName: nextName,
                      cpf: sanitizeCpf(identity.cpf),
                      pixKey: identity.pix_key,
                      pixKeyType: pixType,
                    });
                    setNicknameSaving(false);
                    if (success) {
                      setAuthOpen(false);
                    }
                  }}
                />
                <ActionButton
                  label="Cancelar"
                  variant="ghost"
                  onClick={() => {
                    auth.resetError();
                    setNicknameError(null);
                    setAuthOpen(false);
                  }}
                />
              </div>
            </>
          ) : authMode === 'signup' ? (
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
                  const createdAccountId = await auth.signUpWithEmail(email, password);
                  if (!createdAccountId) {
                    return;
                  }
                  await auth.completeIdentity(
                    {
                      fullName: fullName.trim(),
                      cpf: sanitizeCpf(cpf),
                      pixKey: pixKey.trim(),
                      pixKeyType,
                    },
                    createdAccountId,
                  );
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

  return (
    <div className="slither-container">
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

      <main className="home-shell">
        <header className="home-header">
          <h1 className="home-brand">Slithermoney</h1>
        </header>

        <section className="home-grid">
          <article className="home-card home-card--play">
            <div className="home-play-head">
              <span className="home-play-session">{signedIn ? 'Conectado' : 'Visitante'}</span>
              <button
                type="button"
                className="home-link-btn"
                onClick={() => {
                  if (signedIn) {
                    auth.signOut();
                    return;
                  }
                  setAuthOpen(true);
                  setAuthMode(needsIdentity ? 'signup' : 'login');
                }}
              >
                {signedIn ? 'Sair' : 'Entrar'}
              </button>
            </div>

            <div className="home-player-row">
              <div className="home-player-avatar">?</div>
              <button
                type="button"
                className="home-player-name"
                onClick={() => {
                  if (signedIn) {
                    auth.resetError();
                    setNicknameError(null);
                    setAuthMode('profile');
                    setAuthOpen(true);
                    return;
                  }
                  setAuthOpen(true);
                  setAuthMode(needsIdentity ? 'signup' : 'login');
                }}
              >
                {signedIn ? identity?.full_name ?? 'Jogador' : 'Login para definir seu nome'}
              </button>
              <button
                type="button"
                className="home-player-edit"
                onClick={() => {
                  if (signedIn) {
                    auth.resetError();
                    setNicknameError(null);
                    setAuthMode('profile');
                    setAuthOpen(true);
                    return;
                  }
                  setAuthOpen(true);
                  setAuthMode(needsIdentity ? 'signup' : 'login');
                }}
                aria-label="Abrir login"
              >
                ✎
              </button>
            </div>

            <div className="home-stakes">
              {featuredStakes.map((stake) => (
                <button
                  key={stake.id}
                  type="button"
                  className={`home-stake-btn ${selectedStakeId === stake.id ? 'active' : ''}`}
                  onClick={() => {
                    setError(null);
                    setSelectedStakeId(stake.id);
                  }}
                >
                  {formatStakeLabel(stake)}
                </button>
              ))}
            </div>

            <button className="home-join-btn" onClick={handleStartRun} disabled={loadingRun}>
              {loadingRun ? 'Carregando...' : 'JOIN GAME'}
            </button>

            {error ? <p className="error home-error">{error}</p> : null}

            <div className="home-stats-row">
              <div className="home-stat-item">
                <strong>40</strong>
                <span>Players in Game</span>
              </div>
              <div className="home-stat-item">
                <strong>$1,316,622</strong>
                <span>Global Player Winnings</span>
              </div>
            </div>
          </article>

          <article className="home-card home-card--wallet">
            <div className="home-card-title">Carteira</div>
            <div className="home-wallet-value">{formatCents(wallet?.available_balance_cents ?? '0')}</div>

            <div className="home-wallet-actions">
              <button
                type="button"
                className="home-action-btn home-action-btn--deposit"
                onClick={() => {
                  if (!ensureAuthenticated('deposit')) {
                    return;
                  }
                  setTab('deposit');
                }}
              >
                Depositar
              </button>
              <button
                type="button"
                className="home-action-btn home-action-btn--withdraw"
                onClick={() => {
                  if (!ensureAuthenticated('withdraw')) {
                    return;
                  }
                  setTab('withdraw');
                }}
              >
                Sacar
              </button>
            </div>
          </article>

          <article className="home-card home-card--leaderboard">
            <div className="home-leaderboard-head">
              <div className="home-card-title">Leaderboard</div>
              <span className="home-live-pill">Live</span>
            </div>
            <ol className="home-leaderboard-list">
              {LEADERBOARD_ENTRIES.map((entry, index) => (
                <li key={entry.name}>
                  <span>{index + 1}. {entry.name}</span>
                  <strong>{entry.value}</strong>
                </li>
              ))}
            </ol>
          </article>
        </section>
      </main>
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

function pickFeaturedStakes(stakes: Stake[]): Stake[] {
  const used = new Set<string>();
  const picked: Stake[] = [];

  for (const cents of FEATURED_STAKE_VALUES) {
    const match = stakes.find((stake) => Number.parseInt(stake.amount_cents, 10) === cents);
    if (match && !used.has(match.id)) {
      picked.push(match);
      used.add(match.id);
    }
  }

  for (const stake of stakes) {
    if (picked.length >= 3) {
      break;
    }
    if (!used.has(stake.id)) {
      picked.push(stake);
      used.add(stake.id);
    }
  }

  return picked;
}

function formatStakeLabel(stake: Stake): string {
  const value = Number.parseInt(stake.amount_cents, 10) / 100;
  if (Number.isInteger(value)) {
    return `$${value.toFixed(0)}`;
  }
  return `$${value.toFixed(2)}`;
}

function normalizePixKeyType(value: string): PixKeyType | null {
  if (value === 'cpf' || value === 'phone' || value === 'email' || value === 'random') {
    return value;
  }
  return null;
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
