import { describe, expect, it } from 'vitest';
import { parsePixKey } from './pix-key.vo';
import { ValidationError } from '../../../../shared/errors/validation-error';

describe('pix key value object', () => {
  it('accepts CPF pix key', () => {
    expect(parsePixKey('935.411.347-80', 'cpf')).toBe('93541134780');
  });

  it('accepts phone pix key', () => {
    expect(parsePixKey('+5511999999999', 'phone')).toBe('+5511999999999');
  });

  it('accepts email pix key', () => {
    expect(parsePixKey('User@Example.com', 'email')).toBe('user@example.com');
  });

  it('accepts random pix key', () => {
    expect(parsePixKey('550e8400-e29b-41d4-a716-446655440000', 'random')).toBe(
      '550e8400-e29b-41d4-a716-446655440000',
    );
  });

  it('rejects invalid keys', () => {
    expect(() => parsePixKey('not-an-email', 'email')).toThrow(ValidationError);
    expect(() => parsePixKey('123', 'phone')).toThrow(ValidationError);
    expect(() => parsePixKey('not-uuid', 'random')).toThrow(ValidationError);
  });
});
