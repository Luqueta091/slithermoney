import { v4 as uuidv4, v5 as uuidv5 } from 'uuid';

export function generateAccountId(): string {
  return uuidv4();
}

const EMAIL_NAMESPACE = uuidv5.DNS;

export function generateAccountIdFromEmail(email: string): string {
  return uuidv5(email.trim().toLowerCase(), EMAIL_NAMESPACE);
}
