import { beforeEach, describe, expect, it } from 'vitest';
import { IndexedDBRepository } from './indexeddb-repository';
import { db } from './db';
import { newId } from '../lib/id';
import type { Account, Transaction } from '../domain/types';
import { buildDefaultCategorySeed } from '../domain/defaults';
import { buildSampleData } from './sample-data';

let repo: IndexedDBRepository;

beforeEach(async () => {
  await db.delete();
  await db.open();
  repo = new IndexedDBRepository();
});

function account(partial: Partial<Account>): Account {
  const now = new Date().toISOString();
  return {
    id: newId(), name: 'Checking', institution: '', type: 'checking', lastFour: '',
    balance: 0, startingBalance: 0, currency: 'USD', notes: '', active: true,
    includeInNetWorth: true, includeInBudget: true, includeInReports: true,
    createdAt: now, updatedAt: now, ...partial,
  };
}

function txn(partial: Partial<Transaction>): Transaction {
  const now = new Date().toISOString();
  return {
    id: newId(), accountId: 'acc1', date: '2024-09-10', amount: -1000, merchant: 'Test',
    originalDescription: 'Test', categoryId: null, tagIds: [], notes: '', type: 'expense',
    cleared: true, pending: false, reviewed: false, transferId: null, recurringId: null,
    externalId: null, splitParentId: null, importSessionId: null, createdAt: now, updatedAt: now,
    ...partial,
  };
}

describe('IndexedDBRepository', () => {
  it('saves and queries accounts', async () => {
    const a = account({ name: 'Savings' });
    await repo.saveAccount(a);
    const all = await repo.getAccounts();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('Savings');
  });

  it('saves transactions and recomputes balances', async () => {
    const a = account({ id: 'acc1', startingBalance: 100000 });
    await repo.saveAccount(a);
    await repo.saveTransactions([
      txn({ accountId: 'acc1', amount: -25000 }),
      txn({ accountId: 'acc1', amount: 50000, type: 'income' }),
    ]);
    const updated = await repo.getAccount('acc1');
    expect(updated?.balance).toBe(125000); // 100000 - 25000 + 50000
  });

  it('paginates transaction queries', async () => {
    await repo.saveAccount(account({ id: 'acc1' }));
    const txns = Array.from({ length: 25 }, (_, i) => txn({ accountId: 'acc1', date: `2024-09-${String((i % 28) + 1).padStart(2, '0')}`, amount: -100 - i }));
    await repo.saveTransactions(txns);
    const page1 = await repo.queryTransactions({ offset: 0, limit: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(25);
    const page3 = await repo.queryTransactions({ offset: 20, limit: 10 });
    expect(page3.items).toHaveLength(5);
  });

  it('filters by account and date range', async () => {
    await repo.saveAccount(account({ id: 'acc1' }));
    await repo.saveAccount(account({ id: 'acc2' }));
    await repo.saveTransactions([
      txn({ accountId: 'acc1', date: '2024-09-01' }),
      txn({ accountId: 'acc2', date: '2024-09-01' }),
      txn({ accountId: 'acc1', date: '2024-08-01' }),
    ]);
    const res = await repo.queryTransactions({ accountId: 'acc1', dateFrom: '2024-09-01', dateTo: '2024-09-30' });
    expect(res.total).toBe(1);
  });

  it('searches merchant text', async () => {
    await repo.saveAccount(account({ id: 'acc1' }));
    await repo.saveTransactions([txn({ merchant: 'Whole Foods Market' }), txn({ merchant: 'Shell Gas' })]);
    const res = await repo.queryTransactions({ search: 'whole foods' });
    expect(res.total).toBe(1);
  });

  it('searches by tag name (ISSUE-003)', async () => {
    await repo.saveAccount(account({ id: 'acc1' }));
    await repo.saveTag({ id: 'tag-travel', name: 'Travel', createdAt: '', updatedAt: '' });
    await repo.saveTag({ id: 'tag-work', name: 'Work', createdAt: '', updatedAt: '' });
    await repo.saveTransactions([
      txn({ merchant: 'Delta Airlines', tagIds: ['tag-travel'] }),
      txn({ merchant: 'Uber', tagIds: ['tag-work'] }),
      txn({ merchant: 'Shell Gas' }),
    ]);
    const res = await repo.queryTransactions({ search: 'travel' });
    expect(res.total).toBe(1);
    expect(res.items[0].merchant).toBe('Delta Airlines');
    // Case-insensitive, and still matches merchant text in the same query.
    const res2 = await repo.queryTransactions({ search: 'WORK' });
    expect(res2.total).toBe(1);
    expect(res2.items[0].merchant).toBe('Uber');
    const res3 = await repo.queryTransactions({ search: 'gas' });
    expect(res3.total).toBe(1);
    expect(res3.items[0].merchant).toBe('Shell Gas');
  });

  it('searches by category name and account name (REQ-035)', async () => {
    await repo.saveAccount(account({ id: 'acc1', name: 'Travel Rewards Card' }));
    await repo.saveCategory({ id: 'cat-travel', groupId: 'g1', name: 'Vacation Fund', sortOrder: 1, archived: false, createdAt: '', updatedAt: '' });
    await repo.saveTransactions([
      txn({ accountId: 'acc1', merchant: 'Delta Airlines', categoryId: 'cat-travel' }),
      txn({ accountId: 'acc1', merchant: 'Shell Gas', categoryId: null }),
    ]);
    const byCategory = await repo.queryTransactions({ search: 'vacation' });
    expect(byCategory.total).toBe(1);
    expect(byCategory.items[0].merchant).toBe('Delta Airlines');
    const byAccount = await repo.queryTransactions({ search: 'rewards' });
    expect(byAccount.total).toBe(2);
  });

  it('deletes transactions and their splits', async () => {
    await repo.saveAccount(account({ id: 'acc1' }));
    const t = txn({ accountId: 'acc1' });
    await repo.saveTransaction(t);
    await repo.saveSplits([{ id: newId(), transactionId: t.id, categoryId: null, amount: -1000, merchant: '', notes: '', tagIds: [], createdAt: '', updatedAt: '' }]);
    await repo.deleteTransactions([t.id]);
    const splits = await repo.getSplitsForTransactions([t.id]);
    expect(splits).toHaveLength(0);
    const all = await repo.getAllTransactions();
    expect(all).toHaveLength(0);
  });

  it('round-trips settings', async () => {
    await repo.saveSettings({ theme: 'dark', currency: 'USD', dateFormat: 'YYYY-MM-DD', weekStart: 'sunday', firstName: '', householdName: '', lastFlexAmount: null, demoDataLoaded: false });
    const s = await repo.getSettings();
    expect(s?.theme).toBe('dark');
  });

  it('exports and re-imports all data (replace)', async () => {
    await repo.saveAccount(account({ id: 'acc1', name: 'One' }));
    await repo.saveTransactions([txn({ accountId: 'acc1', merchant: 'A' }), txn({ accountId: 'acc1', merchant: 'B' })]);
    const backup = await repo.exportAll();
    expect(backup.accounts).toHaveLength(1);
    expect(backup.transactions).toHaveLength(2);

    // Wipe and restore.
    await repo.clear();
    expect(await repo.getAllTransactions()).toHaveLength(0);
    await repo.importAll(backup, { replace: false });
    expect(await repo.getAccounts()).toHaveLength(1);
    expect(await repo.getAllTransactions()).toHaveLength(2);
  });

  it('merges without duplicating existing records', async () => {
    const a = account({ id: 'acc1', name: 'Original' });
    await repo.saveAccount(a);
    const backup = await repo.exportAll();
    backup.accounts.push(account({ id: 'acc2', name: 'New' }));
    await repo.importAll(backup, { replace: false });
    const accounts = await repo.getAccounts();
    expect(accounts).toHaveLength(2);
    const names = accounts.map((x) => x.name);
    expect(names).toContain('Original');
    expect(names).toContain('New');
  });

  it('seeds default categories on empty groups', async () => {
    const seed = buildDefaultCategorySeed();
    await repo.saveCategoryGroups(seed.groups);
    await repo.saveCategories(seed.categories);
    expect((await repo.getCategoryGroups()).length).toBeGreaterThan(0);
    expect((await repo.getCategories()).length).toBeGreaterThan(0);
  });

  it('loads sample data and computes balances', async () => {
    const demo = buildSampleData();
    await repo.importAll(demo, { replace: false });
    const stats = await repo.stats();
    expect(stats.transactionCount).toBeGreaterThan(200);
    expect(stats.accountCount).toBe(6);
    // Balances recomputed from transactions.
    const accounts = await repo.getAccounts();
    const checking = accounts.find((a) => a.name === 'Everyday Checking');
    expect(checking?.balance).not.toBe(0);
  });
});