/**
 * DataRepository — the persistence abstraction.
 *
 * The UI and business logic depend only on this interface, never on Dexie or
 * IndexedDB directly. This keeps the door open for a ServerRepository
 * (PostgreSQL + REST API) later without touching application code.
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
import type { BackupData } from '../domain/backup';

export interface TransactionQuery {
  /** Inclusive date range (YYYY-MM-DD). */
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  categoryId?: string;
  categoryIds?: string[];
  merchant?: string;
  type?: 'expense' | 'income' | 'transfer';
  reviewed?: boolean;
  unreviewed?: boolean;
  pending?: boolean;
  transferOnly?: boolean;
  /** Free-text search across merchant, notes, tags. */
  search?: string;
  tagId?: string;
  offset?: number;
  limit?: number;
  sort?: 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';
}

export interface TransactionPage {
  items: Transaction[];
  total: number;
}

export interface RepositoryStats {
  transactionCount: number;
  accountCount: number;
  categoryCount: number;
  databaseSizeBytes: number | null;
}

export interface DataRepository {
  readonly name: string;

  // ---- Accounts ----
  getAccounts(): Promise<Account[]>;
  getAccount(id: string): Promise<Account | undefined>;
  saveAccount(account: Account): Promise<void>;
  saveAccounts(accounts: Account[]): Promise<void>;
  deleteAccount(id: string): Promise<void>;

  // ---- Categories ----
  getCategoryGroups(): Promise<CategoryGroup[]>;
  saveCategoryGroup(g: CategoryGroup): Promise<void>;
  saveCategoryGroups(gs: CategoryGroup[]): Promise<void>;
  deleteCategoryGroup(id: string): Promise<void>;
  /** Ensure the internal system tags (exclusion markers) exist. */
  ensureSystemTags(): Promise<void>;
  getCategories(): Promise<Category[]>;
  saveCategory(c: Category): Promise<void>;
  saveCategories(cats: Category[]): Promise<void>;
  deleteCategory(id: string): Promise<void>;

  // ---- Tags ----
  getTags(): Promise<Tag[]>;
  saveTag(t: Tag): Promise<void>;
  deleteTag(id: string): Promise<void>;

  // ---- Transactions ----
  queryTransactions(q: TransactionQuery): Promise<TransactionPage>;
  getAllTransactions(): Promise<Transaction[]>;
  getTransaction(id: string): Promise<Transaction | undefined>;
  saveTransaction(t: Transaction): Promise<void>;
  saveTransactions(txs: Transaction[]): Promise<void>;
  deleteTransactions(ids: string[]): Promise<void>;
  /** Fetch transactions for a date range efficiently (for reports). */
  transactionsInRange(from?: string, to?: string): Promise<Transaction[]>;

  // ---- Splits ----
  getSplitsForTransactions(transactionIds: string[]): Promise<TransactionSplit[]>;
  saveSplits(splits: TransactionSplit[]): Promise<void>;
  deleteSplitsForTransactions(transactionIds: string[]): Promise<void>;

  // ---- Transfers ----
  getTransfers(): Promise<TransferPair[]>;
  saveTransfer(t: TransferPair): Promise<void>;
  deleteTransfer(id: string): Promise<void>;

  // ---- Rules ----
  getRules(): Promise<TransactionRule[]>;
  saveRule(r: TransactionRule): Promise<void>;
  saveRules(rs: TransactionRule[]): Promise<void>;
  deleteRule(id: string): Promise<void>;

  // ---- Budgets ----
  getBudget(month: string): Promise<Budget | undefined>;
  getBudgets(): Promise<Budget[]>;
  saveBudget(b: Budget): Promise<void>;
  getBudgetItems(budgetId: string): Promise<BudgetItem[]>;
  getBudgetItemsForMonth(month: string): Promise<BudgetItem[]>;
  saveBudgetItems(items: BudgetItem[]): Promise<void>;
  deleteBudgetItems(budgetId: string): Promise<void>;

  // ---- Goals ----
  getGoals(): Promise<Goal[]>;
  saveGoal(g: Goal): Promise<void>;
  deleteGoal(id: string): Promise<void>;

  // ---- Recurring ----
  getRecurring(): Promise<RecurringTransaction[]>;
  saveRecurring(r: RecurringTransaction): Promise<void>;
  saveRecurringMany(rs: RecurringTransaction[]): Promise<void>;
  deleteRecurring(id: string): Promise<void>;

  // ---- Investments ----
  getSecurities(): Promise<Security[]>;
  saveSecurity(s: Security): Promise<void>;
  deleteSecurity(id: string): Promise<void>;
  getHoldings(): Promise<Holding[]>;
  saveHolding(h: Holding): Promise<void>;
  saveHoldings(hs: Holding[]): Promise<void>;
  deleteHolding(id: string): Promise<void>;
  getInvestmentTransactions(): Promise<InvestmentTransaction[]>;
  saveInvestmentTransaction(t: InvestmentTransaction): Promise<void>;
  deleteInvestmentTransaction(id: string): Promise<void>;

  // ---- Liabilities ----
  getLiabilities(): Promise<Liability[]>;
  saveLiability(l: Liability): Promise<void>;
  deleteLiability(id: string): Promise<void>;

  // ---- Dashboard ----
  getDashboardWidgets(): Promise<DashboardWidget[]>;
  saveDashboardWidgets(widgets: DashboardWidget[]): Promise<void>;

  // ---- Saved reports ----
  getSavedReports(): Promise<SavedReport[]>;
  saveSavedReport(r: SavedReport): Promise<void>;
  deleteSavedReport(id: string): Promise<void>;

  // ---- Import ----
  getImportMappings(): Promise<ImportMapping[]>;
  saveImportMapping(m: ImportMapping): Promise<void>;
  deleteImportMapping(id: string): Promise<void>;
  saveImportSession(s: ImportSession): Promise<void>;
  getImportSessions(): Promise<ImportSession[]>;

  // ---- Settings ----
  getSettings(): Promise<UserSettings | null>;
  saveSettings(s: UserSettings): Promise<void>;

  // ---- Bulk / backup ----
  exportAll(): Promise<BackupData>;
  importAll(data: BackupData, opts: { replace: boolean }): Promise<void>;
  /** Recompute all account balances from transactions. */
  recomputeBalances(): Promise<void>;
  stats(): Promise<RepositoryStats>;
  /** Delete everything (used by "reset" and before restoring in replace mode). */
  clear(): Promise<void>;
}

/** Repository that does nothing (useful as a base for tests or empty states). */
export class NoopRepository implements DataRepository {
  readonly name = 'noop';
  getAccounts() { return Promise.resolve([]); }
  getAccount() { return Promise.resolve(undefined); }
  saveAccount() { return Promise.resolve(); }
  saveAccounts() { return Promise.resolve(); }
  deleteAccount() { return Promise.resolve(); }
  getCategoryGroups() { return Promise.resolve([]); }
  saveCategoryGroup() { return Promise.resolve(); }
  saveCategoryGroups() { return Promise.resolve(); }
  deleteCategoryGroup() { return Promise.resolve(); }
  ensureSystemTags() { return Promise.resolve(); }
  getCategories() { return Promise.resolve([]); }
  saveCategory() { return Promise.resolve(); }
  saveCategories() { return Promise.resolve(); }
  deleteCategory() { return Promise.resolve(); }
  getTags() { return Promise.resolve([]); }
  saveTag() { return Promise.resolve(); }
  deleteTag() { return Promise.resolve(); }
  queryTransactions() { return Promise.resolve({ items: [], total: 0 }); }
  getAllTransactions() { return Promise.resolve([]); }
  getTransaction() { return Promise.resolve(undefined); }
  saveTransaction() { return Promise.resolve(); }
  saveTransactions() { return Promise.resolve(); }
  deleteTransactions() { return Promise.resolve(); }
  transactionsInRange() { return Promise.resolve([]); }
  getSplitsForTransactions() { return Promise.resolve([]); }
  saveSplits() { return Promise.resolve(); }
  deleteSplitsForTransactions() { return Promise.resolve(); }
  getTransfers() { return Promise.resolve([]); }
  saveTransfer() { return Promise.resolve(); }
  deleteTransfer() { return Promise.resolve(); }
  getRules() { return Promise.resolve([]); }
  saveRule() { return Promise.resolve(); }
  saveRules() { return Promise.resolve(); }
  deleteRule() { return Promise.resolve(); }
  getBudget() { return Promise.resolve(undefined); }
  getBudgets() { return Promise.resolve([]); }
  saveBudget() { return Promise.resolve(); }
  getBudgetItems() { return Promise.resolve([]); }
  getBudgetItemsForMonth() { return Promise.resolve([]); }
  saveBudgetItems() { return Promise.resolve(); }
  deleteBudgetItems() { return Promise.resolve(); }
  getGoals() { return Promise.resolve([]); }
  saveGoal() { return Promise.resolve(); }
  deleteGoal() { return Promise.resolve(); }
  getRecurring() { return Promise.resolve([]); }
  saveRecurring() { return Promise.resolve(); }
  saveRecurringMany() { return Promise.resolve(); }
  deleteRecurring() { return Promise.resolve(); }
  getSecurities() { return Promise.resolve([]); }
  saveSecurity() { return Promise.resolve(); }
  deleteSecurity() { return Promise.resolve(); }
  getHoldings() { return Promise.resolve([]); }
  saveHolding() { return Promise.resolve(); }
  saveHoldings() { return Promise.resolve(); }
  deleteHolding() { return Promise.resolve(); }
  getInvestmentTransactions() { return Promise.resolve([]); }
  saveInvestmentTransaction() { return Promise.resolve(); }
  deleteInvestmentTransaction() { return Promise.resolve(); }
  getLiabilities() { return Promise.resolve([]); }
  saveLiability() { return Promise.resolve(); }
  deleteLiability() { return Promise.resolve(); }
  getDashboardWidgets() { return Promise.resolve([]); }
  saveDashboardWidgets() { return Promise.resolve(); }
  getSavedReports() { return Promise.resolve([]); }
  saveSavedReport() { return Promise.resolve(); }
  deleteSavedReport() { return Promise.resolve(); }
  getImportMappings() { return Promise.resolve([]); }
  saveImportMapping() { return Promise.resolve(); }
  deleteImportMapping() { return Promise.resolve(); }
  saveImportSession() { return Promise.resolve(); }
  getImportSessions() { return Promise.resolve([]); }
  getSettings() { return Promise.resolve(null); }
  saveSettings() { return Promise.resolve(); }
  exportAll() { return Promise.resolve({ accounts: [], categoryGroups: [], categories: [], tags: [], transactions: [], splits: [], transfers: [], rules: [], budgets: [], budgetItems: [], goals: [], recurring: [], securities: [], holdings: [], investmentTransactions: [], liabilities: [], dashboard: [], settings: null, importMappings: [] }); }
  importAll() { return Promise.resolve(); }
  recomputeBalances() { return Promise.resolve(); }
  stats() { return Promise.resolve({ transactionCount: 0, accountCount: 0, categoryCount: 0, databaseSizeBytes: null }); }
  clear() { return Promise.resolve(); }
}