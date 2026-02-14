const KEY = 'slithermoney:session';
const LEGACY_KEY = 'slithermoney:account_id';

export type Session = {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresAt: number;
};

export function loadSession(): Session | null {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Session;
      if (
        parsed &&
        typeof parsed.accountId === 'string' &&
        typeof parsed.accessToken === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        typeof parsed.tokenType === 'string' &&
        typeof parsed.expiresAt === 'number'
      ) {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    return null;
  }

  return null;
}

export function saveSession(session: Session): void {
  localStorage.setItem(KEY, JSON.stringify(session));
  localStorage.removeItem(LEGACY_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(LEGACY_KEY);
}
