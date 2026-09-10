import { describe, it, expect } from 'vitest';
import {
  EXCLUDE_FROM_BUDGET_TAG_ID,
  EXCLUDE_FROM_REPORTS_TAG_ID,
  isExcludedFromBudget,
  isExcludedFromReports,
  budgetExcludedAccountIds,
  reportExcludedAccountIds,
} from './exclusions';
import type { Transaction } from './types';

const txn = (over: Partial<Transaction> = {}): Transaction =>
  ({ id: 't1', accountId: 'a1', tagIds: [], ...over }) as Transaction;

describe('isExcludedFromBudget', () => {
  it('keeps normal transactions', () => {
    expect(isExcludedFromBudget(txn())).toBe(false);
  });

  it('excludes by the budget system tag', () => {
    expect(isExcludedFromBudget(txn({ tagIds: [EXCLUDE_FROM_BUDGET_TAG_ID] }))).toBe(true);
  });

  it('excludes by the account toggle set', () => {
    expect(isExcludedFromBudget(txn(), new Set(['a1']))).toBe(true);
    expect(isExcludedFromBudget(txn(), new Set(['other']))).toBe(false);
  });

  it('does not cross-apply the reports tag', () => {
    expect(isExcludedFromBudget(txn({ tagIds: [EXCLUDE_FROM_REPORTS_TAG_ID] }))).toBe(false);
  });
});

describe('isExcludedFromReports', () => {
  it('keeps normal transactions', () => {
    expect(isExcludedFromReports(txn())).toBe(false);
  });

  it('excludes by the reports system tag', () => {
    expect(isExcludedFromReports(txn({ tagIds: [EXCLUDE_FROM_REPORTS_TAG_ID] }))).toBe(true);
  });

  it('excludes by the account toggle set', () => {
    expect(isExcludedFromReports(txn(), new Set(['a1']))).toBe(true);
    expect(isExcludedFromReports(txn(), new Set(['other']))).toBe(false);
  });

  it('does not cross-apply the budget tag', () => {
    expect(isExcludedFromReports(txn({ tagIds: [EXCLUDE_FROM_BUDGET_TAG_ID] }))).toBe(false);
  });
});

describe('excluded account id helpers', () => {
  it('collects accounts opted out of budgets and reports', () => {
    const accounts = [
      { id: 'a1', includeInBudget: true, includeInReports: true },
      { id: 'a2', includeInBudget: false, includeInReports: true },
      { id: 'a3', includeInBudget: true, includeInReports: false },
    ];
    expect([...budgetExcludedAccountIds(accounts)]).toEqual(['a2']);
    expect([...reportExcludedAccountIds(accounts)]).toEqual(['a3']);
  });
});
