const KEY = 'slithermoney:account_id';
const PASSWORD_KEY_PREFIX = 'slithermoney:account_password:';

export function loadSession(): string | null {
  return localStorage.getItem(KEY);
}

export function saveSession(accountId: string): void {
  localStorage.setItem(KEY, accountId);
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export function loadPasswordHash(accountId: string): string | null {
  return localStorage.getItem(`${PASSWORD_KEY_PREFIX}${accountId}`);
}

export function savePasswordHash(accountId: string, hash: string): void {
  localStorage.setItem(`${PASSWORD_KEY_PREFIX}${accountId}`, hash);
}

export function clearPasswordHash(accountId: string): void {
  localStorage.removeItem(`${PASSWORD_KEY_PREFIX}${accountId}`);
}
