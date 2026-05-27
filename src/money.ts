export const MONEY_SYMBOL = 'Rs.';

const moneyFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return `${MONEY_SYMBOL} ${moneyFormatter.format(n)}`;
}

export function formatMoneyValue(amount: number | null | undefined): string {
  const n = typeof amount === 'number' && Number.isFinite(amount) ? amount : 0;
  return moneyFormatter.format(n);
}
