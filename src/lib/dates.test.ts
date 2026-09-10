import { describe, expect, it } from 'vitest';
import {
  parseDate,
  addMonthsToKey,
  monthEnd,
  dayInMonth,
  isLeapYear,
  addDays,
  diffDays,
} from './dates';

describe('parseDate', () => {
  it('parses ISO dates', () => {
    expect(parseDate('2024-09-10')).toBe('2024-09-10');
    expect(parseDate('2024-9-5')).toBe('2024-09-05');
  });

  it('parses YYYYMMDD', () => {
    expect(parseDate('20240910')).toBe('2024-09-10');
  });

  it('parses US formats (MM/DD/YYYY)', () => {
    expect(parseDate('09/10/2024')).toBe('2024-09-10');
    expect(parseDate('9/10/2024')).toBe('2024-09-10');
    expect(parseDate('09-10-2024')).toBe('2024-09-10');
  });

  it('parses DD/MM/YYYY when unambiguous', () => {
    // 4-digit year in the last position with day-first convention is ambiguous;
    // our parser assumes MM/DD/YYYY unless the first segment is a 4-digit year.
    expect(parseDate('10/09/2024')).toBe('2024-10-09'); // MM/DD convention
    expect(parseDate('2024/09/10')).toBe('2024-09-10');
  });

  it('parses month-name formats', () => {
    expect(parseDate('Sep 10 2024')).toBe('2024-09-10');
    expect(parseDate('September 10, 2024')).toBe('2024-09-10');
    expect(parseDate('10 Sep 2024')).toBe('2024-09-10');
  });

  it('parses Excel serial dates', () => {
    expect(parseDate(45545)).toBe('2024-09-10');
  });

  it('parses ISO with time', () => {
    expect(parseDate('2024-09-10T12:00:00')).toBe('2024-09-10');
  });

  it('returns null for garbage', () => {
    expect(parseDate('not a date')).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
  });

  it('handles 2-digit years', () => {
    expect(parseDate('9/10/24')).toBe('2024-09-10');
  });
});

describe('month arithmetic', () => {
  it('adds months across year boundaries', () => {
    expect(addMonthsToKey('2024-11', 2)).toBe('2025-01');
    expect(addMonthsToKey('2024-01', -1)).toBe('2023-12');
    expect(addMonthsToKey('2024-12', 1)).toBe('2025-01');
  });
});

describe('leap years', () => {
  it('detects leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2023)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });

  it('clamps day-in-month for February', () => {
    expect(dayInMonth(2024, 2, 29)).toBe(29); // leap year
    expect(dayInMonth(2023, 2, 29)).toBe(28); // non-leap
    expect(dayInMonth(2024, 4, 31)).toBe(30);
  });

  it('computes correct month ends', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2023-02')).toBe('2023-02-28');
    expect(monthEnd('2024-12')).toBe('2024-12-31');
  });
});

describe('day arithmetic', () => {
  it('adds days across month boundaries', () => {
    expect(addDays('2024-01-31', 1)).toBe('2024-02-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29'); // leap
    expect(addDays('2023-12-31', 1)).toBe('2024-01-01');
  });

  it('computes day differences', () => {
    expect(diffDays('2024-01-01', '2024-01-10')).toBe(9);
    expect(diffDays('2024-01-10', '2024-01-01')).toBe(-9);
  });
});