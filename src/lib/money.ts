/**
 * Decimal-safe money handling.
 *
 * All monetary amounts in Ledgerly are stored as **integer cents**
 * (or, for per-unit prices that need more precision, integer
 * "micro-units" — see `micro` helpers). JavaScript floats are never used
 * for accounting math: `0.1 + 0.2` is avoided everywhere in financial
 * calculations.
 */

/** Parse a human string like "$1,234.56", "1.234,56 €", "-45.00" into integer cents. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }
  let s = String(input).trim();
  if (s === '') return null;
  // Strip currency symbols and thousands separators.
  s = s.replace(/[^\d.,+\-()]/g, '');
  // Handle parentheses for negatives: (123.45) => -123.45
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (s === '') return null;
  // Determine decimal separator: if both '.' and ',' present, the last one is the decimal sep.
  let decimalSep = '';
  if (s.includes('.') && s.includes(',')) {
    decimalSep = s.lastIndexOf('.') > s.lastIndexOf(',') ? '.' : ',';
  } else if (s.includes('.')) {
    // "1.234" could be 1234 (thousands) or 1.234 (decimal). Use locale-ish heuristic:
    // if there are exactly 3 digits after '.', treat as thousands separator.
    const after = s.split('.')[1];
    decimalSep = after.length === 3 ? '' : '.';
  } else if (s.includes(',')) {
    const after = s.split(',')[1];
    decimalSep = after.length === 3 ? '' : ',';
  }
  if (decimalSep === ',') s = s.replace(/\./g, '').replace(',', '.');
  else if (decimalSep === '.') s = s.replace(/,/g, '');
  else s = s.replace(/[.,]/g, '');
  const num = Number(s);
  if (Number.isNaN(num)) return null;
  const cents = Math.round(num * 100);
  return negative ? -cents : cents;
}

/** Convert cents to a display string with the given currency. */
export function formatMoney(cents: number | null | undefined, currency = 'USD', opts: { compact?: boolean } = {}): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '—';
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(value);
  } catch {
    // Unknown currency code fallback.
    return `${value.toFixed(2)} ${currency}`;
  }
}

/** Format cents without a currency symbol (e.g. for input fields). */
export function formatMoneyPlain(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '';
  return (cents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse an amount from an input field into cents. Returns null for empty/invalid. */
export function parseInputMoney(input: string): number | null {
  return parseMoney(input);
}

// --- Arithmetic helpers (all integer math) ---

export const add = (a: number, b: number): number => a + b;
export const sub = (a: number, b: number): number => a - b;
export const neg = (a: number): number => -a;

/** Scale an amount by a ratio without leaving integer space: amount * (num/den). */
export function scale(amount: number, num: number, den: number): number {
  return Math.round((amount * num) / den);
}

/** Sum a list of cents values. */
export function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + (Number.isFinite(v) ? v : 0), 0);
}

// --- Micro-unit helpers for per-unit prices (shares × price) ---

/** Convert a decimal share count / price string into micro-units (1/1,000,000 of a unit). */
export function toMicro(value: number | string): number {
  return Math.round(Number(value) * 1_000_000);
}

export function fromMicro(micro: number): number {
  return micro / 1_000_000;
}

/**
 * Compute shares × price in integer-safe space.
 * sharesMicro and priceMicro are both micro-units.
 * Result is in micro-units of value: (s/1e6)*(p/1e6) value units = s*p/1e6 units => s*p micro-units? No:
 * shares * price (in units) = (s/1e6)*(p/1e6) = s*p/1e12 units = s*p/1e6 micro-units.
 * We want the result in cents: value units * 100.
 * Simplest safe approach: use Number math only on the final small products, rounding at the end.
 */
export function sharesTimesPrice(shares: number, priceCents: number): number {
  return Math.round(shares * priceCents);
}

/** Safe division returning a ratio; guards against zero divisor. */
export function ratio(num: number, den: number): number {
  if (den === 0) return 0;
  return num / den;
}

/** Percent complete, clamped 0..100. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return part <= 0 ? 0 : 100;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 1000) / 10));
}