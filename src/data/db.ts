/**
 * Dexie/IndexedDB schema.
 *
 * Indexes are chosen for the hot query paths:
 *  - transactions: date range + account + category lookups
 *  - splits/transfers: parent transaction lookups
 *  - everything else: id-keyed collections
 */
import Dexie, { type EntityTable } from 'dexie';
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
} from '../domain/types';

export interface AppDB extends Dexie {
  accounts: EntityTable<Account, 'id'>;
  categoryGroups: EntityTable<CategoryGroup, 'id'>;
  categories: EntityTable<Category, 'id'>;
  tags: EntityTable<Tag, 'id'>;
  transactions: EntityTable<Transaction, 'id'>;
  splits: EntityTable<TransactionSplit, 'id'>;
  transfers: EntityTable<TransferPair, 'id'>;
  rules: EntityTable<TransactionRule, 'id'>;
  budgets: EntityTable<Budget, 'id'>;
  budgetItems: EntityTable<BudgetItem, 'id'>;
  goals: EntityTable<Goal, 'id'>;
  recurring: EntityTable<RecurringTransaction, 'id'>;
  securities: EntityTable<Security, 'id'>;
  holdings: EntityTable<Holding, 'id'>;
  investmentTransactions: EntityTable<InvestmentTransaction, 'id'>;
  liabilities: EntityTable<Liability, 'id'>;
  dashboard: EntityTable<DashboardWidget, 'id'>;
  savedReports: EntityTable<SavedReport, 'id'>;
  importMappings: EntityTable<ImportMapping, 'id'>;
  importSessions: EntityTable<ImportSession, 'id'>;
  settings: EntityTable<{ key: string; value: unknown }, 'key'>;
}

export const db = new Dexie('ledgerly') as AppDB;

db.version(1).stores({
  accounts: 'id, type, active',
  categoryGroups: 'id, sortOrder, kind',
  categories: 'id, groupId, sortOrder',
  tags: 'id, name',
  transactions: 'id, accountId, date, categoryId, merchant, type, reviewed, cleared, transferId, externalId, splitParentId, [accountId+date], [accountId+externalId]',
  splits: 'id, transactionId, categoryId',
  transfers: 'id, fromTransactionId, toTransactionId, date',
  rules: 'id, enabled, priority',
  budgets: 'id, month, mode',
  budgetItems: 'id, budgetId, categoryId',
  goals: 'id, type, targetDate',
  recurring: 'id, merchant, interval, nextOccurrence',
  securities: 'id, symbol',
  holdings: 'id, accountId, securityId',
  investmentTransactions: 'id, accountId, securityId, date',
  liabilities: 'id, accountId',
  dashboard: 'id, sortOrder',
  savedReports: 'id, name, kind',
  importMappings: 'id, headerFingerprint',
  importSessions: 'id, fileType, createdAt',
  settings: 'key',
});

export async function clearAllData(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}

export async function resetDatabase(): Promise<void> {
  await clearAllData();
}