export const PIX_KEY_TYPES = [
  { key: 'cpf', label: 'CPF' },
] as const;

export type PixKeyType = (typeof PIX_KEY_TYPES)[number]['key'];

export function pixKeyPlaceholder(type: PixKeyType): string {
  switch (type) {
    case 'cpf':
      return '000.000.000-00';
    default:
      return '';
  }
}

export function pixKeyHelper(type: PixKeyType): string {
  switch (type) {
    case 'cpf':
      return 'Use apenas CPF valido.';
    default:
      return '';
  }
}
