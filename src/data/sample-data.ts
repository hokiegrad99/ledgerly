/**
 * Sample / demo data.
 *
 * Entirely fictional — no real financial institutions, people, or transactions.
 * Clearly labeled in the UI as sample data. Used for onboarding and demos.
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
  InvestmentTransaction,
  Liability,
  RecurringTransaction,
  Security,
  Tag,
  Transaction,
  TransactionRule,
  TransactionSplit,
  TransferPair,
  UserSettings,
} from '../domain/types';
import { newId, nowISO } from '../lib/id';
import { addDays, todayISO } from '../lib/dates';
import { buildDefaultCategorySeed } from '../domain/defaults';

interface DemoData {
  accounts: Account[];
  categoryGroups: CategoryGroup[];
  groups: CategoryGroup[];
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
  importMappings: ImportMapping[];
  settings: UserSettings;
}

export function buildSampleData(): DemoData {
  const now = nowISO();
  const t0 = todayISO();
  const t = (daysAgo: number) => addDays(t0, -daysAgo);

  const { groups, categories } = buildDefaultCategorySeed();
  const find = (groupName: string, catName: string): string => {
    const g = groups.find((x) => x.name === groupName);
    const c = g ? categories.find((x) => x.groupId === g.id && x.name === catName) : undefined;
    return c?.id ?? '';
  };

  const tags: Tag[] = [
    { id: newId(), name: 'Household', createdAt: now, updatedAt: now },
    { id: newId(), name: 'Work', createdAt: now, updatedAt: now },
    { id: newId(), name: 'Travel', createdAt: now, updatedAt: now },
    { id: newId(), name: 'Gift', createdAt: now, updatedAt: now },
  ];

  const mkAccount = (partial: Partial<Account> & Pick<Account, 'name' | 'type'>): Account => ({
    id: newId(),
    institution: '',
    lastFour: '',
    balance: 0,
    startingBalance: 0,
    currency: 'USD',
    notes: '',
    active: true,
    includeInNetWorth: true,
    includeInBudget: true,
    includeInReports: true,
    createdAt: now,
    updatedAt: now,
    ...partial,
  });

  const checking = mkAccount({
    name: 'Everyday Checking',
    institution: 'First Community Bank',
    type: 'checking',
    lastFour: '4821',
    startingBalance: 125000, // $1,250
  });
  const savings = mkAccount({
    name: 'High-Yield Savings',
    institution: 'First Community Bank',
    type: 'savings',
    lastFour: '9034',
    startingBalance: 2500000, // $25,000
  });
  const creditCard = mkAccount({
    name: 'Rewards Card',
    institution: 'First Community Bank',
    type: 'credit-card',
    lastFour: '1176',
    startingBalance: -184300, // -$1,843
  });
  const brokerage = mkAccount({
    name: 'Brokerage Account',
    institution: 'Summit Securities',
    type: 'brokerage',
    lastFour: '5520',
    startingBalance: 0,
  });
  const retirement = mkAccount({
    name: '401(k)',
    institution: 'Summit Securities',
    type: '401k',
    lastFour: '8812',
    startingBalance: 4200000, // $42,000
  });
  const mortgage = mkAccount({
    name: 'Home Mortgage',
    institution: 'Lakeshore Lending',
    type: 'mortgage',
    lastFour: '3345',
    startingBalance: -28500000, // -$285,000
  });
  const accounts = [checking, savings, creditCard, brokerage, retirement, mortgage];

  // ---- Transactions: build a realistic ~9 month history ----
  const txns: Transaction[] = [];
  let runningChecking = checking.startingBalance;
  let runningSavings = savings.startingBalance;
  let runningCC = creditCard.startingBalance;
  let runningBrokerage = brokerage.startingBalance;

  const mkTx = (
    partial: Partial<Transaction> & Pick<Transaction, 'date' | 'amount' | 'merchant'>,
    account: Account,
  ): Transaction => {
    const tx: Transaction = {
      id: newId(),
      accountId: account.id,
      categoryId: null,
      tagIds: [],
      notes: '',
      type: partial.amount < 0 ? 'expense' : 'income',
      cleared: true,
      pending: false,
      reviewed: true,
      transferId: null,
      recurringId: null,
      externalId: null,
      splitParentId: null,
      importSessionId: null,
      originalDescription: partial.merchant,
      createdAt: now,
      updatedAt: now,
      ...partial,
    };
    if (account.id === checking.id) runningChecking += tx.amount;
    else if (account.id === savings.id) runningSavings += tx.amount;
    else if (account.id === creditCard.id) runningCC += tx.amount;
    else if (account.id === brokerage.id) runningBrokerage += tx.amount;
    txns.push(tx);
    return tx;
  };

  // Payroll (biweekly, checking, income)
  for (let i = 0; i < 19; i++) {
    const daysAgo = 14 * i + 2;
    mkTx({ date: t(daysAgo), amount: 232050, merchant: 'Acme Corp — Payroll', type: 'income', categoryId: find('Income', 'Salary') }, checking);
  }
  // Rent (monthly, checking)
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 3), amount: -185000, merchant: 'Harbor View Apartments', categoryId: find('Housing', 'Rent') }, checking);
  }
  // Utilities (monthly, checking)
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 5), amount: -8900, merchant: 'City Power & Light', categoryId: find('Housing', 'Utilities') }, checking);
    mkTx({ date: t(30 * i + 7), amount: -4700, merchant: 'NJ Natural Gas', categoryId: find('Housing', 'Utilities'), tagIds: [tags[0].id] }, checking);
  }
  // Internet
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 6), amount: -6499, merchant: 'Comcast Internet', categoryId: find('Housing', 'Internet & Phone') }, checking);
  }
  // Phone
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 8), amount: -5599, merchant: 'Verizon Wireless', categoryId: find('Housing', 'Internet & Phone') }, checking);
  }
  // Savings transfer (monthly)
  for (let i = 0; i < 9; i++) {
    const from = mkTx({ date: t(30 * i + 9), amount: -100000, merchant: 'Transfer to Savings', type: 'transfer', categoryId: find('Transfers', 'Savings Transfer'), reviewed: false }, checking);
    const to = mkTx({ date: t(30 * i + 9), amount: 100000, merchant: 'Transfer from Checking', type: 'transfer', categoryId: find('Transfers', 'Savings Transfer'), reviewed: false }, savings);
    from.transferId = to.id;
    to.transferId = from.id;
  }
  // Credit card payment (monthly, checking -> credit card)
  for (let i = 0; i < 9; i++) {
    const from = mkTx({ date: t(30 * i + 12), amount: -210000, merchant: 'Credit Card Payment', type: 'transfer', categoryId: find('Transfers', 'Credit Card Payment') }, checking);
    const to = mkTx({ date: t(30 * i + 12), amount: 210000, merchant: 'Payment Received', type: 'transfer', categoryId: find('Transfers', 'Credit Card Payment') }, creditCard);
    from.transferId = to.id;
    to.transferId = from.id;
  }
  // Brokerage contributions (monthly)
  for (let i = 0; i < 8; i++) {
    const from = mkTx({ date: t(30 * i + 14), amount: -150000, merchant: 'Transfer to Brokerage', type: 'transfer', categoryId: find('Transfers', 'Investment Transfer') }, checking);
    const to = mkTx({ date: t(30 * i + 14), amount: 150000, merchant: 'Transfer from Checking', type: 'transfer', categoryId: find('Transfers', 'Investment Transfer') }, brokerage);
    from.transferId = to.id;
    to.transferId = from.id;
  }

  // ---- Credit card spending ----
  const spend = (daysAgo: number, amount: number, merchant: string, cat: string, tag?: Tag) => {
    mkTx({ date: t(daysAgo), amount: -amount, merchant, categoryId: find('Shopping', cat), tagIds: tag ? [tag.id] : [] }, creditCard);
  };
  // Groceries weekly-ish
  for (let i = 0; i < 36; i++) {
    mkTx({ date: t(7 * i + 1), amount: -(5800 + (i % 4) * 900), merchant: 'Whole Foods Market', categoryId: find('Food', 'Groceries') }, creditCard);
    mkTx({ date: t(7 * i + 3), amount: -(4200 + (i % 3) * 1100), merchant: 'Trader Joe\'s', categoryId: find('Food', 'Groceries') }, creditCard);
  }
  // Restaurants
  for (let i = 0; i < 24; i++) {
    mkTx({ date: t(5 * i + 2), amount: -(3200 + (i % 6) * 800), merchant: 'Chipotle', categoryId: find('Food', 'Restaurants') }, creditCard);
    mkTx({ date: t(9 * i + 4), amount: -(7800 + (i % 4) * 1500), merchant: 'Olive Garden', categoryId: find('Food', 'Restaurants') }, creditCard);
  }
  // Coffee
  for (let i = 0; i < 30; i++) {
    mkTx({ date: t(4 * i + 1), amount: -(425 + (i % 3) * 100), merchant: 'Starbucks', categoryId: find('Food', 'Coffee') }, creditCard);
  }
  // Gas
  for (let i = 0; i < 16; i++) {
    mkTx({ date: t(12 * i + 2), amount: -(4100 + (i % 4) * 700), merchant: 'Shell', categoryId: find('Transportation', 'Gas') }, creditCard);
  }
  // Amazon shopping
  spend(2, 8475, 'Amazon.com', 'Online Shopping');
  spend(9, 12999, 'Amazon.com', 'Online Shopping');
  spend(16, 4899, 'Amazon.com', 'Online Shopping');
  spend(23, 15999, 'Amazon.com', 'Online Shopping', tags[1]);
  spend(31, 3299, 'Amazon.com', 'Online Shopping');
  // Streaming subscriptions
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 2), amount: -1549, merchant: 'Netflix', categoryId: find('Personal', 'Subscriptions') }, creditCard);
    mkTx({ date: t(30 * i + 4), amount: -1099, merchant: 'Spotify', categoryId: find('Entertainment', 'Music') }, creditCard);
    mkTx({ date: t(30 * i + 6), amount: -1399, merchant: 'iCloud Storage', categoryId: find('Personal', 'Subscriptions') }, creditCard);
  }
  // Gym
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 10), amount: -3999, merchant: 'Planet Fitness', categoryId: find('Health', 'Fitness') }, creditCard);
  }
  // Misc
  spend(5, 6350, 'Target', 'Home Goods');
  spend(12, 4599, 'Walgreens', 'Pharmacy', tags[0]);
  spend(19, 12500, 'Kohls', 'Clothing');
  spend(27, 23800, 'Best Buy', 'Electronics');
  spend(34, 7900, 'Home Depot', 'Home Goods');
  spend(41, 5450, 'Old Navy', 'Clothing');
  spend(48, 32900, 'Costco', 'Groceries');
  // Travel (tagged)
  mkTx({ date: t(45), amount: -34200, merchant: 'Delta Air Lines', categoryId: find('Travel', 'Flights'), tagIds: [tags[2].id] }, creditCard);
  mkTx({ date: t(43), amount: -18700, merchant: 'Hilton Hotels', categoryId: find('Travel', 'Hotels'), tagIds: [tags[2].id] }, creditCard);
  mkTx({ date: t(60), amount: -16800, merchant: 'Uber', categoryId: find('Transportation', 'Rideshare'), tagIds: [tags[2].id] }, creditCard);
  // Interest income
  for (let i = 0; i < 8; i++) {
    mkTx({ date: t(30 * i + 15), amount: 980 + i * 15, merchant: 'Interest Earned', type: 'income', categoryId: find('Income', 'Interest Income') }, savings);
  }
  // Refund
  mkTx({ date: t(20), amount: 2999, merchant: 'Refund — Amazon.com', categoryId: find('Income', 'Refunds') }, creditCard);

  // Mortgage payment (monthly)
  for (let i = 0; i < 9; i++) {
    mkTx({ date: t(30 * i + 1), amount: -191000, merchant: 'Lakeshore Lending Mortgage', categoryId: find('Housing', 'Mortgage') }, checking);
  }

  // ---- Recurring ----
  const recurring: RecurringTransaction[] = [
    { id: newId(), merchant: 'Netflix', amount: -1549, categoryId: find('Personal', 'Subscriptions'), accountId: creditCard.id, interval: 'monthly', dayOfMonth: 2, startDate: t(270), endDate: null, lastOccurrence: t(2), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Spotify', amount: -1099, categoryId: find('Entertainment', 'Music'), accountId: creditCard.id, interval: 'monthly', dayOfMonth: 4, startDate: t(270), endDate: null, lastOccurrence: t(4), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Acme Corp — Payroll', amount: 232050, categoryId: find('Income', 'Salary'), accountId: checking.id, interval: 'biweekly', dayOfMonth: 2, startDate: t(270), endDate: null, lastOccurrence: t(2), nextOccurrence: null, type: 'income', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Harbor View Apartments', amount: -185000, categoryId: find('Housing', 'Rent'), accountId: checking.id, interval: 'monthly', dayOfMonth: 3, startDate: t(270), endDate: null, lastOccurrence: t(3), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'City Power & Light', amount: -8900, categoryId: find('Housing', 'Utilities'), accountId: checking.id, interval: 'monthly', dayOfMonth: 5, startDate: t(270), endDate: null, lastOccurrence: t(5), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Comcast Internet', amount: -6499, categoryId: find('Housing', 'Internet & Phone'), accountId: checking.id, interval: 'monthly', dayOfMonth: 6, startDate: t(270), endDate: null, lastOccurrence: t(6), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Verizon Wireless', amount: -5599, categoryId: find('Housing', 'Internet & Phone'), accountId: checking.id, interval: 'monthly', dayOfMonth: 8, startDate: t(270), endDate: null, lastOccurrence: t(8), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
    { id: newId(), merchant: 'Planet Fitness', amount: -3999, categoryId: find('Health', 'Fitness'), accountId: creditCard.id, interval: 'monthly', dayOfMonth: 10, startDate: t(270), endDate: null, lastOccurrence: t(10), nextOccurrence: null, type: 'expense', autoCreated: true, active: true, createdAt: now, updatedAt: now },
  ];

  // ---- Budgets ----
  const month = t0.slice(0, 7);
  const budgetId = newId();
  const budget: Budget = { id: budgetId, month, mode: 'category', flexAmount: null, createdAt: now, updatedAt: now };
  const budgetItems: BudgetItem[] = [
    { id: newId(), budgetId, categoryId: find('Housing', 'Rent'), amount: 185000, rollover: false, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Housing', 'Utilities'), amount: 15000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Housing', 'Internet & Phone'), amount: 12500, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Food', 'Groceries'), amount: 45000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Food', 'Restaurants'), amount: 25000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Food', 'Coffee'), amount: 8000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Transportation', 'Gas'), amount: 20000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Health', 'Fitness'), amount: 4000, rollover: false, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Personal', 'Subscriptions'), amount: 3200, rollover: false, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Shopping', 'Online Shopping'), amount: 15000, rollover: true, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Entertainment', 'Music'), amount: 1100, rollover: false, createdAt: now, updatedAt: now },
    { id: newId(), budgetId, categoryId: find('Housing', 'Mortgage'), amount: 191000, rollover: false, createdAt: now, updatedAt: now },
  ];

  // ---- Goals ----
  const goals: Goal[] = [
    { id: newId(), name: 'Emergency Fund', type: 'emergency-fund', targetAmount: 1000000, currentAmount: 250000, targetDate: null, monthlyContribution: 100000, accountIds: [savings.id], notes: '6 months of expenses', completed: false, createdAt: now, updatedAt: now },
    { id: newId(), name: 'Summer Vacation', type: 'vacation', targetAmount: 400000, currentAmount: 135000, targetDate: addDays(t0, 180), monthlyContribution: 45000, accountIds: [savings.id], notes: 'Two weeks in Portugal', completed: false, createdAt: now, updatedAt: now },
    { id: newId(), name: 'New Car', type: 'major-purchase', targetAmount: 3500000, currentAmount: 650000, targetDate: addDays(t0, 540), monthlyContribution: 60000, accountIds: [savings.id], notes: '', completed: false, createdAt: now, updatedAt: now },
  ];

  // ---- Investments ----
  const vti: Security = { id: newId(), symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', type: 'etf', assetClass: 'US Equities', currency: 'USD', createdAt: now, updatedAt: now };
  const vxus: Security = { id: newId(), symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', type: 'etf', assetClass: 'International Equities', currency: 'USD', createdAt: now, updatedAt: now };
  const bnd: Security = { id: newId(), symbol: 'BND', name: 'Vanguard Total Bond Market ETF', type: 'bond', assetClass: 'Bonds', currency: 'USD', createdAt: now, updatedAt: now };
  const spy: Security = { id: newId(), symbol: 'SPY', name: 'SPDR S&P 500 ETF', type: 'etf', assetClass: 'US Equities', currency: 'USD', createdAt: now, updatedAt: now };
  const aapl: Security = { id: newId(), symbol: 'AAPL', name: 'Apple Inc.', type: 'stock', assetClass: 'US Equities', currency: 'USD', createdAt: now, updatedAt: now };
  const btc: Security = { id: newId(), symbol: 'BTC', name: 'Bitcoin', type: 'crypto', assetClass: 'Crypto', currency: 'USD', createdAt: now, updatedAt: now };
  const securities = [vti, vxus, bnd, spy, aapl, btc];

  const holdings: Holding[] = [
    { id: newId(), accountId: brokerage.id, securityId: vti.id, shares: 46.5, costBasis: 680000, currentPrice: 25600, createdAt: now, updatedAt: now },
    { id: newId(), accountId: brokerage.id, securityId: vxus.id, shares: 22.0, costBasis: 310000, currentPrice: 5720, createdAt: now, updatedAt: now },
    { id: newId(), accountId: brokerage.id, securityId: bnd.id, shares: 35.0, costBasis: 280000, currentPrice: 7250, createdAt: now, updatedAt: now },
    { id: newId(), accountId: brokerage.id, securityId: aapl.id, shares: 12.0, costBasis: 420000, currentPrice: 22850, createdAt: now, updatedAt: now },
    { id: newId(), accountId: brokerage.id, securityId: btc.id, shares: 0.05, costBasis: 22000, currentPrice: 6400000, createdAt: now, updatedAt: now },
    { id: newId(), accountId: retirement.id, securityId: spy.id, shares: 160.0, costBasis: 4000000, currentPrice: 52100, createdAt: now, updatedAt: now },
    { id: newId(), accountId: retirement.id, securityId: vti.id, shares: 10.0, costBasis: 180000, currentPrice: 25600, createdAt: now, updatedAt: now },
  ];

  const investmentTransactions: InvestmentTransaction[] = [];
  for (let i = 0; i < 8; i++) {
    investmentTransactions.push({ id: newId(), accountId: brokerage.id, securityId: vti.id, date: t(30 * i + 14), type: 'buy', shares: 5, price: 24500, amount: 122500, fees: 0, notes: 'Monthly contribution', createdAt: now, updatedAt: now });
    investmentTransactions.push({ id: newId(), accountId: retirement.id, securityId: spy.id, date: t(14 * i + 3), type: 'buy', shares: 2.5, price: 49800, amount: 124500, fees: 0, notes: 'Payroll deduction', createdAt: now, updatedAt: now });
  }
  investmentTransactions.push({ id: newId(), accountId: brokerage.id, securityId: null, date: t(30), type: 'dividend', shares: 0, price: 0, amount: 2300, fees: 0, notes: 'Quarterly dividend', createdAt: now, updatedAt: now });

  // ---- Liabilities ----
  const liabilities: Liability[] = [
    { id: newId(), accountId: mortgage.id, interestRate: 6.4, minimumPayment: 191000, paymentDay: 1, originalBalance: 32000000, payoffStrategy: 'avalanche', createdAt: now, updatedAt: now },
  ];

  // Compute final balances.
  const balanceOf = (account: Account, txns: Transaction[]): number => {
    let bal = account.startingBalance;
    for (const tx of txns) if (tx.accountId === account.id) bal += tx.amount;
    return bal;
  };
  const finalAccounts = accounts.map((a) => ({ ...a, balance: balanceOf(a, txns) }));

  return {
    accounts: finalAccounts,
    categoryGroups: groups,
    groups,
    categories,
    tags,
    transactions: txns,
    splits: [],
    transfers: [],
    rules: [],
    budgets: [budget],
    budgetItems,
    goals,
    recurring,
    securities,
    holdings,
    investmentTransactions,
    liabilities,
    dashboard: [],
    importMappings: [],
    settings: {
      theme: 'system',
      currency: 'USD',
      dateFormat: 'YYYY-MM-DD',
      weekStart: 'sunday',
      firstName: 'Alex',
      householdName: 'The Morgan Household',
      lastFlexAmount: null,
      demoDataLoaded: true,
    },
  };
}