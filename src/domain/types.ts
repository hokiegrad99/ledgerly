/**
 * Ledgerly domain model.
 *
 * All IDs are UUID strings. Monetary amounts are integer cents unless
 * documented otherwise. Dates are 'YYYY-MM-DD'; month keys are 'YYYY-MM'.
 */

export type ID = string;
export type ISODate = string;
export type MonthKey = string;

export interface Timestamps {
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------- Accounts

export type AccountType =
  | 'checking'
  | 'savings'
  | 'cash'
  | 'credit-card'
  | 'mortgage'
  | 'auto-loan'
  | 'student-loan'
  | 'personal-loan'
  | 'brokerage'
  | 'retirement'
  | '401k'
  | 'ira'
  | 'roth-ira'
  | 'hsa'
  | 'crypto'
  | 'real-estate'
  | 'other-asset'
  | 'other-liability';

export const ACCOUNT_TYPES: { value: AccountType; label: string; kind: 'asset' | 'liability' }[] = [
  { value: 'checking', label: 'Checking', kind: 'asset' },
  { value: 'savings', label: 'Savings', kind: 'asset' },
  { value: 'cash', label: 'Cash', kind: 'asset' },
  { value: 'credit-card', label: 'Credit Card', kind: 'liability' },
  { value: 'mortgage', label: 'Mortgage', kind: 'liability' },
  { value: 'auto-loan', label: 'Auto Loan', kind: 'liability' },
  { value: 'student-loan', label: 'Student Loan', kind: 'liability' },
  { value: 'personal-loan', label: 'Personal Loan', kind: 'liability' },
  { value: 'brokerage', label: 'Brokerage', kind: 'asset' },
  { value: 'retirement', label: 'Retirement', kind: 'asset' },
  { value: '401k', label: '401(k)', kind: 'asset' },
  { value: 'ira', label: 'IRA', kind: 'asset' },
  { value: 'roth-ira', label: 'Roth IRA', kind: 'asset' },
  { value: 'hsa', label: 'HSA', kind: 'asset' },
  { value: 'crypto', label: 'Cryptocurrency', kind: 'asset' },
  { value: 'real-estate', label: 'Real Estate', kind: 'asset' },
  { value: 'other-asset', label: 'Other Asset', kind: 'asset' },
  { value: 'other-liability', label: 'Other Liability', kind: 'liability' },
];

export const isLiabilityType = (t: AccountType): boolean => ACCOUNT_TYPES.find((a) => a.value === t)?.kind === 'liability';

export interface Account extends Timestamps {
  id: ID;
  name: string;
  institution: string;
  type: AccountType;
  lastFour: string;
  /** Current balance in cents. Signed: liabilities are negative. */
  balance: number;
  startingBalance: number;
  currency: string;
  notes: string;
  active: boolean;
  includeInNetWorth: boolean;
  includeInBudget: boolean;
  includeInReports: boolean;
}

// ------------------------------------------------------------- Categories

export interface CategoryGroup extends Timestamps {
  id: ID;
  name: string;
  sortOrder: number;
  archived: boolean;
  kind: 'expense' | 'income' | 'transfer';
}

export interface Category extends Timestamps {
  id: ID;
  groupId: ID;
  name: string;
  sortOrder: number;
  archived: boolean;
}

export interface Tag extends Timestamps {
  id: ID;
  name: string;
}

// ----------------------------------------------------------- Transactions

export type TransactionType = 'expense' | 'income' | 'transfer';

export interface Transaction extends Timestamps {
  id: ID;
  accountId: ID;
  date: ISODate;
  /** Signed cents. Negative = money left the account (expense); positive = money entered (income). */
  amount: number;
  /** User-edited merchant/description. */
  merchant: string;
  /** Original imported description, preserved for reference. */
  originalDescription: string;
  categoryId: ID | null;
  tagIds: ID[];
  notes: string;
  type: TransactionType;
  cleared: boolean;
  pending: boolean;
  reviewed: boolean;
  /** ID of the paired transaction when this is part of a transfer. */
  transferId: ID | null;
  recurringId: ID | null;
  /** External identifier from import (e.g. OFX FITID). */
  externalId: string | null;
  /** Set when this transaction is a split line of a parent transaction. */
  splitParentId: ID | null;
  importSessionId: ID | null;
}

export interface TransactionSplit extends Timestamps {
  id: ID;
  transactionId: ID;
  categoryId: ID | null;
  /** Signed cents, same direction as the parent. */
  amount: number;
  merchant: string;
  notes: string;
  tagIds: ID[];
}

export interface TransferPair extends Timestamps {
  id: ID;
  /** Transaction that left an account (negative amount). */
  fromTransactionId: ID;
  /** Transaction that entered an account (positive amount). */
  toTransactionId: ID;
  amount: number;
  date: ISODate;
}

// ------------------------------------------------------------------ Rules

export interface TransactionRule extends Timestamps {
  id: ID;
  name: string;
  enabled: boolean;
  priority: number;
  conditions: RuleCondition[];
  actions: RuleAction[];
}

export type RuleCondition = {
  field: 'merchant' | 'description' | 'amount' | 'account' | 'category' | 'type' | 'tag';
  op: 'contains' | 'not-contains' | 'equals' | 'starts-with' | 'ends-with' | 'gt' | 'lt' | 'is';
  value: string;
};

export type RuleAction =
  | { kind: 'set-category'; categoryId: ID }
  | { kind: 'set-merchant'; value: string }
  | { kind: 'add-tag'; tagId: ID }
  | { kind: 'remove-tag'; tagId: ID }
  | { kind: 'mark-reviewed' }
  | { kind: 'exclude-from-budget' }
  | { kind: 'exclude-from-reports' };

// ---------------------------------------------------------------- Budgets

export type BudgetMode = 'category' | 'flex';

export interface Budget extends Timestamps {
  id: ID;
  month: MonthKey;
  mode: BudgetMode;
  /** For flex mode: total flexible spending allowed for the month, in cents. */
  flexAmount: number | null;
}

export interface BudgetItem extends Timestamps {
  id: ID;
  budgetId: ID;
  categoryId: ID;
  /** Budgeted amount in cents per month. */
  amount: number;
  /** Roll over unused budget to next month. */
  rollover: boolean;
}

// ------------------------------------------------------------------ Goals

export type GoalType =
  | 'savings'
  | 'emergency-fund'
  | 'vacation'
  | 'home-purchase'
  | 'major-purchase'
  | 'debt-payoff'
  | 'investment'
  | 'retirement'
  | 'custom';

export interface Goal extends Timestamps {
  id: ID;
  name: string;
  type: GoalType;
  targetAmount: number;
  currentAmount: number;
  targetDate: ISODate | null;
  monthlyContribution: number;
  accountIds: ID[];
  notes: string;
  completed: boolean;
}

// ------------------------------------------------------------- Recurring

export type RecurringInterval = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual';

export interface RecurringTransaction extends Timestamps {
  id: ID;
  merchant: string;
  amount: number;
  categoryId: ID | null;
  accountId: ID | null;
  interval: RecurringInterval;
  /** Day of month (1-31) for monthly intervals; day of week (0-6) for weekly. */
  dayOfMonth: number;
  startDate: ISODate;
  endDate: ISODate | null;
  lastOccurrence: ISODate | null;
  nextOccurrence: ISODate | null;
  type: TransactionType;
  autoCreated: boolean;
  active: boolean;
}

// ------------------------------------------------------------ Investments

export type SecurityType = 'stock' | 'etf' | 'mutual-fund' | 'bond' | 'treasury' | 'crypto' | 'cash' | 'other';

export const SECURITY_TYPES: { value: SecurityType; label: string }[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'etf', label: 'ETF' },
  { value: 'mutual-fund', label: 'Mutual Fund' },
  { value: 'bond', label: 'Bond' },
  { value: 'treasury', label: 'Treasury' },
  { value: 'crypto', label: 'Crypto' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export interface Security extends Timestamps {
  id: ID;
  symbol: string;
  name: string;
  type: SecurityType;
  assetClass: string;
  currency: string;
}

export interface Holding extends Timestamps {
  id: ID;
  accountId: ID;
  securityId: ID;
  /** Share count (may be fractional). */
  shares: number;
  /** Cost basis in cents. */
  costBasis: number;
  /** Current price per share in cents. */
  currentPrice: number;
}

export type InvestmentTxType = 'buy' | 'sell' | 'dividend' | 'interest' | 'transfer' | 'split' | 'reinvest';

export const INVESTMENT_TX_TYPES: { value: InvestmentTxType; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'dividend', label: 'Dividend' },
  { value: 'interest', label: 'Interest' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'split', label: 'Split' },
  { value: 'reinvest', label: 'Reinvestment' },
];

export interface InvestmentTransaction extends Timestamps {
  id: ID;
  accountId: ID;
  securityId: ID | null;
  date: ISODate;
  type: InvestmentTxType;
  shares: number;
  /** Price per share in cents. */
  price: number;
  /** Total amount in cents. */
  amount: number;
  fees: number;
  notes: string;
}

// -------------------------------------------------------------- Liabilities

export interface Liability extends Timestamps {
  id: ID;
  accountId: ID;
  interestRate: number;
  minimumPayment: number;
  paymentDay: number;
  originalBalance: number;
  payoffStrategy: 'snowball' | 'avalanche' | 'custom';
}

// ---------------------------------------------------------------- Reports

export interface ReportFilters {
  dateFrom?: ISODate | null;
  dateTo?: ISODate | null;
  accountIds?: ID[] | null;
  categoryIds?: ID[] | null;
  groupIds?: ID[] | null;
  merchant?: string | null;
  tagIds?: ID[] | null;
  type?: TransactionType | null;
}

export interface SavedReport extends Timestamps {
  id: ID;
  name: string;
  kind: string;
  filters: ReportFilters;
}

// ------------------------------------------------------------ Dashboard

export type DashboardWidgetKind =
  | 'net-worth'
  | 'cash-flow'
  | 'spending'
  | 'budget'
  | 'recent-transactions'
  | 'upcoming'
  | 'goals'
  | 'investments';

export interface DashboardWidget extends Timestamps {
  id: ID;
  kind: DashboardWidgetKind;
  title: string;
  size: 'small' | 'medium' | 'large';
  sortOrder: number;
  visible: boolean;
  config: Record<string, unknown>;
}

// --------------------------------------------------------------- Imports

export interface ImportMapping extends Timestamps {
  id: ID;
  /** Fingerprint of the CSV header row, used to remember the mapping. */
  headerFingerprint: string;
  institution: string;
  accountId: ID | null;
  /** CSV column name -> target field. */
  columns: Record<string, string>;
  dateFormat: string;
  delimiter: string;
  lastUsed: ISODate;
}

export interface ImportSession extends Timestamps {
  id: ID;
  fileName: string;
  fileType: 'csv' | 'qfx' | 'ofx';
  accountId: ID | null;
  mappingId: ID | null;
  totalRows: number;
  importedRows: number;
  skippedDuplicates: number;
}

// ---------------------------------------------------------------- Backup

export interface BackupPayload {
  format: 'ledgerly-backup';
  version: 1;
  exportedAt: string;
  appVersion: string;
  data: {
    accounts: Account[];
    categoryGroups: CategoryGroup[];
    categories: Category[];
    tags: Tag[];
    transactions: Transaction[];
    splits: TransactionSplit[];
    transfers: TransferPair[];
    rules: TransactionRule[];
    budgets: Budget[];
    budgetItems: BudgetItem[];
    goals: Goal[];
    recurring: RecurringTransaction[];
    securities: Security[];
    holdings: Holding[];
    investmentTransactions: InvestmentTransaction[];
    liabilities: Liability[];
    dashboard: DashboardWidget[];
    settings: UserSettings | null;
    importMappings: ImportMapping[];
  };
}

// ---------------------------------------------------------------- Settings

export interface UserSettings {
  theme: 'light' | 'dark' | 'system';
  currency: string;
  dateFormat: string;
  weekStart: 'sunday' | 'monday';
  firstName: string;
  householdName: string;
  /** Last-used flex budget amount. */
  lastFlexAmount: number | null;
  demoDataLoaded: boolean;
}

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'system',
  currency: 'USD',
  dateFormat: 'YYYY-MM-DD',
  weekStart: 'sunday',
  firstName: '',
  householdName: '',
  lastFlexAmount: null,
  demoDataLoaded: false,
};

export const DATE_FORMATS = ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD/MM/YYYY', 'MMM D, YYYY'];