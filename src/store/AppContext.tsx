/**
 * AppContext — global application state.
 *
 * Holds the reference data (accounts, categories, tags, rules, etc.) in React
 * state. Transactions are intentionally NOT loaded here — they're queried
 * on demand by pages to keep memory bounded (100k+ transactions).
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
  SavedReport,
  Security,
  Tag,
  TransactionRule,
  UserSettings,
} from '../domain/types';
import { DEFAULT_SETTINGS } from '../domain/types';
import type { DataRepository } from '../data/repository';
import { IndexedDBRepository } from '../data/indexeddb-repository';
import { buildDefaultCategorySeed } from '../domain/defaults';
import { todayISO } from '../lib/dates';

export interface DataVersion {
  /** Bumped whenever reference data changes. */
  ref: number;
  /** Bumped whenever transactions change. */
  txn: number;
}

interface AppContextValue {
  ready: boolean;
  /** Storage mode label for the UI ("Local — this device only"). */
  storageMode: 'local' | 'server';
  /** True once the initial data load has completed and counts are known. */
  transactionsLoaded: boolean;
  transactionCount: number;
  repo: DataRepository;
  accounts: Account[];
  groups: CategoryGroup[];
  categories: Category[];
  tags: Tag[];
  rules: TransactionRule[];
  recurring: RecurringTransaction[];
  goals: Goal[];
  securities: Security[];
  holdings: Holding[];
  investmentTransactions: InvestmentTransaction[];
  liabilities: Liability[];
  budgets: Budget[];
  budgetItems: BudgetItem[];
  dashboard: DashboardWidget[];
  savedReports: SavedReport[];
  importMappings: ImportMapping[];
  settings: UserSettings;
  dataVersion: DataVersion;
  /** Re-load all reference data from the repo. */
  refresh: () => Promise<void>;
  /** Bump the transaction version (after saving/deleting transactions). */
  bumpTxn: () => void;
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>;
  categoryById: (id: string | null | undefined) => Category | undefined;
  accountById: (id: string | null | undefined) => Account | undefined;
  groupById: (id: string | null | undefined) => CategoryGroup | undefined;
  tagById: (id: string | null | undefined) => Tag | undefined;
  categoryName: (id: string | null | undefined) => string;
  accountName: (id: string | null | undefined) => string;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

/** Apply theme class to <html>. */
function applyTheme(settings: UserSettings): void {
  const root = document.documentElement;
  const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const dark = settings.theme === 'dark' || (settings.theme === 'system' && systemDark);
  root.classList.toggle('dark', dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0f172a' : '#ffffff');
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const repoRef = useRef<DataRepository | null>(null);
  if (!repoRef.current) repoRef.current = new IndexedDBRepository();
  const repo = repoRef.current;

  const [ready, setReady] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [securities, setSecurities] = useState<Security[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [investmentTransactions, setInvestmentTransactions] = useState<InvestmentTransaction[]>([]);
  const [liabilities, setLiabilities] = useState<Liability[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [budgetItems, setBudgetItems] = useState<BudgetItem[]>([]);
  const [dashboard, setDashboard] = useState<DashboardWidget[]>([]);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [importMappings, setImportMappings] = useState<ImportMapping[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [transactionCount, setTransactionCount] = useState(0);
  const [dataVersion, setDataVersion] = useState<DataVersion>({ ref: 0, txn: 0 });

  const refresh = useCallback(async () => {
    const [accs, grps, cats, tgs, rls, rec, gls, secs, holds, inv, liabs, bds, dash, reports, st, mappings] = await Promise.all([
      repo.getAccounts(),
      repo.getCategoryGroups(),
      repo.getCategories(),
      repo.getTags(),
      repo.getRules(),
      repo.getRecurring(),
      repo.getGoals(),
      repo.getSecurities(),
      repo.getHoldings(),
      repo.getInvestmentTransactions(),
      repo.getLiabilities(),
      repo.getBudgets(),
      repo.getDashboardWidgets(),
      repo.getSavedReports(),
      repo.getSettings(),
      repo.getImportMappings(),
    ]);
    // Budget items for all budgets (bounded in practice).
    const bis: BudgetItem[] = [];
    for (const b of bds) bis.push(...(await repo.getBudgetItems(b.id)));
    setAccounts(accs);
    setGroups(grps);
    setCategories(cats);
    setTags(tgs);
    setRules(rls);
    setRecurring(rec);
    setGoals(gls);
    setSecurities(secs);
    setHoldings(holds);
    setInvestmentTransactions(inv);
    setLiabilities(liabs);
    setBudgets(bds);
    setBudgetItems(bis);
    setDashboard(dash);
    setSavedReports(reports);
    setImportMappings(mappings);
    if (st) {
      setSettings({ ...DEFAULT_SETTINGS, ...st });
      applyTheme({ ...DEFAULT_SETTINGS, ...st });
    } else {
      setSettings(DEFAULT_SETTINGS);
      applyTheme(DEFAULT_SETTINGS);
    }
    const count = await repo.stats().then((s) => s.transactionCount).catch(() => 0);
    setTransactionCount(count);
    setDataVersion((v) => ({ ...v, ref: v.ref + 1 }));
    setReady(true);
  }, [repo]);

  const bumpTxn = useCallback(() => {
    setDataVersion((v) => ({ ...v, txn: v.txn + 1 }));
  }, []);

  const updateSettings = useCallback(
    async (patch: Partial<UserSettings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      applyTheme(next);
      await repo.saveSettings(next);
      setDataVersion((v) => ({ ...v, ref: v.ref + 1 }));
    },
    [settings, repo],
  );

  // Initial load: seed categories/tags on very first run, then refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const existing = await repo.getCategoryGroups();
      if (existing.length === 0) {
        const seed = buildDefaultCategorySeed();
        await repo.saveCategoryGroups?.(seed.groups);
        await repo.saveCategories(seed.categories);
      }
      const tags = await repo.getTags();
      // Ensure system tags exist.
      const sysRepo = repo as IndexedDBRepository;
      await sysRepo.ensureSystemTags?.();
      void tags;
      // Default dashboard widgets.
      const widgets = await repo.getDashboardWidgets();
      if (widgets.length === 0) {
        await repo.saveDashboardWidgets(defaultWidgets());
      }
      if (!cancelled) await refresh();
    })().catch((err) => {
      console.error('App init failed', err);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for system theme changes when in "system" mode.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const onChange = () => applyTheme(settings);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [settings]);

  const value = useMemo<AppContextValue>(() => {
    const catMap = new Map(categories.map((c) => [c.id, c]));
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const grpMap = new Map(groups.map((g) => [g.id, g]));
    const tagMap = new Map(tags.map((t) => [t.id, t]));
    return {
      ready,
      storageMode: 'local',
      transactionsLoaded: true,
      transactionCount,
      repo,
      accounts,
      groups,
      categories,
      tags,
      rules,
      recurring,
      goals,
      securities,
      holdings,
      investmentTransactions,
      liabilities,
      budgets,
      budgetItems,
      dashboard,
      savedReports,
      importMappings,
      settings,
      dataVersion,
      refresh,
      bumpTxn,
      updateSettings,
      categoryById: (id) => (id ? catMap.get(id) : undefined),
      accountById: (id) => (id ? accMap.get(id) : undefined),
      groupById: (id) => (id ? grpMap.get(id) : undefined),
      tagById: (id) => (id ? tagMap.get(id) : undefined),
      categoryName: (id) => (id ? catMap.get(id)?.name ?? 'Uncategorized' : 'Uncategorized'),
      accountName: (id) => (id ? accMap.get(id)?.name ?? 'Deleted account' : '—'),
    };
  }, [ready, accounts, groups, categories, tags, rules, recurring, goals, securities, holdings, investmentTransactions, liabilities, budgets, budgetItems, dashboard, savedReports, importMappings, settings, transactionCount, repo, refresh, bumpTxn]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function defaultWidgets(): DashboardWidget[] {
  const now = todayISO();
  const kinds: DashboardWidget['kind'][] = ['net-worth', 'cash-flow', 'spending', 'budget', 'recent-transactions', 'upcoming', 'goals', 'investments'];
  return kinds.map((kind, i) => ({
    id: `widget-${kind}`,
    kind,
    title: '',
    size: kind === 'recent-transactions' || kind === 'net-worth' ? 'large' : 'medium',
    sortOrder: i,
    visible: true,
    config: {},
    createdAt: now,
    updatedAt: now,
  }));
}

/** Hook for components that need a fresh transaction query when data changes. */
export function useTxnVersion(): number {
  const { dataVersion } = useApp();
  return dataVersion.txn;
}