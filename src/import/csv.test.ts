import { describe, expect, it } from 'vitest';
import { parseCsv, detectDelimiter, headerFingerprint, splitCsvLine } from './csv';
import { normalizeCsvRows, type MappedField } from './normalize';

describe('parseCsv', () => {
  it('parses a simple CSV with header', () => {
    const result = parseCsv('Date,Description,Amount\n2024-09-01,Test,10.00\n2024-09-02,Other,-5.00');
    expect(result.header).toEqual(['Date', 'Description', 'Amount']);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual(['2024-09-01', 'Test', '10.00']);
  });

  it('handles quoted fields with commas and newlines', () => {
    const csv = 'A,B\n"hello, world","line1\nline2"\n"x","y"';
    const result = parseCsv(csv);
    expect(result.rows[0]).toEqual(['hello, world', 'line1\nline2']);
  });

  it('handles escaped quotes', () => {
    const csv = 'A,B\n"say ""hi""",2';
    const result = parseCsv(csv);
    expect(result.rows[0][0]).toBe('say "hi"');
  });

  it('detects tab delimiter (TSV)', () => {
    const result = parseCsv('Date\tDesc\tAmount\n2024-01-01\tX\t1.00');
    expect(result.delimiter).toBe('\t');
    expect(result.rows[0]).toEqual(['2024-01-01', 'X', '1.00']);
  });

  it('detects semicolon delimiter', () => {
    const result = parseCsv('Date;Desc;Amount\n2024-01-01;X;1,00');
    expect(result.delimiter).toBe(';');
  });

  it('strips UTF-8 BOM', () => {
    const result = parseCsv('\uFEFFDate,Amount\n2024-01-01,1.00');
    expect(result.header?.[0]).toBe('Date');
  });

  it('detects delimiter by frequency', () => {
    expect(detectDelimiter('a,b,c\n1,2,3\n4,5,6')).toBe(',');
  });

  it('handles no header', () => {
    const result = parseCsv('2024-01-01,X,1.00', { header: false });
    expect(result.header).toBeNull();
    expect(result.rows).toHaveLength(1);
  });
});

describe('splitCsvLine', () => {
  it('splits with quotes', () => {
    expect(splitCsvLine('a,"b,c",d', ',')).toEqual(['a', 'b,c', 'd']);
  });
});

describe('headerFingerprint', () => {
  it('is stable and case-insensitive', () => {
    expect(headerFingerprint(['Date', 'Amount'])).toBe(headerFingerprint(['date', 'amount']));
  });
});

describe('normalizeCsvRows', () => {
  const header = ['Date', 'Description', 'Amount', 'Debit', 'Credit'];
  const columnMap: Record<string, MappedField> = { Date: 'date', Description: 'description', Amount: 'amount', Debit: 'debit', Credit: 'credit' };

  it('normalizes amount columns', () => {
    const rows = [
      ['2024-09-01', 'Store', '-12.34', '', ''],
      ['2024-09-02', 'Payroll', '2000.00', '', ''],
      ['2024-09-03', 'ATM', '', '50.00', ''],
    ];
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap, header, rows });
    expect(out[0].transaction.amount).toBe(-1234);
    expect(out[1].transaction.amount).toBe(200000);
    expect(out[2].transaction.amount).toBe(-5000);
  });

  it('handles currency symbols in amounts', () => {
    const rows = [['2024-09-01', 'Store', '-$1,234.56', '', '']];
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap, header, rows });
    expect(out[0].transaction.amount).toBe(-123456);
  });

  it('reports unparseable rows instead of dropping', () => {
    const rows = [['not-a-date', 'Store', '12.34', '', '']];
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap, header, rows });
    expect(out[0].error).toBeDefined();
  });

  it('sets direction by sign and type', () => {
    const rows = [['2024-09-01', 'Store', '-10.00', '', ''], ['2024-09-02', 'Interest', '5.00', '', '']];
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap, header, rows });
    expect(out[0].transaction.type).toBe('expense');
    expect(out[1].transaction.type).toBe('income');
  });

  it('maps category names via lookup', () => {
    const rows = [['2024-09-01', 'Whole Foods', '10.00', '', '', 'Groceries']];
    const headerWithCat = ['Date', 'Description', 'Amount', 'Debit', 'Credit', 'Category'];
    const map: Record<string, MappedField> = { Date: 'date', Description: 'description', Amount: 'amount', Category: 'category' };
    const lookup = (name: string) => (name === 'Groceries' ? 'cat-1' : null);
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap: map, header: headerWithCat, rows, categoryLookup: lookup });
    expect(out[0].transaction.categoryId).toBe('cat-1');
  });

  it('supports external-id columns', () => {
    const rows = [['2024-09-01', 'Store', '10.00', 'FITID-123']];
    const map: Record<string, MappedField> = { Date: 'date', Description: 'description', Amount: 'amount', ID: 'external-id' };
    const headerWithId = ['Date', 'Description', 'Amount', 'ID'];
    const out = normalizeCsvRows({ accountId: 'acc1', columnMap: map, header: headerWithId, rows });
    expect(out[0].transaction.externalId).toBe('FITID-123');
  });
});