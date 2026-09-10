/**
 * CashFlowMapView — Monarch-style cash flow report (part of REQ-033).
 *
 * Matches the reference layout:
 *   • four summary tiles: Total income / Total expenses / Total net income / Savings rate
 *   • "CASH FLOW" header with month navigation
 *   • Sankey: income sources → Income → category groups → categories,
 *     with net income drawn as a "Savings" flow out of Income
 *   • percentages relative to total income; values in dollars and cents
 *
 * Month navigation is local to this view: it intentionally ignores the global
 * date-range filter (Monarch's "This month" behavior) but keeps the account,
 * category, tag, and type filters.
 */
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { Card, CardBody, Button } from '../ui/basic';
import { formatMoney } from '../../lib/money';
import { currentMonthKey, addMonthsToKey, monthStart, monthEnd, formatMonth } from '../../lib/dates';
import { FlowChart, type FlowLink, type FlowNode } from './FlowChart';
import type { ReportFilters, Transaction, TransactionSplit } from '../../domain/types';
import { toCsv, downloadText } from './csv';

interface CatRow { name: string; value: number }

const GROUP_COLORS = [
  '#0ea5e9', '#f59e0b', '#ec4899', '#3c68ee', '#10b981',
  '#8b5cf6', '#f97316', '#14b8a6', '#6366f1', '#84cc16',
  '#ef4444', '#06b6d4',
];
const INCOME_COLOR = '#0ea5e9';
const SAVINGS_COLOR = '#10b981';

/** Aggregate negative (expense) rows by key, positive (income) rows by key. */
function aggregate(
  txns: Transaction[],
  splits: TransactionSplit[],
  splitCatOf: (t: Transaction, s: TransactionSplit) => string | null,
  direction: 'in' | 'out',
  keyOf: (t: Transaction, catId: string | null) => string,
): CatRow[] {
  const map = new Map<string, number>();
  const splitIds = new Set(splits.map((s) => s.transactionId));
  const bump = (key: string, amt: number) => {
    if (amt <= 0) return;
    map.set(key, (map.get(key) ?? 0) + amt);
  };
  for (const t of txns) {
    if (t.type === 'transfer') continue;
    const positive = t.amount > 0;
    if (direction === 'in' && !positive) continue;
    if (direction === 'out' && positive) continue;
    if (splitIds.has(t.id)) continue; // split lines are counted below
    bump(keyOf(t, t.categoryId), direction === 'out' ? -t.amount : t.amount);
  }
  for (const s of splits) {
    const parent = txns.find((t) => t.id === s.transactionId);
    if (!parent || parent.type === 'transfer') continue;
    if (direction === 'in' && parent.amount <= 0) continue;
    if (direction === 'out' && parent.amount > 0) continue;
    bump(keyOf(parent, splitCatOf(parent, s)), direction === 'out' ? -s.amount : s.amount);
  }
  return [...map.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export function CashFlowMapView({ filters }: { filters: ReportFilters }) {
  const { repo, groups, categories, categoryById, dataVersion } = useApp();
  const [month, setMonth] = useState(currentMonthKey());
  const [monthTxns, setMonthTxns] = useState<Transaction[]>([]);
  const [monthSplits, setMonthSplits] = useState<TransactionSplit[]>([]);

  // The month view fetches its own month directly, so month navigation is
  // independent of the report's date-range filter (Monarch behavior). One
  // month of data is a bounded, indexed query. Other filters still apply.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const range = await repo.transactionsInRange(monthStart(month), monthEnd(month));
      const spl = await repo.getSplitsForTransactions(range.map((t) => t.id));
      if (!cancelled) {
        setMonthTxns(range);
        setMonthSplits(spl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, month, dataVersion.txn]);

  const txns = useMemo(() => {
    return monthTxns.filter((t) => {
      if (filters.accountIds && filters.accountIds.length > 0 && !filters.accountIds.includes(t.accountId)) return false;
      if (filters.categoryIds && filters.categoryIds.length > 0 && !(t.categoryId && filters.categoryIds.includes(t.categoryId))) return false;
      if (filters.groupIds && filters.groupIds.length > 0) {
        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : undefined;
        if (!cat || !filters.groupIds.includes(cat.groupId)) return false;
      }
      if (filters.merchant && !(t.merchant || '').toLowerCase().includes(filters.merchant.toLowerCase())) return false;
      if (filters.tagIds && filters.tagIds.length > 0 && !filters.tagIds.some((tg) => t.tagIds?.includes(tg))) return false;
      if (filters.type && t.type !== filters.type) return false;
      return true;
    });
  }, [monthTxns, filters, categories]);

  const monthTxnIds = useMemo(() => new Set(txns.map((t) => t.id)), [txns]);
  const splits = useMemo(() => monthSplits.filter((s) => monthTxnIds.has(s.transactionId)), [monthSplits, monthTxnIds]);
  void splits; // aggregation re-filters monthSplits against the filtered set below

  const incomeRows = useMemo(
    () => aggregate(monthTxns, monthSplits, (_t) => null, 'in', (_t, catId) => (catId ? categoryById(catId)?.name ?? 'Uncategorized' : 'Uncategorized')),
    [monthTxns, monthSplits, categoryById],
  );
  const expenseByCat = useMemo(
    () => aggregate(monthTxns, monthSplits, (_t, s) => s.categoryId, 'out', (_t, catId) => (catId ? categoryById(catId)?.name ?? 'Uncategorized' : 'Uncategorized')),
    [monthTxns, monthSplits, categoryById],
  );
  const expenseByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of monthTxns) {
      if (t.type === 'transfer' || t.amount >= 0) continue;
      const cat = t.categoryId ? categoryById(t.categoryId) : undefined;
      const name = cat ? groups.find((g) => g.id === cat.groupId)?.name ?? 'Other' : 'Uncategorized';
      map.set(name, (map.get(name) ?? 0) + -t.amount);
    }
    for (const s of monthSplits) {
      const parent = monthTxns.find((t) => t.id === s.transactionId);
      if (!parent || parent.type === 'transfer' || parent.amount > 0) continue;
      const cat = s.categoryId ? categoryById(s.categoryId) : undefined;
      const name = cat ? groups.find((g) => g.id === cat.groupId)?.name ?? 'Other' : 'Uncategorized';
      map.set(name, (map.get(name) ?? 0) + -s.amount);
    }
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [monthTxns, monthSplits, categoryById, groups]);

  const totalIncome = incomeRows.reduce((a, r) => a + r.value, 0);
  const totalExpenses = expenseByCat.reduce((a, r) => a + r.value, 0);
  const net = totalIncome - totalExpenses;
  const savingsRate = totalIncome > 0 ? (net / totalIncome) * 100 : 0;

  // ---- Sankey columns ------------------------------------------------------
  const nodes: FlowNode[][] = [];
  const links: FlowLink[] = [];

  // Column 0: income sources (category names of income transactions).
  const incomeColor = (i: number) => (i === 0 ? INCOME_COLOR : '#38bdf8');
  nodes.push(
    incomeRows.slice(0, 6).map((r, i) => ({
      id: `src-${r.name}`,
      label: r.name,
      sublabel: formatMoney(r.value),
      value: r.value,
      color: incomeColor(i),
    })),
  );
  // Column 1: single "Income" node.
  nodes.push([
    {
      id: 'income',
      label: 'Income',
      sublabel: formatMoney(totalIncome),
      value: Math.max(totalIncome, 1),
      color: INCOME_COLOR,
    },
  ]);
  // Column 2: category groups (income flows in too, so groups absorb the total).
  const groupRows = expenseByGroup.slice(0, 9);
  const savings = Math.max(net, 0);
  const groupNodes: FlowNode[] = groupRows.map((r, i) => ({
    id: `grp-${r.name}`,
    label: r.name,
    sublabel: formatMoney(r.value),
    value: r.value,
    color: GROUP_COLORS[i % GROUP_COLORS.length],
  }));
  if (savings > 0 && groupRows.length < 10) {
    groupNodes.unshift({
      id: 'grp-savings',
      label: 'Savings',
      sublabel: `${formatMoney(savings)} (${totalIncome > 0 ? ((savings / totalIncome) * 100).toFixed(2) : '0.00'}%)`,
      value: savings,
      color: SAVINGS_COLOR,
    });
  }
  nodes.push(groupNodes);

  // Column 3: top categories per group (children of their group node).
  const catNodes: FlowNode[] = [];
  const catByGroup = new Map<string, CatRow[]>();
  for (const r of expenseByCat) {
    const cat = categories.find((c) => c.name === r.name);
    const gname = cat ? groups.find((g) => g.id === cat.groupId)?.name ?? 'Other' : 'Uncategorized';
    const arr = catByGroup.get(gname) ?? [];
    if (arr.length < 4) arr.push(r);
    catByGroup.set(gname, arr);
  }
  for (const g of groupRows) {
    for (const c of (catByGroup.get(g.name) ?? []).slice(0, 4)) {
      catNodes.push({
        id: `cat-${c.name}`,
        label: c.name,
        sublabel: formatMoney(c.value),
        value: c.value,
        color: g.value > 0 ? groupNodes.find((n) => n.id === `grp-${g.name}`)?.color ?? '#94a3b8' : '#94a3b8',
      });
    }
  }
  if (catNodes.length > 0) nodes.push(catNodes);

  // Links: sources → income; income → groups (incl. savings).
  for (const s of nodes[0]) links.push({ source: s.id, target: 'income', value: s.value, color: s.color });
  for (const g of groupNodes) links.push({ source: 'income', target: g.id, value: g.value, color: g.color });
  for (const g of groupRows) {
    for (const c of (catByGroup.get(g.name) ?? []).slice(0, 4)) {
      links.push({ source: `grp-${g.name}`, target: `cat-${c.name}`, value: c.value });
    }
  }

  const csvRows = [
    ['Month', formatMonth(month)],
    ['Total income', (totalIncome / 100).toFixed(2)],
    ['Total expenses', (totalExpenses / 100).toFixed(2)],
    ['Net income', (net / 100).toFixed(2)],
    ['Savings rate %', savingsRate.toFixed(2)],
    [],
    ['Type', 'Name', 'Amount', '% of income'],
    ...[
      ...incomeRows.map((r) => ['Income' as const, r.name, r.value] as const),
      ...expenseByCat.map((r) => ['Expense' as const, r.name, r.value] as const),
    ].map(([kind, name, value]) => [kind, name, (value / 100).toFixed(2), totalIncome > 0 ? `${((value / totalIncome) * 100).toFixed(2)}%` : '']),
  ];

  return (
    <div className="space-y-4">
      {/* summary tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Total income', value: formatMoney(totalIncome), tone: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Total expenses', value: formatMoney(totalExpenses), tone: 'text-red-600 dark:text-red-400' },
          { label: 'Total net income', value: formatMoney(net), tone: net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400' },
          { label: 'Savings rate', value: `${savingsRate.toFixed(1)}%`, tone: 'text-slate-900 dark:text-slate-100' },
        ].map((t) => (
          <Card key={t.label}>
            <div className="px-4 py-5 text-center">
              <div className={`text-xl font-semibold ${t.tone}`}>{t.value}</div>
              <div className="mt-1 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{t.label}</div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Cash flow</div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {monthStart(month).slice(0, 10)} – {monthEnd(month).slice(0, 10)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                className="px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                aria-label="Previous month"
                onClick={() => setMonth((m) => addMonthsToKey(m, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[92px] text-center text-xs font-medium text-slate-700 dark:text-slate-200">{formatMonth(month)}</span>
              <button
                className="px-2 py-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
                aria-label="Next month"
                onClick={() => setMonth((m) => addMonthsToKey(m, 1))}
                disabled={month >= currentMonthKey()}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="h-3.5 w-3.5" />}
              onClick={() => downloadText(`cash-flow-${month}.csv`, toCsv(['Type', 'Name', 'Amount', '% of income'], csvRows.slice(7)))}
            >
              Export CSV
            </Button>
          </div>
        </div>
        <CardBody>
          <FlowChart
            columns={nodes}
            links={links}
            height={480}
            percentBaseId="income"
          />
          <p className="mt-2 text-xs text-slate-400">
            Transfers and excluded accounts are not shown. Percentages are relative to total income. Savings = income − expenses for {formatMonth(month)}. Month navigation is independent of the date-range filter; account, category, and tag filters still apply.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
