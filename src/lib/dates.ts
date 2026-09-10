/**
 * Date utilities. Dates are stored as 'YYYY-MM-DD' strings (local time)
 * for transactions and 'YYYY-MM' for months/budgets.
 */

export type ISODate = string; // YYYY-MM-DD
export type MonthKey = string; // YYYY-MM

export function todayISO(): ISODate {
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): ISODate {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function monthKeyOf(date: ISODate | Date): MonthKey {
  if (typeof date === 'string') return date.slice(0, 7);
  const d = date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function currentMonthKey(): MonthKey {
  return monthKeyOf(new Date());
}

/** Add n months to a month key (handles year rollover). */
export function addMonthsToKey(key: MonthKey, n: number): MonthKey {
  const [y, m] = key.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthsBetween(a: MonthKey, b: MonthKey): number {
  const [ay, am] = a.split('-').map(Number);
  const [by, bm] = b.split('-').map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** Parse a wide variety of date inputs into YYYY-MM-DD. Returns null on failure. */
export function parseDate(input: string | number | Date | null | undefined): ISODate | null {
  if (input === null || input === undefined || input === '') return null;
  if (input instanceof Date) return toISODate(input);
  if (typeof input === 'number') {
    // Excel-style serial date (days since 1899-12-30), computed in UTC to avoid TZ drift.
    if (input > 10000 && input < 60000) {
      const ms = Math.round((input - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : toISODate(d);
  }
  let s = String(input).trim();
  if (s === '') return null;
  // YYYYMMDD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // YYYY-MM-DD (already normalized)
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    return null;
  }
  // ISO with time
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return s.slice(0, 10);
  }
  // Common textual formats: MM/DD/YYYY, DD/MM/YYYY, MM-DD-YYYY, M/D/YY, etc.
  const sepMatch = s.match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
  if (sepMatch) {
    const [, a, b, c] = sepMatch;
    let y: number, m: number, d: number;
    if (a.length === 4) {
      // 2024/09/10
      y = Number(a); m = Number(b); d = Number(c);
    } else if (c.length === 4) {
      // MM/DD/YYYY (US convention)
      y = Number(c); m = Number(a); d = Number(b);
    } else if (c.length === 2) {
      // M/D/YY
      y = 2000 + Number(c); m = Number(a); d = Number(b);
    } else {
      // default MM/DD/YYYY
      y = Number(c); m = Number(a); d = Number(b);
    }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }
  // Month name formats: "Sep 10 2024", "10 Sep 2024", "September 10, 2024"
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = s.match(/([A-Za-z]{3,})[\s.,]+(\d{1,2})(?:st|nd|rd|th)?[\s.,]+(\d{4})/i);
  if (named) {
    const mIdx = monthNames.indexOf(named[1].slice(0, 3).toLowerCase());
    if (mIdx >= 0) {
      const d = Number(named[2]);
      const y = Number(named[3]);
      if (d >= 1 && d <= 31) return `${y}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const named2 = s.match(/(\d{1,2})[\s.]+([A-Za-z]{3,})[\s.,]+(\d{4})/i);
  if (named2) {
    const mIdx = monthNames.indexOf(named2[2].slice(0, 3).toLowerCase());
    if (mIdx >= 0) {
      const d = Number(named2[1]);
      const y = Number(named2[3]);
      if (d >= 1 && d <= 31) return `${y}-${String(mIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  // Last resort: Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toISODate(new Date(t));
  return null;
}

/** Format an ISO date per user preference. */
export function formatDate(iso: ISODate | null | undefined, dateFormat = 'YYYY-MM-DD'): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  switch (dateFormat) {
    case 'MM/DD/YYYY':
      return `${m}/${d}/${y}`;
    case 'DD/MM/YYYY':
      return `${d}/${m}/${y}`;
    case 'MMM D, YYYY':
      return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    default:
      return iso;
  }
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Add n days to an ISO date, handling month/year boundaries. */
export function addDays(iso: ISODate, n: number): ISODate {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function addMonths(iso: ISODate, n: number): ISODate {
  const d = fromISODate(iso);
  d.setMonth(d.getMonth() + n);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  const da = fromISODate(a);
  const db = fromISODate(b);
  return Math.round((db.getTime() - da.getTime()) / 86400000);
}

/** Day of month for a recurring schedule: clamp to last day for short months. */
export function dayInMonth(year: number, month: number /* 1-12 */, day: number): number {
  const lastDay = new Date(year, month, 0).getDate();
  return Math.min(day, lastDay);
}

/** First day of the month for a month key. */
export function monthStart(key: MonthKey): ISODate {
  return `${key}-01`;
}

/** Last day of the month for a month key (leap-year safe). */
export function monthEnd(key: MonthKey): ISODate {
  const [y, m] = key.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key}-${String(last).padStart(2, '0')}`;
}

/** Format a month key as a human label, e.g. "September 2026". */
export function formatMonth(key: MonthKey): string {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}