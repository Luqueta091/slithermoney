import { ValidationError } from '../../../../shared/errors/validation-error';
import { isValidCpf, normalizeCpf } from './cpf.vo';

export type PixKeyType = 'cpf' | 'phone' | 'email' | 'random';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const PHONE_REGEX = /^\+[1-9]\d{1,14}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parsePixKey(value: string, type: PixKeyType): string {
  switch (type) {
    case 'cpf': {
      if (!isValidCpf(value)) {
        throw new ValidationError('Chave Pix CPF inválida');
      }

      return normalizeCpf(value);
    }
    case 'phone': {
      if (!PHONE_REGEX.test(value)) {
        throw new ValidationError('Chave Pix telefone inválida');
      }

      return value;
    }
    case 'email': {
      if (!EMAIL_REGEX.test(value)) {
        throw new ValidationError('Chave Pix email inválida');
      }

      return value.toLowerCase();
    }
    case 'random': {
      if (!UUID_REGEX.test(value)) {
        throw new ValidationError('Chave Pix aleatória inválida');
      }

      return value.toLowerCase();
    }
    default: {
      throw new ValidationError('Tipo de chave Pix inválido');
    }
  }
}
