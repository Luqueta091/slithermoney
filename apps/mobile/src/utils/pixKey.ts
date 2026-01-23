export const PIX_KEY_TYPES = [
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Telefone' },
  { key: 'cpf', label: 'CPF' },
  { key: 'random', label: 'Aleatoria' },
] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number]['key'];

export function pixKeyPlaceholder(type: PixKeyType): string {
  switch (type) {
    case 'email':
      return 'email@exemplo.com';
    case 'phone':
      return '+5511999999999';
    case 'cpf':
      return '000.000.000-00';
    case 'random':
      return '00000000-0000-0000-0000-000000000000';
    default:
      return '';
  }
}

export function pixKeyHelper(type: PixKeyType): string {
  switch (type) {
    case 'phone':
      return 'Use o formato internacional com +55.';
    case 'random':
      return 'Chave aleatoria deve ser um UUID.';
    default:
      return '';
  }
}
