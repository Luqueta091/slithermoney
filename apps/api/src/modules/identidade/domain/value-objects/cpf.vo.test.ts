import { describe, expect, it } from 'vitest';
import { isValidCpf, normalizeCpf, parseCpf } from './cpf.vo';
import { ValidationError } from '../../../../shared/errors/validation-error';

describe('cpf value object', () => {
  it('normalizes CPF to digits', () => {
    expect(normalizeCpf('935.411.347-80')).toBe('93541134780');
  });

  it('accepts a valid CPF', () => {
    expect(isValidCpf('935.411.347-80')).toBe(true);
    expect(isValidCpf('111.444.777-35')).toBe(true);
  });

  it('rejects invalid CPF sequences', () => {
    expect(isValidCpf('111.111.111-11')).toBe(false);
    expect(isValidCpf('123.456.789-00')).toBe(false);
  });

  it('throws for invalid CPF', () => {
    expect(() => parseCpf('111.111.111-11')).toThrow(ValidationError);
  });
});
