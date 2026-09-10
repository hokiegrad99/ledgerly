import { describe, expect, it } from 'vitest';
import { parseMoney, formatMoney, scale, parseInputMoney } from './money';

describe('parseMoney', () => {
  it('parses plain dollars into cents', () => {
    expect(parseMoney('1234.56')).toBe(123456);
    expect(parseMoney('0.10')).toBe(10);
    expect(parseMoney('0.2')).toBe(20);
  });

  it('handles currency symbols and thousands separators', () => {
    expect(parseMoney('$1,234.56')).toBe(123456);
    expect(parseMoney('€1.234,56')).toBe(123456);
    expect(parseMoney('1,234')).toBe(123400);
    expect(parseMoney('1.234')).toBe(123400); // thousands separator heuristic
  });

  it('handles negatives and parentheses', () => {
    expect(parseMoney('-45.00')).toBe(-4500);
    expect(parseMoney('(45.00)')).toBe(-4500);
    expect(parseMoney('-$45.00')).toBe(-4500);
  });

  it('returns null for invalid input', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney(undefined)).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('never produces float artifacts (0.1 + 0.2 case)', () => {
    expect((parseMoney('0.1') ?? 0) + (parseMoney('0.2') ?? 0)).toBe(30);
    expect((parseMoney('0.29') ?? 0) + (parseMoney('0.01') ?? 0)).toBe(30);
    expect((parseMoney('10.01') ?? 0) + (parseMoney('0.99') ?? 0)).toBe(1100);
  });
});

describe('formatMoney', () => {
  it('formats cents', () => {
    expect(formatMoney(123456)).toBe('$1,234.56');
    expect(formatMoney(0)).toBe('$0.00');
    expect(formatMoney(-500)).toBe('-$5.00');
  });

  it('handles null and NaN', () => {
    expect(formatMoney(null)).toBe('—');
    expect(formatMoney(undefined)).toBe('—');
  });

  it('supports other currencies', () => {
    const out = formatMoney(1234, 'EUR');
    expect(out).toContain('12.34');
  });
});

describe('scale', () => {
  it('scales without float drift', () => {
    expect(scale(10000, 1, 3)).toBe(3333);
    expect(scale(9999, 1, 3)).toBe(3333);
  });
});

describe('parseInputMoney', () => {
  it('parses input field strings', () => {
    expect(parseInputMoney('12.5')).toBe(1250);
    expect(parseInputMoney('-12.5')).toBe(-1250);
    expect(parseInputMoney('')).toBeNull();
  });
});