import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  getIdentity,
  login,
  signup,
  type IdentityInput,
  type IdentityProfile,
  upsertIdentity,
} from '../api/client';
import { clearSession, loadSession, saveSession } from '../storage/session';
import { generateAccountId } from '../utils/uuid';
import { isEmail } from '../utils/validation';

type AuthStatus = 'loading' | 'signedOut' | 'needsIdentity' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  accountId: string | null;
  identity: IdentityProfile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<string | null>;
  completeIdentity: (input: IdentityInput, accountIdOverride?: string | null) => Promise<void>;
  signOut: () => void;
  resetError: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<IdentityProfile | null>(null);
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
    void refreshIdentity(stored);
  };

  const refreshIdentity = async (id: string): Promise<void> => {
    try {
      const profile = await getIdentity(id);
      setIdentity(profile);
      setStatus('signedIn');
    } catch (err) {
      const resolved = resolveError(err);
      if (resolved.code === 'identity_not_found') {
        setIdentity(null);
        setStatus('needsIdentity');
        return;
      }

      setError(resolved.message);
      clearSession();
      setAccountId(null);
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
      await refreshIdentity(response.account_id);
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
    }
  };

  const signUp = async (): Promise<void> => {
    setError(null);
    const newId = generateAccountId();
    saveSession(newId);
    setAccountId(newId);
    setIdentity(null);
    setStatus('needsIdentity');
  };

  const signUpWithEmail = async (email: string, password: string): Promise<string | null> => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!isEmail(trimmedEmail)) {
      setError('Email invalido');
      return null;
    }
    if (password.trim().length < 4) {
      setError('Senha invalida');
      return null;
    }

    try {
      const response = await signup(trimmedEmail, password);
      saveSession(response.account_id);
      setAccountId(response.account_id);
      setIdentity(null);
      setStatus('needsIdentity');
      return response.account_id;
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
      return null;
    }
  };

  const completeIdentity = async (input: IdentityInput, accountIdOverride?: string | null): Promise<void> => {
    const resolvedAccountId = accountIdOverride ?? accountId;
    if (!resolvedAccountId) {
      setError('Sessao invalida');
      return;
    }

    setError(null);
    try {
      const profile = await upsertIdentity(resolvedAccountId, input);
      setIdentity(profile);
      setStatus('signedIn');
      setAccountId(resolvedAccountId);
    } catch (err) {
      const resolved = resolveError(err);
      setError(resolved.message);
    }
  };

  const signOut = (): void => {
    clearSession();
    setAccountId(null);
    setIdentity(null);
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
        identity,
        error,
        signIn,
        signUp,
        signUpWithEmail,
        completeIdentity,
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
