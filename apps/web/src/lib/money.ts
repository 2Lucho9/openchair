export type Currency = 'CRC' | 'USD';

export function formatMoney(amount: number, currency: Currency): string {
  const n = Number.isFinite(amount) ? amount : 0;
  const fixed = currency === 'CRC' ? Math.round(n) : Math.round(n * 100) / 100;
  const [int, dec] = Math.abs(fixed).toFixed(currency === 'CRC' ? 0 : 2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const sign = fixed < 0 ? '-' : '';
  const symbol = currency === 'CRC' ? '₡' : '$';
  return `${sign}${symbol}${grouped}${dec ? ',' + dec : ''}`;
}

/** "5000", "5 000", "5000,50", "5000.5" -> número. Devuelve null si no es un precio válido. */
export function parsePrice(input: string): number | null {
  const s = input.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n <= 9_999_999_999 ? n : null;
}
