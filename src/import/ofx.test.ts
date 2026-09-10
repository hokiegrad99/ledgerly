import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOfx, parseOfxDate, parseOfxAmount, looksLikeOfx } from './ofx';
import { normalizeOfxTransactions } from './normalize';

// Realistic fixture loaded from disk (kept out of Tailwind's content scan).
const SAMPLE_OFX = readFileSync(resolve('src/test/fixtures/sample.ofx'), 'utf8');

describe('parseOfx', () => {
  it('parses transactions with FITID, date, amount, name', () => {
    const result = parseOfx(SAMPLE_OFX);
    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(2);
    const first = result.transactions[0];
    expect(first.fitid).toBe('20240910001');
    expect(first.date).toBe('2024-09-10');
    expect(first.amount).toBe(-4567);
    expect(first.name).toBe('GROCERY STORE');
    expect(first.memo).toBe('DEBIT CARD PURCHASE');
  });

  it('extracts account info', () => {
    const result = parseOfx(SAMPLE_OFX);
    expect(result.account.institution).toBe('First Community Bank');
    expect(result.account.accountId).toBe('4821');
    expect(result.account.balance).toBe(123456);
    expect(result.account.balanceDate).toBe('2024-09-10');
  });

  it('preserves FITIDs for duplicate detection', () => {
    const result = parseOfx(SAMPLE_OFX);
    expect(result.fitids).toEqual(['20240910001', '20240905002']);
  });

  it('reports empty statements', () => {
    const result = parseOfx('<OFX></OFX>');
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('handles QFX wrapper (no OFX close tag issues)', () => {
    const qfx = 'OFXHEADER:100\nDATA:OFXSGML\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20240910</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>1</FITID><NAME>TEST</NAME></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>';
    const result = parseOfx(qfx);
    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(1);
  });

  it('handles BOM-prefixed files', () => {
    const result = parseOfx('\uFEFF' + SAMPLE_OFX);
    expect(result.ok).toBe(true);
    expect(result.transactions).toHaveLength(2);
  });
});

describe('parseOfxDate', () => {
  it('parses full OFX dates with timezone suffix', () => {
    const tzSuffixed = '20240910120000.000[' + '-5:EST]';
    expect(parseOfxDate(tzSuffixed)).toBe('2024-09-10');
  });

  it('parses date-only OFX dates', () => {
    expect(parseOfxDate('20240910')).toBe('2024-09-10');
  });

  it('rejects invalid dates', () => {
    expect(parseOfxDate('20241340')).toBeNull();
    expect(parseOfxDate('')).toBeNull();
    expect(parseOfxDate(null)).toBeNull();
  });
});

describe('parseOfxAmount', () => {
  it('parses amounts to cents', () => {
    expect(parseOfxAmount('-45.67')).toBe(-4567);
    expect(parseOfxAmount('2320.5')).toBe(232050);
    expect(parseOfxAmount('10')).toBe(1000);
  });

  it('handles invalid', () => {
    expect(parseOfxAmount('abc')).toBeNull();
    expect(parseOfxAmount('')).toBeNull();
  });
});

describe('looksLikeOfx', () => {
  it('detects OFX content', () => {
    expect(looksLikeOfx(SAMPLE_OFX)).toBe(true);
    expect(looksLikeOfx('Date,Amount\n2024-01-01,1.00')).toBe(false);
  });
});

describe('normalizeOfxTransactions', () => {
  it('maps to internal transactions', () => {
    const result = parseOfx(SAMPLE_OFX);
    const txns = normalizeOfxTransactions(result.transactions, 'acc1');
    expect(txns).toHaveLength(2);
    expect(txns[0].accountId).toBe('acc1');
    expect(txns[0].externalId).toBe('20240910001');
    expect(txns[0].amount).toBe(-4567);
    expect(txns[0].type).toBe('expense');
    expect(txns[1].type).toBe('income');
  });
});