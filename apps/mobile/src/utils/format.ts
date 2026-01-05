export function formatCents(value: string | number): string {
  const cents = typeof value === 'string' ? Number.parseInt(value, 10) : value;
  if (!Number.isFinite(cents)) {
    return 'R$ 0,00';
  }

  const amount = (cents / 100).toFixed(2).replace('.', ',');
  return `R$ ${amount}`;
}

export function formatDate(value?: string | null): string {
  if (!value) {
    return '-';
  }

  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return '-';
  }

  return date.toLocaleString('pt-BR');
}
