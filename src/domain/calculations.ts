/**
 * Core financial calculations. All math operates on integer cents.
 *
 * These functions are pure and testable — they never touch the database.
 */
import type {
  Account,
  Budget,
  BudgetItem,
  Category,
  CategoryGroup,
  Goal,
  Holding,
  InvestmentTransaction,
  Liability,
  MonthKey,
  RecurringInterval,
  RecurringTransaction,
  Security,
  Transaction,
  TransactionSplit,
  TransferPair,
} from './types';
import { addDays, dayInMonth, diffDays, monthEnd, monthKeyOf, todayISO } from '../lib/dates';
import { addMonthsToKey, currentMonthKey } from '../lib/dates';

// ---------------------------------------------------------------- Net worth

export interface NetWorthSummary {
  assets: number;
  liabilities: number;
  netWorth: number;
}

/** Net worth from a list of accounts (assets + liabilities, signed). */
export function netWorthFromAccounts(accounts: Account[]): NetWorthSummary {
  let assets = 0;
  let liabilities = 0;
  for (const a of accounts) {
    if (!a.includeInNetWorth) continue;
    if (a.balance >= 0) assets += a.balance;
    else liabilities += -a.balance;
  }
  return { assets, liabilities, netWorth: assets - liabilities };
}

// --------------------------------------------------------------- Cash flow

export interface CashFlowSummary {
  income: number;
  expenses: number;
  net: number;
}

/** Sum signed transaction amounts, returning income/expense/net for a set of transactions. */
export function cashFlow(transactions: Transaction[], opts: { excludeTransfers?: boolean } = {}): CashFlowSummary {
  let income = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (opts.excludeTransfers !== false && t.type === 'transfer') continue;
    if (t.amount >= 0) income += t.amount;
    else expenses += -t.amount;
  }
  return { income, expenses, net: income - expenses };
}

// ----------------------------------------------------------------- Budget

export interface CategoryBudgetSummary {
  categoryId: string;
  /** Effective budget for the month: budgeted amount + carried-over amount. */
  budgeted: number;
  spent: number;
  remaining: number;
  percentUsed: number;
  rollover: boolean;
  /** Amount carried in from the previous month (positive = surplus, negative = deficit). */
  carryover: number;
}

export interface BudgetSummary {
  mode: 'category' | 'flex';
  month: MonthKey;
  totalBudgeted: number;
  totalSpent: number;
  totalRemaining: number;
  flexAmount: number | null;
  categories: CategoryBudgetSummary[];
  nonBudgetedSpending: number;
}

/**
 * Compute the amount carried into a month's budget from the previous month.
 *
 * For each previous-month budget item with `rollover: true`, the signed
 * remainder (`amount - spent`) carries forward: a positive remainder adds to
 * next month's budget, a negative remainder (overspend) reduces it. Returns a
 * map of categoryId -> carryover cents (categories with no remainder omitted).
 */
export function budgetRolloverCarryover(
  prevBudgetItems: BudgetItem[],
  prevSpendingByCategory: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const bi of prevBudgetItems) {
    if (!bi.rollover) continue;
    const spent = prevSpendingByCategory.get(bi.categoryId) ?? 0;
    const remaining = bi.amount - spent;
    if (remaining !== 0) out.set(bi.categoryId, remaining);
  }
  return out;
}

/**
 * Compute a budget summary for a month.
 * `spendingByCategory` maps categoryId -> absolute expense cents (transfers excluded).
 * `carryover` (optional) maps categoryId -> cents carried in from the previous
 * month (see `budgetRolloverCarryover`); it is added to each category's budgeted
 * amount. Categories with carryover but no current-month budget item are included
 * so carried money remains visible and counted.
 */
export function budgetSummary(
  budget: Budget | null,
  budgetItems: BudgetItem[],
  spendingByCategory: Map<string, number>,
  carryover?: Map<string, number>,
): BudgetSummary {
  const catMap = new Map<string, CategoryBudgetSummary>();
  let totalBudgeted = 0;
  let totalSpent = 0;
  let nonBudgetedSpending = 0;

  for (const bi of budgetItems) {
    const carry = carryover?.get(bi.categoryId) ?? 0;
    const spent = spendingByCategory.get(bi.categoryId) ?? 0;
    const effective = bi.amount + carry;
    const remaining = effective - spent;
    const item: CategoryBudgetSummary = {
      categoryId: bi.categoryId,
      budgeted: effective,
      spent,
      remaining,
      percentUsed: effective > 0 ? Math.min(100, Math.round((spent / effective) * 1000) / 10) : spent > 0 ? 100 : 0,
      rollover: bi.rollover,
      carryover: carry,
    };
    catMap.set(bi.categoryId, item);
    totalBudgeted += effective;
    totalSpent += spent;
  }

  // Categories not budgeted this month but with money carried in.
  if (carryover) {
    for (const [catId, carry] of carryover) {
      if (carry === 0 || catMap.has(catId)) continue;
      const spent = spendingByCategory.get(catId) ?? 0;
      const item: CategoryBudgetSummary = {
        categoryId: catId,
        budgeted: carry,
        spent,
        remaining: carry - spent,
        percentUsed: carry > 0 ? Math.min(100, Math.round((spent / carry) * 1000) / 10) : spent > 0 ? 100 : 0,
        rollover: true,
        carryover: carry,
      };
      catMap.set(catId, item);
      totalBudgeted += carry;
      totalSpent += spent;
    }
  }

  for (const [catId, spent] of spendingByCategory) {
    if (!catMap.has(catId)) nonBudgetedSpending += spent;
  }

  const mode = budget?.mode ?? 'category';
  return {
    mode,
    month: budget?.month ?? currentMonthKey(),
    totalBudgeted,
    totalSpent,
    totalRemaining: totalBudgeted - totalSpent,
    flexAmount: budget?.flexAmount ?? null,
    categories: [...catMap.values()].sort((a, b) => b.spent - a.spent),
    nonBudgetedSpending,
  };
}

/** Aggregate spending by category for a set of transactions (expenses only, no transfers). */
export function spendingByCategory(transactions: Transaction[], splits: TransactionSplit[]): Map<string, number> {
  const map = new Map<string, number>();
  const add = (catId: string | null, amt: number) => {
    if (!catId || amt >= 0) return;
    map.set(catId, (map.get(catId) ?? 0) + -amt);
  };
  const splitIds = new Set(splits.map((s) => s.transactionId));
  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    if (splitIds.has(t.id)) continue; // splits counted separately
    add(t.categoryId, t.amount);
  }
  for (const s of splits) {
    add(s.categoryId, s.amount);
  }
  return map;
}

/** Aggregate spending by merchant for a set of transactions. */
export function spendingByMerchant(transactions: Transaction[], topN = 10): { merchant: string; amount: number }[] {
  const map = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'transfer' || t.amount >= 0) continue;
    const key = t.merchant.trim() || '(uncategorized merchant)';
    map.set(key, (map.get(key) ?? 0) + -t.amount);
  }
  return [...map.entries()]
    .map(([merchant, amount]) => ({ merchant, amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, topN);
}

// ---------------------------------------------------------------- Transfers

/**
 * Detect possible transfer pairs between two transactions.
 * A transfer pair is one negative transaction in account A and one positive
 * transaction in account B on the same (or nearby) date with the same amount.
 */
export function detectTransferPairs(
  transactions: Transaction[],
  accounts: Account[],
  opts: { windowDays?: number } = {},
): { from: Transaction; to: Transaction; confidence: 'high' | 'medium' }[] {
  const window = opts.windowDays ?? 3;
  const positives = transactions.filter((t) => t.amount > 0 && !t.transferId);
  const negatives = transactions.filter((t) => t.amount < 0 && !t.transferId);
  const accountIds = new Set(accounts.map((a) => a.id));
  const used = new Set<string>();
  const pairs: { from: Transaction; to: Transaction; confidence: 'high' | 'medium' }[] = [];

  for (const neg of negatives) {
    if (used.has(neg.id)) continue;
    for (const pos of positives) {
      if (used.has(pos.id)) continue;
      if (pos.accountId === neg.accountId) continue;
      if (!accountIds.has(pos.accountId) || !accountIds.has(neg.accountId)) continue;
      if (pos.amount !== -neg.amount) continue;
      const d = Math.abs(diffDays(neg.date, pos.date));
      if (d > window) continue;
      used.add(neg.id);
      used.add(pos.id);
      pairs.push({ from: neg, to: pos, confidence: d === 0 ? 'high' : 'medium' });
      break;
    }
  }
  return pairs;
}

// -------------------------------------------------------------- Recurring

export const INTERVAL_MONTHS: Record<RecurringInterval, number> = {
  weekly: 0,
  biweekly: 0,
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

export const INTERVAL_DAYS: Record<RecurringInterval, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 0,
  quarterly: 0,
  semiannual: 0,
  annual: 0,
};

/** Group monthly-interval transactions into candidate recurring series. */
export interface RecurringCandidate {
  merchant: string;
  amount: number;
  interval: RecurringInterval;
  occurrences: Transaction[];
  /** Expected day of month (1-31). */
  dayOfMonth: number;
}

/**
 * Detect likely recurring transactions from transaction history.
 * Looks for merchants with similar amounts occurring at regular intervals.
 */
export function detectRecurring(
  transactions: Transaction[],
  opts: { minOccurrences?: number; lookbackDays?: number; today?: string } = {},
): RecurringCandidate[] {
  const minOcc = opts.minOccurrences ?? 3;
  const lookback = opts.lookbackDays ?? 365 * 2;
  const cutoff = addDays(opts.today ?? todayISO(), -lookback);
  const candidates = new Map<string, Transaction[]>();

  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    if (t.date < cutoff) continue;
    const key = `${t.merchant.trim().toLowerCase()}|${Math.abs(t.amount)}`;
    const arr = candidates.get(key) ?? [];
    arr.push(t);
    candidates.set(key, arr);
  }

  const results: RecurringCandidate[] = [];
  for (const [, occ] of candidates) {
    if (occ.length < minOcc) continue;
    const sorted = [...occ].sort((a, b) => a.date.localeCompare(b.date));
    const merchant = sorted[0].merchant.trim();
    const amount = Math.abs(sorted[0].amount);

    // Check day-of-month stability for monthly intervals.
    const days = sorted.map((t) => Number(t.date.slice(8, 10)));
    const avgGap = sorted.length > 1 ? (diffDays(sorted[0].date, sorted[sorted.length - 1].date) / (sorted.length - 1)) : 0;

    let interval: RecurringInterval = 'monthly';
    let dayOfMonth = days[0];
    if (avgGap >= 340 && avgGap <= 390) interval = 'annual';
    else if (avgGap >= 160 && avgGap <= 200) interval = 'semiannual';
    else if (avgGap >= 85 && avgGap <= 100) interval = 'quarterly';
    else if (avgGap >= 26 && avgGap <= 34) interval = 'monthly';
    else if (avgGap >= 13 && avgGap <= 17) interval = 'biweekly';
    else if (avgGap >= 6 && avgGap <= 8) interval = 'weekly';
    else continue;

    if (interval === 'monthly') {
      const spread = Math.max(...days) - Math.min(...days);
      if (spread > 5) continue;
      dayOfMonth = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    } else if (interval === 'weekly' || interval === 'biweekly') {
      dayOfMonth = new Date(sorted[0].date + 'T00:00:00').getDay();
    }

    results.push({ merchant, amount, interval, occurrences: sorted, dayOfMonth });
  }

  return results.sort((a, b) => b.occurrences.length - a.occurrences.length);
}

/** Compute the next occurrence date for a recurring series after `after`. */
export function nextOccurrence(
  interval: RecurringInterval,
  dayOfMonth: number,
  after: string,
  startDate: string,
): string {
  const afterDate = after > startDate ? after : startDate;
  if (interval === 'weekly' || interval === 'biweekly') {
    const days = INTERVAL_DAYS[interval];
    let d = addDays(afterDate, days);
    // Align to day-of-week for the first computation.
    if (afterDate === startDate) {
      const targetDow = dayOfMonth;
      let cur = new Date(startDate + 'T00:00:00').getDay();
      let offset = (targetDow - cur + 7) % 7;
      d = addDays(startDate, offset);
      if (d <= after) d = addDays(d, days);
    }
    return d;
  }
  const months = INTERVAL_MONTHS[interval];
  const [y, m, d0] = afterDate.split('-').map(Number);
  const nextKey = addMonthsToKey(`${y}-${String(m).padStart(2, '0')}`, months);
  const [ny, nm] = nextKey.split('-').map(Number);
  return `${nextKey}-${String(dayInMonth(ny, nm, d0 > 28 ? Math.min(d0, 28) : d0)).padStart(2, '0')}`;
}

// -------------------------------------------------------------- Investments

export interface HoldingValuation {
  security: Security;
  holding: Holding;
  marketValue: number;
  gainLoss: number;
  gainLossPct: number;
}

export interface PortfolioSummary {
  totalValue: number;
  totalCostBasis: number;
  totalGainLoss: number;
  totalGainLossPct: number;
  bySecurityType: Map<string, number>;
  byAssetClass: Map<string, number>;
  byAccount: Map<string, number>;
  holdings: HoldingValuation[];
}

export function portfolioSummary(
  holdings: Holding[],
  securities: Security[],
  accounts: Account[],
): PortfolioSummary {
  const secById = new Map(securities.map((s) => [s.id, s]));
  const accById = new Map(accounts.map((a) => [a.id, a]));

  const bySecurityType = new Map<string, number>();
  const byAssetClass = new Map<string, number>();
  const byAccount = new Map<string, number>();
  const vals: HoldingValuation[] = [];
  let totalValue = 0;
  let totalCost = 0;

  for (const h of holdings) {
    const sec = secById.get(h.securityId);
    if (!sec) continue;
    const marketValue = Math.round(h.shares * h.currentPrice);
    const gainLoss = marketValue - h.costBasis;
    vals.push({
      security: sec,
      holding: h,
      marketValue,
      gainLoss,
      gainLossPct: h.costBasis > 0 ? Math.round((gainLoss / h.costBasis) * 10000) / 100 : 0,
    });
    totalValue += marketValue;
    totalCost += h.costBasis;
    bySecurityType.set(sec.type, (bySecurityType.get(sec.type) ?? 0) + marketValue);
    byAssetClass.set(sec.assetClass || 'Other', (byAssetClass.get(sec.assetClass || 'Other') ?? 0) + marketValue);
    const acc = accById.get(h.accountId);
    byAccount.set(acc?.name ?? h.accountId, (byAccount.get(acc?.name ?? h.accountId) ?? 0) + marketValue);
  }

  return {
    totalValue,
    totalCostBasis: totalCost,
    totalGainLoss: totalValue - totalCost,
    totalGainLossPct: totalCost > 0 ? Math.round(((totalValue - totalCost) / totalCost) * 10000) / 100 : 0,
    bySecurityType,
    byAssetClass,
    byAccount,
    holdings: vals.sort((a, b) => b.marketValue - a.marketValue),
  };
}

/** Compute investment performance from transactions: contributions, realized gains, income. */
export function investmentPerformance(
  txns: InvestmentTransaction[],
): { contributions: number; withdrawals: number; realizedGainLoss: number; income: number; dividends: number; interest: number } {
  let contributions = 0;
  let withdrawals = 0;
  let realized = 0;
  let income = 0;
  let dividends = 0;
  let interest = 0;
  for (const t of txns) {
    switch (t.type) {
      case 'buy':
        contributions += t.amount;
        break;
      case 'sell':
        withdrawals += -t.amount;
        break;
      case 'dividend':
        income += t.amount;
        dividends += t.amount;
        break;
      case 'interest':
        income += t.amount;
        interest += t.amount;
        break;
      case 'reinvest':
        contributions += t.amount;
        break;
      default:
        break;
    }
    // Realized gain/loss approximation for sells: proceeds - (cost basis removed).
    // Exact basis tracking requires lot accounting; this is a documented approximation.
    if (t.type === 'sell' && t.amount < 0) {
      realized += -t.amount;
    }
  }
  return { contributions, withdrawals, realizedGainLoss: realized, income, dividends, interest };
}

// ------------------------------------------------------------------ Goals

export interface GoalProgress {
  goal: Goal;
  percent: number;
  remaining: number;
  /** Estimated completion date based on monthly contribution, or null if no contribution. */
  estimatedCompletion: string | null;
  /** Whether the goal is on track to hit its target date. */
  onTrack: boolean;
}

export function goalProgress(goal: Goal): GoalProgress {
  const percent = goal.targetAmount > 0 ? Math.min(100, Math.max(0, (goal.currentAmount / goal.targetAmount) * 100)) : 0;
  const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
  let estimatedCompletion: string | null = null;
  if (goal.monthlyContribution > 0 && remaining > 0) {
    const monthsNeeded = Math.ceil(remaining / goal.monthlyContribution);
    const [y, m] = currentMonthKey().split('-').map(Number);
    const total = y * 12 + (m - 1) + monthsNeeded;
    const ey = Math.floor(total / 12);
    const em = (total % 12) + 1;
    estimatedCompletion = `${ey}-${String(em).padStart(2, '0')}-01`;
  }
  let onTrack = true;
  if (goal.targetDate && estimatedCompletion) {
    onTrack = estimatedCompletion <= goal.targetDate;
  }
  return { goal, percent: Math.round(percent * 10) / 10, remaining, estimatedCompletion, onTrack };
}

// --------------------------------------------------------------- Liabilities

export interface PayoffScheduleRow {
  month: number;
  date: string;
  payment: number;
  interestPaid: number;
  principalPaid: number;
  remainingBalance: number;
}

/**
 * Amortization schedule. Uses integer math where possible.
 * interestRate is APR percent (e.g. 6.5); balance is signed negative cents.
 * `extra` is an optional additional monthly payment in cents.
 */
export function payoffSchedule(
  balanceCents: number,
  aprPercent: number,
  monthlyPaymentCents: number,
  startDate: string,
  extraCents = 0,
  maxMonths = 600,
): PayoffScheduleRow[] {
  const balance = Math.abs(balanceCents);
  if (balance <= 0) return [];
  const monthlyRate = aprPercent / 100 / 12;
  const rows: PayoffScheduleRow[] = [];
  let remaining = balance;
  let month = 0;
  let date = startDate;

  while (remaining > 0 && month < maxMonths) {
    month++;
    const interest = Math.round(remaining * monthlyRate);
    let payment = Math.min(monthlyPaymentCents + extraCents, remaining + interest);
    if (monthlyPaymentCents <= 0) break;
    const principal = payment - interest;
    remaining = Math.max(0, remaining - principal);
    rows.push({
      month,
      date,
      payment,
      interestPaid: interest,
      principalPaid: principal,
      remainingBalance: remaining,
    });
    const [y, m] = date.split('-').map(Number);
    const nextM = m === 12 ? 1 : m + 1;
    const nextY = m === 12 ? y + 1 : y;
    date = `${nextY}-${String(nextM).padStart(2, '0')}-${String(Math.min(Number(date.slice(8, 10)), new Date(nextY, nextM, 0).getDate())).padStart(2, '0')}`;
  }
  return rows;
}

// ------------------------------------------------------------- Net worth history

export interface NetWorthPoint {
  date: string;
  month: MonthKey;
  assets: number;
  liabilities: number;
  netWorth: number;
}

/**
 * Build a net-worth-over-time series from accounts and transactions.
 * Assumes each account's current balance is `startingBalance + Σ transactions`,
 * and reconstructs historical balances by walking transactions forward.
 */
export function netWorthHistory(
  accounts: Account[],
  transactions: Transaction[],
  monthsBack: number,
): NetWorthPoint[] {
  const current = currentMonthKey();
  const startKey = addMonthsToKey(current, -monthsBack);
  const keys: MonthKey[] = [];
  for (let i = 0; i <= monthsBack; i++) keys.push(addMonthsToKey(startKey, i));

  const txsByAccount = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const arr = txsByAccount.get(t.accountId) ?? [];
    arr.push(t);
    txsByAccount.set(t.accountId, arr);
  }

  // Month-end balances per account.
  const balances = new Map<string, Map<MonthKey, number>>();
  for (const acc of accounts) {
    if (!acc.includeInNetWorth) continue;
    const txs = (txsByAccount.get(acc.id) ?? []).sort((a, b) => a.date.localeCompare(b.date));
    const monthMap = new Map<MonthKey, number>();
    let running = acc.startingBalance;
    let txi = 0;
    for (const key of keys) {
      const end = monthEnd(key);
      while (txi < txs.length && txs[txi].date <= end) {
        running += txs[txi].amount;
        txi++;
      }
      monthMap.set(key, running);
    }
    balances.set(acc.id, monthMap);
  }

  const points: NetWorthPoint[] = [];
  for (const key of keys) {
    let assets = 0;
    let liabilities = 0;
    for (const acc of accounts) {
      if (!acc.includeInNetWorth) continue;
      const bal = balances.get(acc.id)?.get(key) ?? acc.startingBalance;
      if (bal >= 0) assets += bal;
      else liabilities += -bal;
    }
    points.push({ date: monthEnd(key), month: key, assets, liabilities, netWorth: assets - liabilities });
  }
  return points;
}

// --------------------------------------------------------------- Monthly series

export interface MonthlyPoint {
  month: MonthKey;
  income: number;
  expenses: number;
  net: number;
}

/** Group transactions into monthly cash-flow points. */
export function monthlyCashFlow(transactions: Transaction[], monthsBack: number): MonthlyPoint[] {
  const current = currentMonthKey();
  const keys: MonthKey[] = [];
  for (let i = monthsBack; i >= 0; i--) keys.push(addMonthsToKey(current, -i));
  const map = new Map<MonthKey, { income: number; expenses: number }>();
  for (const key of keys) map.set(key, { income: 0, expenses: 0 });
  for (const t of transactions) {
    if (t.type === 'transfer') continue;
    const key = monthKeyOf(t.date);
    const bucket = map.get(key);
    if (!bucket) continue;
    if (t.amount >= 0) bucket.income += t.amount;
    else bucket.expenses += -t.amount;
  }
  return keys.map((key) => {
    const b = map.get(key)!;
    return { month: key, income: b.income, expenses: b.expenses, net: b.income - b.expenses };
  });
}

// ------------------------------------------------------------------- Misc

/** Projected balance for the upcoming N months given recurring series. */
export function upcomingRecurring(
  recurring: RecurringTransaction[],
  months: number,
): { recurring: RecurringTransaction; date: string }[] {
  const today = todayISO();
  const out: { recurring: RecurringTransaction; date: string }[] = [];
  for (const r of recurring) {
    if (!r.active) continue;
    if (r.endDate && r.endDate < today) continue;
    let date = r.nextOccurrence;
    if (!date) date = nextOccurrence(r.interval, r.dayOfMonth, today, r.startDate);
    let guard = 0;
    while (date <= today && guard < 100) {
      date = nextOccurrence(r.interval, r.dayOfMonth, date, r.startDate);
      guard++;
    }
    const horizon = addMonthsToKey(currentMonthKey(), months) + '-31';
    while (date <= horizon && guard < 200) {
      out.push({ recurring: r, date });
      date = nextOccurrence(r.interval, r.dayOfMonth, date, r.startDate);
      guard++;
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ------------------------------------------------------------------ Series

/** Rebuild account balance from transactions: startingBalance + Σ amounts. */
export function computeBalance(account: Account, transactions: Transaction[]): number {
  let bal = account.startingBalance;
  for (const t of transactions) {
    if (t.accountId === account.id) bal += t.amount;
  }
  return bal;
}

// ------------------------------------------------------------ Diagnostics

export interface IntegrityIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  entity: string;
  entityId: string;
}

/** Validate the dataset for integrity problems. */
export function integrityCheck(data: {
  accounts: Account[];
  transactions: Transaction[];
  splits: TransactionSplit[];
  transfers: TransferPair[];
  categories: Category[];
  groups: CategoryGroup[];
  goals: Goal[];
  holdings: Holding[];
  securities: Security[];
  recurring: RecurringTransaction[];
  budgets: Budget[];
  budgetItems: BudgetItem[];
}): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const accIds = new Set(data.accounts.map((a) => a.id));
  const catIds = new Set(data.categories.map((c) => c.id));
  const txnIds = new Set(data.transactions.map((t) => t.id));
  const secIds = new Set(data.securities.map((s) => s.id));

  // Duplicate transaction IDs
  const seen = new Set<string>();
  for (const t of data.transactions) {
    if (seen.has(t.id)) issues.push({ severity: 'error', code: 'DUP_TXN_ID', message: `Duplicate transaction id ${t.id}`, entity: 'transaction', entityId: t.id });
    seen.add(t.id);
  }

  // Invalid account references
  for (const t of data.transactions) {
    if (!accIds.has(t.accountId)) issues.push({ severity: 'error', code: 'BAD_ACCOUNT', message: `Transaction ${t.id} references missing account ${t.accountId}`, entity: 'transaction', entityId: t.id });
    if (t.categoryId && !catIds.has(t.categoryId)) issues.push({ severity: 'error', code: 'BAD_CATEGORY', message: `Transaction ${t.id} references missing category ${t.categoryId}`, entity: 'transaction', entityId: t.id });
    if (t.splitParentId && !txnIds.has(t.splitParentId)) issues.push({ severity: 'error', code: 'BAD_SPLIT_PARENT', message: `Transaction ${t.id} references missing parent ${t.splitParentId}`, entity: 'transaction', entityId: t.id });
  }
  for (const s of data.splits) {
    if (!txnIds.has(s.transactionId)) issues.push({ severity: 'error', code: 'BAD_SPLIT', message: `Split ${s.id} references missing transaction ${s.transactionId}`, entity: 'split', entityId: s.id });
    if (s.categoryId && !catIds.has(s.categoryId)) issues.push({ severity: 'error', code: 'BAD_CATEGORY', message: `Split ${s.id} references missing category ${s.categoryId}`, entity: 'split', entityId: s.id });
  }

  // Broken transfers
  for (const tr of data.transfers) {
    if (!txnIds.has(tr.fromTransactionId) || !txnIds.has(tr.toTransactionId)) {
      issues.push({ severity: 'error', code: 'BROKEN_TRANSFER', message: `Transfer ${tr.id} references missing transactions`, entity: 'transfer', entityId: tr.id });
    }
  }

  // Invalid goal references
  for (const g of data.goals) {
    for (const aid of g.accountIds) {
      if (!accIds.has(aid)) issues.push({ severity: 'warning', code: 'BAD_GOAL_ACCOUNT', message: `Goal ${g.name} references missing account ${aid}`, entity: 'goal', entityId: g.id });
    }
  }

  // Negative balances where inappropriate (asset accounts)
  for (const a of data.accounts) {
    const isLiability = a.type === 'credit-card' || a.type === 'mortgage' || a.type === 'auto-loan' || a.type === 'student-loan' || a.type === 'personal-loan' || a.type === 'other-liability';
    if (!isLiability && a.balance < 0) {
      issues.push({ severity: 'warning', code: 'NEG_ASSET', message: `Asset account "${a.name}" has a negative balance`, entity: 'account', entityId: a.id });
    }
  }

  // Investment inconsistencies
  for (const h of data.holdings) {
    if (!secIds.has(h.securityId)) issues.push({ severity: 'error', code: 'BAD_SECURITY', message: `Holding ${h.id} references missing security ${h.securityId}`, entity: 'holding', entityId: h.id });
    if (h.shares < 0) issues.push({ severity: 'error', code: 'NEG_SHARES', message: `Holding ${h.id} has negative shares`, entity: 'holding', entityId: h.id });
  }

  // Budget item category references
  for (const bi of data.budgetItems) {
    if (!catIds.has(bi.categoryId)) issues.push({ severity: 'error', code: 'BAD_BUDGET_CATEGORY', message: `Budget item ${bi.id} references missing category ${bi.categoryId}`, entity: 'budgetItem', entityId: bi.id });
  }

  // Missing required transaction fields
  for (const t of data.transactions) {
    if (!t.date || !Number.isFinite(t.amount)) issues.push({ severity: 'error', code: 'MISSING_FIELD', message: `Transaction ${t.id} missing date or amount`, entity: 'transaction', entityId: t.id });
  }

  return issues;
}

// ------------------------------------------------------------------ Export

export type { Goal, Liability, RecurringTransaction };
export { monthStart, monthEnd, monthsBetween, currentMonthKey, addMonthsToKey, monthKeyOf } from '../lib/dates';