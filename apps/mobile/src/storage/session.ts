const KEY = 'slithermoney:account_id';

export function loadSession(): string | null {
  return localStorage.getItem(KEY);
}

export function saveSession(accountId: string): void {
  localStorage.setItem(KEY, accountId);
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}
