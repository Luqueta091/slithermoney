import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';
import {
  ApiError,
  getIdentity,
  type IdentityInput,
  type IdentityProfile,
  upsertIdentity,
} from '../api/client';
import {
  clearSession,
  loadPasswordHash,
  loadSession,
  savePasswordHash,
  saveSession,
} from '../storage/session';
import { generateAccountId, generateAccountIdFromEmail } from '../utils/uuid';
import { isEmail } from '../utils/validation';
import { hashPassword } from '../utils/password';

type AuthStatus = 'loading' | 'signedOut' | 'needsIdentity' | 'signedIn';

type AuthContextValue = {
  status: AuthStatus;
  accountId: string | null;
  identity: IdentityProfile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: () => Promise<void>;
  signUpWithEmail: (email: string, password: string) => Promise<boolean>;
  completeIdentity: (input: IdentityInput) => Promise<void>;
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

    const derivedId = generateAccountIdFromEmail(trimmedEmail);
    const storedHash = loadPasswordHash(derivedId);
    if (!storedHash) {
      setError('Conta sem senha. Cadastre novamente.');
      return;
    }
    const incomingHash = await hashPassword(password);
    if (incomingHash !== storedHash) {
      setError('Senha incorreta');
      return;
    }
    saveSession(derivedId);
    setAccountId(derivedId);
    await refreshIdentity(derivedId);
  };

  const signUp = async (): Promise<void> => {
    setError(null);
    const newId = generateAccountId();
    saveSession(newId);
    setAccountId(newId);
    setIdentity(null);
    setStatus('needsIdentity');
  };

  const signUpWithEmail = async (email: string, password: string): Promise<boolean> => {
    setError(null);
    const trimmedEmail = email.trim();
    if (!isEmail(trimmedEmail)) {
      setError('Email invalido');
      return false;
    }
    if (password.trim().length < 4) {
      setError('Senha invalida');
      return false;
    }

    const derivedId = generateAccountIdFromEmail(trimmedEmail);
    const passwordHash = await hashPassword(password);
    saveSession(derivedId);
    savePasswordHash(derivedId, passwordHash);
    setAccountId(derivedId);
    setIdentity(null);
    setStatus('needsIdentity');
    return true;
  };

  const completeIdentity = async (input: IdentityInput): Promise<void> => {
    if (!accountId) {
      setError('Sessao invalida');
      return;
    }

    setError(null);
    try {
      const profile = await upsertIdentity(accountId, input);
      setIdentity(profile);
      setStatus('signedIn');
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
