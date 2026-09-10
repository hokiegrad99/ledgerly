/**
 * IndexedDBRepository — the local-first DataRepository implementation.
 *
 * Mode A (static/local) storage. The same interface will later have a
 * ServerRepository implementation backed by PostgreSQL.
 */
import type {
  Account,
  Budget,
  BudgetItem,
  Category,
  CategoryGroup,
  DashboardWidget,
  Goal,
  Holding,
  ImportMapping,
  ImportSession,
  InvestmentTransaction,
  Liability,
  RecurringTransaction,
  SavedReport,
  Security,
  Tag,
  Transaction,
  TransactionRule,
  TransactionSplit,
  TransferPair,
  UserSettings,
} from '../domain/types';
import { DEFAULT_SETTINGS, isLiabilityType } from '../domain/types';
import type { BackupData } from '../domain/backup';
import { systemTags } from '../domain/defaults';
import type { DataRepository, RepositoryStats, TransactionPage, TransactionQuery } from './repository';
import { db } from './db';

const SETTINGS_KEY = 'user-settings';

function normalize(t: Transaction): Transaction {
  return {
    ...t,
    tagIds: t.tagIds ?? [],
    merchant: t.merchant ?? '',
    originalDescription: t.originalDescription ?? '',
    notes: t.notes ?? '',
    categoryId: t.categoryId ?? null,
    transferId: t.transferId ?? null,
    recurringId: t.recurringId ?? null,
    externalId: t.externalId ?? null,
    splitParentId: t.splitParentId ?? null,
    importSessionId: t.importSessionId ?? null,
    cleared: t.cleared ?? true,
    pending: t.pending ?? false,
    reviewed: t.reviewed ?? false,
  };
}

export class IndexedDBRepository implements DataRepository {
  readonly name = 'indexeddb';

  // ------------------------------------------------------------- Accounts
  async getAccounts(): Promise<Account[]> {
    return db.accounts.toArray();
  }

  async getAccount(id: string): Promise<Account | undefined> {
    return db.accounts.get(id);
  }

  async saveAccount(account: Account): Promise<void> {
    await db.accounts.put(account);
  }

  async saveAccounts(accounts: Account[]): Promise<void> {
    await db.accounts.bulkPut(accounts);
  }

  async deleteAccount(id: string): Promise<void> {
    await db.transaction('rw', [db.accounts, db.transactions, db.splits, db.holdings, db.liabilities], async () => {
      await db.accounts.delete(id);
      const txs = await db.transactions.where('accountId').equals(id).toArray();
      const ids = txs.map((t) => t.id);
      await db.transactions.bulkDelete(ids);
      await this.deleteSplitsForTransactions(ids);
      await db.holdings.where('accountId').equals(id).delete();
      await db.liabilities.where('accountId').equals(id).delete();
    });
  }

  // ----------------------------------------------------------- Categories
  async getCategoryGroups(): Promise<CategoryGroup[]> {
    return db.categoryGroups.orderBy('sortOrder').toArray();
  }

  async saveCategoryGroup(g: CategoryGroup): Promise<void> {
    await db.categoryGroups.put(g);
  }

  async saveCategoryGroups(gs: CategoryGroup[]): Promise<void> {
    await db.categoryGroups.bulkPut(gs);
  }

  async deleteCategoryGroup(id: string): Promise<void> {
    await db.categoryGroups.delete(id);
  }

  async getCategories(): Promise<Category[]> {
    return db.categories.toArray();
  }

  async saveCategory(c: Category): Promise<void> {
    await db.categories.put(c);
  }

  async saveCategories(cats: Category[]): Promise<void> {
    await db.categories.bulkPut(cats);
  }

  async deleteCategory(id: string): Promise<void> {
    await db.categories.delete(id);
  }

  // ----------------------------------------------------------------- Tags
  async getTags(): Promise<Tag[]> {
    const all = await db.tags.toArray();
    return all.filter((t) => !t.name.startsWith('__'));
  }

  async getAllTags(): Promise<Tag[]> {
    return db.tags.toArray();
  }

  async saveTag(t: Tag): Promise<void> {
    await db.tags.put(t);
  }

  async deleteTag(id: string): Promise<void> {
    await db.transaction('rw', [db.tags, db.transactions], async () => {
      await db.tags.delete(id);
      const txs = await db.transactions.filter((t) => t.tagIds?.includes(id)).toArray();
      for (const t of txs) {
        await db.transactions.put({ ...t, tagIds: t.tagIds.filter((x) => x !== id) });
      }
    });
  }

  async ensureSystemTags(): Promise<void> {
    await db.tags.bulkPut(systemTags());
  }

  // --------------------------------------------------------- Transactions
  async queryTransactions(q: TransactionQuery = {}): Promise<TransactionPage> {
    // Narrow with indexes where possible, then filter in memory.
    const hasDate = q.dateFrom || q.dateTo;
    const hasAccount = !!q.accountId;
    let promise: Promise<Transaction[]>;
    if (hasDate && hasAccount) {
      promise = db.transactions.where('[accountId+date]').between(
        [q.accountId!, q.dateFrom ?? '0000-00-00'],
        [q.accountId!, q.dateTo ?? '9999-99-99'],
      ).toArray();
    } else if (hasDate) {
      promise = db.transactions.where('date').between(q.dateFrom ?? '0000-00-00', q.dateTo ?? '9999-99-99').toArray();
    } else if (hasAccount) {
      promise = db.transactions.where('accountId').equals(q.accountId!).toArray();
    } else {
      promise = db.transactions.toArray();
    }

    let rows = await promise;

    // Resolve tag names → ids once so free-text search can match tags too (ISSUE-003).
    let tagIdHits: Set<string> | null = null;
    if (q.search) {
      const s = q.search.toLowerCase();
      const hits = await db.tags.filter((tag) => tag.name.toLowerCase().includes(s)).toArray();
      if (hits.length > 0) tagIdHits = new Set(hits.map((h) => h.id));
    }

    rows = rows.filter((t) => {
      if (q.categoryId && t.categoryId !== q.categoryId) return false;
      if (q.categoryIds && q.categoryIds.length > 0 && !(t.categoryId && q.categoryIds.includes(t.categoryId))) return false;
      if (q.type && t.type !== q.type) return false;
      if (q.reviewed === true && !t.reviewed) return false;
      if (q.unreviewed === true && t.reviewed) return false;
      if (q.pending === true && !t.pending) return false;
      if (q.transferOnly === true && t.type !== 'transfer') return false;
      if (q.merchant && !(t.merchant || '').toLowerCase().includes(q.merchant.toLowerCase())) return false;
      if (q.tagId && !t.tagIds?.includes(q.tagId)) return false;
      if (q.search) {
        const s = q.search.toLowerCase();
        const hay = `${t.merchant} ${t.originalDescription} ${t.notes}`.toLowerCase();
        const tagHit = tagIdHits !== null && !!t.tagIds?.some((id) => tagIdHits.has(id));
        if (!hay.includes(s) && !tagHit) return false;
      }
      return true;
    });

    const total = rows.length;
    const sort = q.sort ?? 'date-desc';
    rows.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return a.date.localeCompare(b.date) || b.amount - a.amount;
        case 'amount-desc':
          return b.amount - a.amount;
        case 'amount-asc':
          return a.amount - b.amount;
        default:
          return b.date.localeCompare(a.date) || b.amount - a.amount;
      }
    });

    const offset = q.offset ?? 0;
    const limit = q.limit ?? 200;
    const items = rows.slice(offset, offset + limit);
    return { items, total };
  }

  async getAllTransactions(): Promise<Transaction[]> {
    return db.transactions.toArray();
  }

  async getTransaction(id: string): Promise<Transaction | undefined> {
    return db.transactions.get(id);
  }

  async saveTransaction(t: Transaction): Promise<void> {
    const norm = normalize(t);
    const affected = new Set([norm.accountId]);
    await db.transactions.put(norm);
    await this.recomputeBalancesForAccounts([...affected]);
  }

  async saveTransactions(txs: Transaction[]): Promise<void> {
    if (txs.length === 0) return;
    const norms = txs.map(normalize);
    const affected = new Set(norms.map((t) => t.accountId));
    await db.transactions.bulkPut(norms);
    await this.recomputeBalancesForAccounts([...affected]);
  }

  async deleteTransactions(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const affected = new Set<string>();
    const txs = await db.transactions.bulkGet(ids);
    for (const t of txs) if (t) affected.add(t.accountId);
    await db.transactions.bulkDelete(ids);
    await this.deleteSplitsForTransactions(ids);
    await this.recomputeBalancesForAccounts([...affected]);
  }

  async transactionsInRange(from?: string, to?: string): Promise<Transaction[]> {
    if (from || to) {
      return db.transactions.where('date').between(from ?? '0000-00-00', to ?? '9999-99-99').toArray();
    }
    return db.transactions.toArray();
  }

  async recomputeBalances(): Promise<void> {
    const [accounts, txs] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
    const sums = new Map<string, number>();
    for (const t of txs) sums.set(t.accountId, (sums.get(t.accountId) ?? 0) + t.amount);
    const updates = accounts.map((a) => {
      const isLiability = isLiabilityType(a.type);
      let balance = a.startingBalance + (sums.get(a.id) ?? 0);
      // Credit card / liability balances are stored as negative.
      if (isLiability && balance > 0) balance = -balance;
      return { ...a, balance };
    });
    await db.accounts.bulkPut(updates);
  }

  async recomputeBalancesForAccounts(accountIds: string[]): Promise<void> {
    if (accountIds.length === 0) return;
    const [accounts, txs] = await Promise.all([db.accounts.toArray(), db.transactions.toArray()]);
    const sums = new Map<string, number>();
    for (const t of txs) sums.set(t.accountId, (sums.get(t.accountId) ?? 0) + t.amount);
    const updates = accounts
      .filter((a) => accountIds.includes(a.id))
      .map((a) => {
        const isLiability = isLiabilityType(a.type);
        let balance = a.startingBalance + (sums.get(a.id) ?? 0);
        if (isLiability && balance > 0) balance = -balance;
        return { ...a, balance };
      });
    await db.accounts.bulkPut(updates);
  }

  // ---------------------------------------------------------------- Splits
  async getSplitsForTransactions(transactionIds: string[]): Promise<TransactionSplit[]> {
    if (transactionIds.length === 0) return [];
    return db.splits.where('transactionId').anyOf(transactionIds).toArray();
  }

  async saveSplits(splits: TransactionSplit[]): Promise<void> {
    if (splits.length > 0) await db.splits.bulkPut(splits);
  }

  async deleteSplitsForTransactions(transactionIds: string[]): Promise<void> {
    if (transactionIds.length === 0) return;
    const existing = await db.splits.where('transactionId').anyOf(transactionIds).toArray();
    if (existing.length > 0) await db.splits.bulkDelete(existing.map((s) => s.id));
  }

  // -------------------------------------------------------------- Transfers
  async getTransfers(): Promise<TransferPair[]> {
    return db.transfers.toArray();
  }

  async saveTransfer(t: TransferPair): Promise<void> {
    await db.transfers.put(t);
  }

  async deleteTransfer(id: string): Promise<void> {
    await db.transfers.delete(id);
  }

  // ----------------------------------------------------------------- Rules
  async getRules(): Promise<TransactionRule[]> {
    return db.rules.orderBy('priority').toArray();
  }

  async saveRule(r: TransactionRule): Promise<void> {
    await db.rules.put(r);
  }

  async saveRules(rs: TransactionRule[]): Promise<void> {
    await db.rules.bulkPut(rs);
  }

  async deleteRule(id: string): Promise<void> {
    await db.rules.delete(id);
  }

  // ---------------------------------------------------------------- Budgets
  async getBudget(month: string): Promise<Budget | undefined> {
    return db.budgets.where('month').equals(month).first();
  }

  async getBudgets(): Promise<Budget[]> {
    return db.budgets.toArray();
  }

  async saveBudget(b: Budget): Promise<void> {
    await db.budgets.put(b);
  }

  async getBudgetItems(budgetId: string): Promise<BudgetItem[]> {
    return db.budgetItems.where('budgetId').equals(budgetId).toArray();
  }

  async getBudgetItemsForMonth(month: string): Promise<BudgetItem[]> {
    const budget = await this.getBudget(month);
    if (!budget) return [];
    return this.getBudgetItems(budget.id);
  }

  async saveBudgetItems(items: BudgetItem[]): Promise<void> {
    if (items.length > 0) await db.budgetItems.bulkPut(items);
  }

  async deleteBudgetItems(budgetId: string): Promise<void> {
    await db.budgetItems.where('budgetId').equals(budgetId).delete();
  }

  // ------------------------------------------------------------------ Goals
  async getGoals(): Promise<Goal[]> {
    return db.goals.toArray();
  }

  async saveGoal(g: Goal): Promise<void> {
    await db.goals.put(g);
  }

  async deleteGoal(id: string): Promise<void> {
    await db.goals.delete(id);
  }

  // -------------------------------------------------------------- Recurring
  async getRecurring(): Promise<RecurringTransaction[]> {
    return db.recurring.toArray();
  }

  async saveRecurring(r: RecurringTransaction): Promise<void> {
    await db.recurring.put(r);
  }

  async saveRecurringMany(rs: RecurringTransaction[]): Promise<void> {
    await db.recurring.bulkPut(rs);
  }

  async deleteRecurring(id: string): Promise<void> {
    await db.recurring.delete(id);
  }

  // ------------------------------------------------------------ Investments
  async getSecurities(): Promise<Security[]> {
    return db.securities.toArray();
  }

  async saveSecurity(s: Security): Promise<void> {
    await db.securities.put(s);
  }

  async deleteSecurity(id: string): Promise<void> {
    await db.securities.delete(id);
  }

  async getHoldings(): Promise<Holding[]> {
    return db.holdings.toArray();
  }

  async saveHolding(h: Holding): Promise<void> {
    await db.holdings.put(h);
  }

  async saveHoldings(hs: Holding[]): Promise<void> {
    await db.holdings.bulkPut(hs);
  }

  async deleteHolding(id: string): Promise<void> {
    await db.holdings.delete(id);
  }

  async getInvestmentTransactions(): Promise<InvestmentTransaction[]> {
    return db.investmentTransactions.toArray();
  }

  async saveInvestmentTransaction(t: InvestmentTransaction): Promise<void> {
    await db.investmentTransactions.put(t);
  }

  async deleteInvestmentTransaction(id: string): Promise<void> {
    await db.investmentTransactions.delete(id);
  }

  // ------------------------------------------------------------ Liabilities
  async getLiabilities(): Promise<Liability[]> {
    return db.liabilities.toArray();
  }

  async saveLiability(l: Liability): Promise<void> {
    await db.liabilities.put(l);
  }

  async deleteLiability(id: string): Promise<void> {
    await db.liabilities.delete(id);
  }

  // -------------------------------------------------------------- Dashboard
  async getDashboardWidgets(): Promise<DashboardWidget[]> {
    return db.dashboard.orderBy('sortOrder').toArray();
  }

  async saveDashboardWidgets(widgets: DashboardWidget[]): Promise<void> {
    await db.dashboard.bulkPut(widgets);
  }

  // ---------------------------------------------------------- Saved reports
  async getSavedReports(): Promise<SavedReport[]> {
    return db.savedReports.toArray();
  }

  async saveSavedReport(r: SavedReport): Promise<void> {
    await db.savedReports.put(r);
  }

  async deleteSavedReport(id: string): Promise<void> {
    await db.savedReports.delete(id);
  }

  // ---------------------------------------------------------------- Imports
  async getImportMappings(): Promise<ImportMapping[]> {
    return db.importMappings.toArray();
  }

  async saveImportMapping(m: ImportMapping): Promise<void> {
    await db.importMappings.put(m);
  }

  async deleteImportMapping(id: string): Promise<void> {
    await db.importMappings.delete(id);
  }

  async saveImportSession(s: ImportSession): Promise<void> {
    await db.importSessions.put(s);
  }

  async getImportSessions(): Promise<ImportSession[]> {
    return db.importSessions.orderBy('createdAt').reverse().toArray();
  }

  // ---------------------------------------------------------------- Settings
  async getSettings(): Promise<UserSettings | null> {
    const row = await db.settings.get(SETTINGS_KEY);
    return (row?.value as UserSettings | undefined) ?? null;
  }

  async saveSettings(s: UserSettings): Promise<void> {
    await db.settings.put({ key: SETTINGS_KEY, value: s });
  }

  async getSettingsOrDefault(): Promise<UserSettings> {
    const s = await this.getSettings();
    return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
  }

  // ------------------------------------------------------------------ Bulk
  async exportAll(): Promise<BackupData> {
    const [
      accounts, categoryGroups, categories, tags, transactions, splits, transfers,
      rules, budgets, budgetItems, goals, recurring, securities, holdings,
      investmentTransactions, liabilities, dashboard, importMappings,
    ] = await Promise.all([
      db.accounts.toArray(),
      db.categoryGroups.toArray(),
      db.categories.toArray(),
      db.tags.toArray(),
      db.transactions.toArray(),
      db.splits.toArray(),
      db.transfers.toArray(),
      db.rules.toArray(),
      db.budgets.toArray(),
      db.budgetItems.toArray(),
      db.goals.toArray(),
      db.recurring.toArray(),
      db.securities.toArray(),
      db.holdings.toArray(),
      db.investmentTransactions.toArray(),
      db.liabilities.toArray(),
      db.dashboard.toArray(),
      db.importMappings.toArray(),
    ]);
    const settings = await this.getSettings();
    return {
      accounts, categoryGroups, categories, tags, transactions, splits, transfers,
      rules, budgets, budgetItems, goals, recurring, securities, holdings,
      investmentTransactions, liabilities, dashboard, settings, importMappings,
    };
  }

  async importAll(data: BackupData, opts: { replace: boolean }): Promise<void> {
    if (opts.replace) {
      await this.clear();
    }
    await db.transaction('rw', db.tables, async () => {
      const putMissing = async <T extends { id: string }>(table: { bulkGet(ids: string[]): Promise<(T | undefined)[]>; bulkPut(items: T[]): Promise<unknown> }, items: T[]) => {
        if (items.length === 0) return;
        const existing = await table.bulkGet(items.map((i) => i.id));
        const missing = items.filter((_, i) => !existing[i]);
        if (missing.length > 0) await table.bulkPut(missing);
      };
      // Guard against putting records whose ids already exist (merge mode).
      const typed = db as unknown as Record<string, { bulkGet(ids: string[]): Promise<unknown[]>; bulkPut(items: unknown[]): Promise<unknown> }>;
      const putMissingAny = async (tableName: string, items: { id: string }[]) => putMissing(typed[tableName] as never, items);

      await putMissingAny('accounts', data.accounts);
      await putMissingAny('categoryGroups', data.categoryGroups);
      await putMissingAny('categories', data.categories);
      await putMissingAny('tags', data.tags);
      await putMissingAny('transactions', data.transactions.map(normalize));
      await putMissingAny('splits', data.splits);
      await putMissingAny('transfers', data.transfers);
      await putMissingAny('rules', data.rules);
      await putMissingAny('budgets', data.budgets);
      await putMissingAny('budgetItems', data.budgetItems);
      await putMissingAny('goals', data.goals);
      await putMissingAny('recurring', data.recurring);
      await putMissingAny('securities', data.securities);
      await putMissingAny('holdings', data.holdings);
      await putMissingAny('investmentTransactions', data.investmentTransactions);
      await putMissingAny('liabilities', data.liabilities);
      await putMissingAny('dashboard', data.dashboard);
      await putMissingAny('importMappings', data.importMappings);
      if (data.settings) {
        await db.settings.put({ key: SETTINGS_KEY, value: data.settings });
      }
    });
    await this.recomputeBalances();
    await this.ensureSystemTags();
  }

  async clear(): Promise<void> {
    await db.transaction('rw', db.tables, async () => {
      await Promise.all(db.tables.map((t) => t.clear()));
    });
  }

  async stats(): Promise<RepositoryStats> {
    const [transactionCount, accountCount, categoryCount] = await Promise.all([
      db.transactions.count(),
      db.accounts.count(),
      db.categories.count(),
    ]);
    let databaseSizeBytes: number | null = null;
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.usage) databaseSizeBytes = estimate.usage;
    } catch {
      // Storage API unavailable (e.g. some private modes) — report null.
    }
    return { transactionCount, accountCount, categoryCount, databaseSizeBytes };
  }
}

export const repository = new IndexedDBRepository();