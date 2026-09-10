import { describe, expect, it } from 'vitest';
import type { Account, Budget, BudgetItem, Transaction, TransactionSplit } from './types';
import {
  netWorthFromAccounts,
  cashFlow,
  budgetSummary,
  spendingByCategory,
  detectTransferPairs,
  detectRecurring,
  portfolioSummary,
  payoffSchedule,
  netWorthHistory,
  upcomingRecurring,
  integrityCheck,
} from './calculations';
import { newId } from '../lib/id';

function account(partial: Partial<Account>): Account {
  return {
    id: newId(),
    name: 'A',
    institution: '',
    type: 'checking',
    lastFour: '',
    balance: 0,
    startingBalance: 0,
    currency: 'USD',
    notes: '',
    active: true,
    includeInNetWorth: true,
    includeInBudget: true,
    includeInReports: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...partial,
  };
}

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: newId(),
    accountId: 'acc1',
    date: '2024-09-10',
    amount: -1000,
    merchant: 'Test',
    originalDescription: 'Test',
    categoryId: null,
    tagIds: [],
    notes: '',
    type: 'expense',
    cleared: true,
    pending: false,
    reviewed: true,
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

describe('net worth', () => {
  it('computes assets minus liabilities', () => {
    const accounts = [
      account({ balance: 500000 }),
      account({ balance: 250000 }),
      account({ balance: -300000, type: 'credit-card' }),
    ];
    expect(netWorthFromAccounts(accounts)).toEqual({ assets: 750000, liabilities: 300000, netWorth: 450000 });
  });

  it('respects includeInNetWorth=false', () => {
    const accounts = [account({ balance: 500000 }), account({ balance: 900000, includeInNetWorth: false })];
    expect(netWorthFromAccounts(accounts).netWorth).toBe(500000);
  });
});

describe('cash flow', () => {
  it('sums income and expenses', () => {
    const txs = [
      txn({ amount: 232050, type: 'income' }),
      txn({ amount: -185000 }),
      txn({ amount: -8900 }),
      txn({ amount: 15000, type: 'income' }),
    ];
    expect(cashFlow(txs)).toEqual({ income: 247050, expenses: 193900, net: 53150 });
  });

  it('excludes transfers by default', () => {
    const txs = [txn({ amount: -100000, type: 'transfer' }), txn({ amount: -5000 })];
    expect(cashFlow(txs).expenses).toBe(5000);
    expect(cashFlow(txs, { excludeTransfers: false }).expenses).toBe(105000);
  });

  it('handles refunds correctly', () => {
    const txs = [txn({ amount: -5000 }), txn({ amount: 2999, type: 'income', categoryId: 'refund' })];
    expect(cashFlow(txs).net).toBe(-2001);
  });
});

describe('budget summary', () => {
  const budget: Budget = { id: 'b1', month: '2024-09', mode: 'category', flexAmount: null, createdAt: '', updatedAt: '' };
  const items: BudgetItem[] = [
    { id: 'bi1', budgetId: 'b1', categoryId: 'c1', amount: 100000, rollover: true, createdAt: '', updatedAt: '' },
    { id: 'bi2', budgetId: 'b1', categoryId: 'c2', amount: 50000, rollover: false, createdAt: '', updatedAt: '' },
  ];
  const spending = new Map([['c1', 60000], ['c3', 10000]]);

  it('computes budgeted/spent/remaining', () => {
    const s = budgetSummary(budget, items, spending);
    expect(s.totalBudgeted).toBe(150000);
    expect(s.totalSpent).toBe(60000);
    expect(s.totalRemaining).toBe(90000);
    expect(s.nonBudgetedSpending).toBe(10000);
  });

  it('computes per-category percent used', () => {
    const s = budgetSummary(budget, items, spending);
    const c1 = s.categories.find((c) => c.categoryId === 'c1')!;
    expect(c1.percentUsed).toBe(60);
    expect(c1.remaining).toBe(40000);
  });

  it('flags over-budget', () => {
    const s = budgetSummary(budget, items, new Map([['c1', 120000]]));
    expect(s.categories[0].remaining).toBe(-20000);
  });
});

describe('spending by category', () => {
  it('aggregates expenses and handles splits', () => {
    const parent = txn({ id: 'p1', amount: -50000, categoryId: 'c-mixed' });
    const splits: TransactionSplit[] = [
      { id: 's1', transactionId: 'p1', categoryId: 'c-groceries', amount: -35000, merchant: '', notes: '', tagIds: [], createdAt: '', updatedAt: '' },
      { id: 's2', transactionId: 'p1', categoryId: 'c-household', amount: -15000, merchant: '', notes: '', tagIds: [], createdAt: '', updatedAt: '' },
    ];
    const txs = [parent, txn({ amount: -10000, categoryId: 'c-other' })];
    const map = spendingByCategory(txs, splits);
    expect(map.get('c-groceries')).toBe(35000);
    expect(map.get('c-household')).toBe(15000);
    expect(map.get('c-other')).toBe(10000);
    expect(map.has('c-mixed')).toBe(false); // parent itself not double counted
  });

  it('ignores transfers and income', () => {
    const txs = [
      txn({ amount: -1000, categoryId: 'c1', type: 'transfer' }),
      txn({ amount: 5000, categoryId: 'c1', type: 'income' }),
      txn({ amount: -2000, categoryId: 'c1' }),
    ];
    expect(spendingByCategory(txs, []).get('c1')).toBe(2000);
  });
});

describe('transfer detection', () => {
  it('pairs opposite transactions on the same date', () => {
    const acc1 = account({ id: 'a1' });
    const acc2 = account({ id: 'a2' });
    const txs = [
      txn({ id: 'neg', accountId: 'a1', amount: -500000, date: '2024-09-10' }),
      txn({ id: 'pos', accountId: 'a2', amount: 500000, date: '2024-09-10' }),
    ];
    const pairs = detectTransferPairs(txs, [acc1, acc2]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].from.id).toBe('neg');
    expect(pairs[0].to.id).toBe('pos');
    expect(pairs[0].confidence).toBe('high');
  });

  it('does not pair different amounts or same account', () => {
    const acc1 = account({ id: 'a1' });
    const txs = [
      txn({ accountId: 'a1', amount: -500000 }),
      txn({ accountId: 'a1', amount: 500000 }),
      txn({ accountId: 'a2', amount: 499999 }),
    ];
    expect(detectTransferPairs(txs, [acc1])).toHaveLength(0);
  });

  it('ignores already-linked transactions', () => {
    const acc1 = account({ id: 'a1' });
    const acc2 = account({ id: 'a2' });
    const txs = [
      txn({ accountId: 'a1', amount: -500000, transferId: 'linked' }),
      txn({ accountId: 'a2', amount: 500000 }),
    ];
    expect(detectTransferPairs(txs, [acc1, acc2])).toHaveLength(0);
  });
});

describe('recurring detection', () => {
  it('finds monthly patterns', () => {
    const txs = [
      txn({ merchant: 'Netflix', amount: -1549, date: '2024-07-02' }),
      txn({ merchant: 'Netflix', amount: -1549, date: '2024-08-02' }),
      txn({ merchant: 'Netflix', amount: -1549, date: '2024-09-02' }),
      txn({ merchant: 'Netflix', amount: -1549, date: '2024-10-02' }),
    ];
    const found = detectRecurring(txs, { today: '2024-11-01' });
    expect(found.length).toBeGreaterThan(0);
    const netflix = found.find((c) => c.merchant === 'Netflix');
    expect(netflix?.interval).toBe('monthly');
    expect(netflix?.dayOfMonth).toBe(2);
  });

  it('ignores one-off merchants', () => {
    const txs = [
      txn({ merchant: 'Random Store', amount: -10000, date: '2024-07-02' }),
      txn({ merchant: 'Random Store', amount: -15000, date: '2024-09-11' }),
    ];
    expect(detectRecurring(txs, { today: '2024-11-01' })).toHaveLength(0);
  });

  it('detects biweekly paychecks', () => {
    const txs = [
      txn({ merchant: 'Payroll', amount: 232050, date: '2024-01-05' }),
      txn({ merchant: 'Payroll', amount: 232050, date: '2024-01-19' }),
      txn({ merchant: 'Payroll', amount: 232050, date: '2024-02-02' }),
      txn({ merchant: 'Payroll', amount: 232050, date: '2024-02-16' }),
      txn({ merchant: 'Payroll', amount: 232050, date: '2024-03-01' }),
    ];
    const found = detectRecurring(txs, { today: '2024-06-01' });
    expect(found.some((c) => c.merchant === 'Payroll' && c.interval === 'biweekly')).toBe(true);
  });
});

describe('portfolio summary', () => {
  it('computes market value and gain/loss', () => {
    const sec = { id: 's1', symbol: 'VTI', name: 'VTI', type: 'etf' as const, assetClass: 'US Equities', currency: 'USD', createdAt: '', updatedAt: '' };
    const acc = account({ id: 'a1', name: 'Brokerage' });
    const holdings = [
      { id: 'h1', accountId: 'a1', securityId: 's1', shares: 10, costBasis: 200000, currentPrice: 25000, createdAt: '', updatedAt: '' },
    ];
    const p = portfolioSummary(holdings, [sec], [acc]);
    expect(p.totalValue).toBe(250000);
    expect(p.totalCostBasis).toBe(200000);
    expect(p.totalGainLoss).toBe(50000);
    expect(p.totalGainLossPct).toBe(25);
  });

  it('allocates by security type', () => {
    const sec = { id: 's1', symbol: 'VTI', name: 'VTI', type: 'etf' as const, assetClass: 'US', currency: 'USD', createdAt: '', updatedAt: '' };
    const holdings = [{ id: 'h1', accountId: 'a1', securityId: 's1', shares: 1, costBasis: 0, currentPrice: 10000, createdAt: '', updatedAt: '' }];
    const p = portfolioSummary(holdings, [sec], [account({ id: 'a1' })]);
    expect(p.bySecurityType.get('etf')).toBe(10000);
  });
});

describe('payoff schedule', () => {
  it('amortizes a loan to zero', () => {
    const rows = payoffSchedule(-10000000, 6.0, 200000, '2024-01-15');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[rows.length - 1].remainingBalance).toBe(0);
    expect(rows[0].interestPaid).toBeGreaterThan(0);
  });

  it('handles zero balance', () => {
    expect(payoffSchedule(0, 6, 1000, '2024-01-01')).toEqual([]);
  });

  it('handles zero payment', () => {
    expect(payoffSchedule(-100000, 6, 0, '2024-01-01')).toEqual([]);
  });
});

describe('net worth history', () => {
  it('builds a monthly series', () => {
    const acc = account({ id: 'a1', startingBalance: 100000 });
    const txs = [txn({ accountId: 'a1', amount: 50000, date: '2024-06-15' })];
    const history = netWorthHistory([acc], txs, 3);
    expect(history).toHaveLength(4);
    const last = history[history.length - 1];
    expect(last.netWorth).toBe(150000);
  });
});

describe('upcoming recurring', () => {
  it('projects occurrences', () => {
    const rec = [{
      id: 'r1', merchant: 'Netflix', amount: -1549, categoryId: null, accountId: null,
      interval: 'monthly' as const, dayOfMonth: 15, startDate: '2024-01-15', endDate: null,
      lastOccurrence: null, nextOccurrence: null, type: 'expense' as const, autoCreated: false,
      active: true, createdAt: '', updatedAt: '',
    }];
    const upcoming = upcomingRecurring(rec, 2);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });
});

describe('integrity check', () => {
  it('flags broken references', () => {
    const data = {
      accounts: [account({ id: 'a1' })],
      transactions: [txn({ id: 't1', accountId: 'missing-account' })],
      splits: [], transfers: [], categories: [], groups: [], goals: [], holdings: [], securities: [],
      recurring: [], budgets: [], budgetItems: [],
    };
    const issues = integrityCheck(data);
    expect(issues.some((i) => i.code === 'BAD_ACCOUNT')).toBe(true);
  });

  it('flags duplicate transaction ids', () => {
    const t = txn({ id: 't1' });
    const data = {
      accounts: [account({ id: 'a1' })],
      transactions: [t, { ...t }],
      splits: [], transfers: [], categories: [], groups: [], goals: [], holdings: [], securities: [],
      recurring: [], budgets: [], budgetItems: [],
    };
    const issues = integrityCheck(data);
    expect(issues.some((i) => i.code === 'DUP_TXN_ID')).toBe(true);
  });
});