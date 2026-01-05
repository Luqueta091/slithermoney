import { ValidationError } from '../../../../shared/errors/validation-error';

export function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

export function isValidCpf(value: string): boolean {
  const digits = normalizeCpf(value);

  if (digits.length !== 11) {
    return false;
  }

  if (/^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const numbers = digits.split('').map((digit) => Number(digit));

  const firstCheck = calculateCheckDigit(numbers.slice(0, 9), 10);
  if (firstCheck !== numbers[9]) {
    return false;
  }

  const secondCheck = calculateCheckDigit(numbers.slice(0, 10), 11);
  return secondCheck === numbers[10];
}

export function parseCpf(value: string): string {
  if (!isValidCpf(value)) {
    throw new ValidationError('CPF inválido');
  }

  return normalizeCpf(value);
}

function calculateCheckDigit(numbers: number[], weightStart: number): number {
  const sum = numbers.reduce((total, digit, index) => total + digit * (weightStart - index), 0);
  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}
