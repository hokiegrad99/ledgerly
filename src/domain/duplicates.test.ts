import { describe, expect, it } from 'vitest';
import { findDuplicates, transactionHash } from './duplicates';
import type { Transaction } from './types';
import { newId } from '../lib/id';

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: newId(),
    accountId: 'acc1',
    date: '2024-09-10',
    amount: -4500,
    merchant: 'GROCERY STORE',
    originalDescription: 'GROCERY STORE',
    categoryId: null,
    tagIds: [],
    notes: '',
    type: 'expense',
    cleared: true,
    pending: false,
    reviewed: false,
    transferId: null,
    recurringId: null,
    externalId: null,
    splitParentId: null,
    importSessionId: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...partial,
  };
}

describe('transactionHash', () => {
  it('is stable for identical transactions', () => {
    const a = txn({});
    const b = txn({});
    expect(transactionHash(a)).toBe(transactionHash(b));
  });

  it('differs when amount changes', () => {
    expect(transactionHash(txn({ amount: -4500 }))).not.toBe(transactionHash(txn({ amount: -4501 })));
  });

  it('normalizes merchant case and whitespace', () => {
    expect(transactionHash(txn({ merchant: '  Grocery  Store ' }))).toBe(transactionHash(txn({ merchant: 'grocery store' })));
  });
});

describe('findDuplicates', () => {
  it('detects exact duplicates via hash', () => {
    const existing = [txn({ id: 'e1' })];
    const incoming = [txn({ id: 'n1' })];
    const result = findDuplicates(incoming, existing);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].reason).toBe('hash');
    expect(result.cleanCount).toBe(0);
  });

  it('detects duplicates via external id (FITID)', () => {
    const existing = [txn({ id: 'e1', externalId: 'FITID-1' })];
    const incoming = [txn({ id: 'n1', externalId: 'FITID-1', merchant: 'Different Name' })];
    const result = findDuplicates(incoming, existing);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0].reason).toBe('external-id');
  });

  it('does not match different accounts for external id', () => {
    const existing = [txn({ id: 'e1', externalId: 'FITID-1', accountId: 'acc1' })];
    const incoming = [txn({ id: 'n1', externalId: 'FITID-1', accountId: 'acc2' })];
    const result = findDuplicates(incoming, existing);
    expect(result.matches).toHaveLength(0);
  });

  it('finds fuzzy matches within the window', () => {
    const existing = [txn({ id: 'e1', date: '2024-09-10', amount: -4500, merchant: 'WALMART SUPERCENTER' })];
    const incoming = [txn({ id: 'n1', date: '2024-09-12', amount: -4500, merchant: 'Walmart Supercenter' })];
    const result = findDuplicates(incoming, existing, { fuzzyWindowDays: 5 });
    expect(result.matches.some((m) => m.reason === 'fuzzy')).toBe(true);
  });

  it('does not fuzzy-match far apart dates', () => {
    const existing = [txn({ id: 'e1', date: '2024-01-10', amount: -4500, merchant: 'WALMART' })];
    const incoming = [txn({ id: 'n1', date: '2024-09-10', amount: -4500, merchant: 'Walmart' })];
    const result = findDuplicates(incoming, existing, { fuzzyWindowDays: 5 });
    expect(result.matches).toHaveLength(0);
  });

  it('leaves unique transactions clean', () => {
    const existing = [txn({ id: 'e1', merchant: 'A', amount: -100 })];
    const incoming = [txn({ id: 'n1', merchant: 'B', amount: -200 })];
    const result = findDuplicates(incoming, existing);
    expect(result.cleanCount).toBe(1);
    expect(result.matches).toHaveLength(0);
  });

  it('handles repeated imports of the same statement', () => {
    const existing = [txn({ id: 'e1', externalId: 'F1' }), txn({ id: 'e2', externalId: 'F2' })];
    const incoming = [txn({ id: 'n1', externalId: 'F1' }), txn({ id: 'n2', externalId: 'F2' })];
    const result = findDuplicates(incoming, existing);
    expect(result.matches).toHaveLength(2);
  });
});