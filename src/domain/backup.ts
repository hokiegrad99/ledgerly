/**
 * Backup & restore.
 *
 * Backup format: versioned JSON (`ledgerly-backup` v1). The backup contains
 * everything needed to reconstruct the user's financial data. It never
 * contains passwords or authentication secrets (there are none in local mode).
 */
import type { BackupPayload } from './types';
import { nowISO } from '../lib/id';

export const BACKUP_FORMAT = 'ledgerly-backup';
export const BACKUP_VERSION = 1;

export interface BackupData {
  accounts: BackupPayload['data']['accounts'];
  categoryGroups: BackupPayload['data']['categoryGroups'];
  categories: BackupPayload['data']['categories'];
  tags: BackupPayload['data']['tags'];
  transactions: BackupPayload['data']['transactions'];
  splits: BackupPayload['data']['splits'];
  transfers: BackupPayload['data']['transfers'];
  rules: BackupPayload['data']['rules'];
  budgets: BackupPayload['data']['budgets'];
  budgetItems: BackupPayload['data']['budgetItems'];
  goals: BackupPayload['data']['goals'];
  recurring: BackupPayload['data']['recurring'];
  securities: BackupPayload['data']['securities'];
  holdings: BackupPayload['data']['holdings'];
  investmentTransactions: BackupPayload['data']['investmentTransactions'];
  liabilities: BackupPayload['data']['liabilities'];
  dashboard: BackupPayload['data']['dashboard'];
  settings: BackupPayload['data']['settings'];
  importMappings: BackupPayload['data']['importMappings'];
}

export const EMPTY_BACKUP_DATA: BackupData = {
  accounts: [],
  categoryGroups: [],
  categories: [],
  tags: [],
  transactions: [],
  splits: [],
  transfers: [],
  rules: [],
  budgets: [],
  budgetItems: [],
  goals: [],
  recurring: [],
  securities: [],
  holdings: [],
  investmentTransactions: [],
  liabilities: [],
  dashboard: [],
  settings: null,
  importMappings: [],
};

/** Build a BackupPayload from the current data. */
export function buildBackup(data: BackupData, appVersion: string): BackupPayload {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: nowISO(),
    appVersion,
    data: {
      ...EMPTY_BACKUP_DATA,
      ...data,
      settings: data.settings ?? null,
    },
  };
}

/** Generate a backup file name, e.g. ledgerly-backup-2026-09-10.json (UTC date). */
export function backupFileName(date = new Date()): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `ledgerly-backup-v${BACKUP_VERSION}-${y}-${m}-${d}.json`;
}

export interface BackupParseResult {
  ok: boolean;
  payload?: BackupPayload;
  error?: string;
}

/** Validate a parsed backup file. Returns a typed payload or an error message. */
export function parseBackup(json: unknown): BackupParseResult {
  if (typeof json !== 'object' || json === null) {
    return { ok: false, error: 'This file is not a valid Ledgerly backup.' };
  }
  const obj = json as Record<string, unknown>;
  if (obj.format !== BACKUP_FORMAT) {
    return { ok: false, error: 'This file is not a Ledgerly backup (unrecognized format).' };
  }
  const version = obj.version;
  if (typeof version !== 'number' || version < 1 || version > BACKUP_VERSION) {
    return { ok: false, error: `Unsupported backup version ${String(version)}. This version of Ledgerly supports v${BACKUP_VERSION}.` };
  }
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'The backup file is missing its data section.' };
  }
  // Validate that the required collections are arrays.
  const collections = ['accounts', 'transactions', 'categories', 'categoryGroups', 'tags', 'budgets', 'budgetItems', 'goals', 'recurring', 'rules', 'securities', 'holdings', 'investmentTransactions', 'liabilities', 'dashboard', 'importMappings', 'splits', 'transfers'];
  for (const c of collections) {
    if (!Array.isArray(data[c])) {
      return { ok: false, error: `The backup file is missing the "${c}" collection.` };
    }
  }
  return { ok: true, payload: obj as unknown as BackupPayload };
}

export interface RecordCounts {
  accounts: number;
  transactions: number;
  categories: number;
  categoryGroups: number;
  tags: number;
  budgets: number;
  budgetItems: number;
  goals: number;
  recurring: number;
  rules: number;
  securities: number;
  holdings: number;
  investmentTransactions: number;
  liabilities: number;
  dashboard: number;
  importMappings: number;
  splits: number;
  transfers: number;
}

export function countRecords(data: BackupData): RecordCounts {
  return {
    accounts: data.accounts.length,
    transactions: data.transactions.length,
    categories: data.categories.length,
    categoryGroups: data.categoryGroups.length,
    tags: data.tags.length,
    budgets: data.budgets.length,
    budgetItems: data.budgetItems.length,
    goals: data.goals.length,
    recurring: data.recurring.length,
    rules: data.rules.length,
    securities: data.securities.length,
    holdings: data.holdings.length,
    investmentTransactions: data.investmentTransactions.length,
    liabilities: data.liabilities.length,
    dashboard: data.dashboard.length,
    importMappings: data.importMappings.length,
    splits: data.splits.length,
    transfers: data.transfers.length,
  };
}