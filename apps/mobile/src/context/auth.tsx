import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  getProfile,
  login,
  signup,
  type Profile,
  updateProfile,
} from '../api/client';
import { clearSession, loadSession, saveSession } from '../storage/session';
import { isEmail } from '../utils/validation';

type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  accountId: string | null;
  profile: Profile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<boolean>;
  signOut: () => void;
  resetError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrap();
  }, []);

  const bootstrap = (): void => {
    const stored = loadSession();
    if (!stored) {
      setStatus('signedOut');
      return;
    }

    setAccountId(stored);
    void refreshProfile(stored);
  };

  const refreshProfile = async (id: string): Promise<void> => {
    try {
      const nextProfile = await getProfile(id);
      setProfile(nextProfile);
      setStatus('signedIn');
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
      clearSession();
      setAccountId(null);
      setProfile(null);
      setStatus('signedOut');
    }
  };

  const signIn = async (email: string, password: string): Promise<void> => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!isEmail(trimmedEmail)) {
      setError('Email invalido');
      return;
    }
    if (password.trim().length < 4) {
      setError('Senha invalida');
      return;
    }

    try {
      const response = await login(trimmedEmail, password);
      saveSession(response.account_id);
      setAccountId(response.account_id);
      await refreshProfile(response.account_id);
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
    }
  };

  const signUpWithEmail = async (email: string, password: string): Promise<void> => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!isEmail(trimmedEmail)) {
      setError('Email invalido');
      return;
    }
    if (password.trim().length < 4) {
      setError('Senha invalida');
      return;
    }

    try {
      const response = await signup(trimmedEmail, password);
      saveSession(response.account_id);
      setAccountId(response.account_id);
      await refreshProfile(response.account_id);
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
    }
  };

  const updateDisplayName = async (displayName: string): Promise<boolean> => {
    if (!accountId) {
      setError('Sessao invalida');
      return false;
    }

    setError(null);
    try {
      const next = await updateProfile(accountId, { displayName: displayName.trim() });
      setProfile(next);
      return true;
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
      return false;
    }
  };

  const signOut = (): void => {
    clearSession();
    setAccountId(null);
    setProfile(null);
    setStatus('signedOut');
  };

  const resetError = (): void => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        status,
        accountId,
        profile,
        error,
        signIn,
        signUpWithEmail,
        updateDisplayName,
        signOut,
        resetError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return ctx;
}

type ResolvedError = {
  message: string;
  code?: string;
};

function resolveError(error: unknown): ResolvedError {
  if (error instanceof ApiError) {
    return {
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    return { message: error.message };
  }

  return { message: 'Erro inesperado' };
}
