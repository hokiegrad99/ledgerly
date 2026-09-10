import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, EmptyState, PageLoader, Stat, ProgressBar } from '../components/ui/basic';
import { Modal } from '../components/ui/Modal';
import { LayoutGrid, Plus, ArrowUp, ArrowDown, X, ArrowRight } from 'lucide-react';
import { formatMoney } from '../lib/money';
import {
  netWorthFromAccounts,
  cashFlow,
  budgetSummary,
  budgetRolloverCarryover,
  spendingByCategory,
  netWorthHistory,
  upcomingRecurring,
  goalProgress,
  portfolioSummary,
} from '../domain/calculations';
import { addMonthsToKey, currentMonthKey, monthKeyOf, monthEnd, todayISO } from '../lib/dates';
import type { Transaction, DashboardWidget, DashboardWidgetKind } from '../domain/types';
import { TrendAreaChart, DonutChart, LegendList, CHART_COLORS } from '../components/ui/Charts';

const WIDGET_LABELS: Record<DashboardWidgetKind, string> = {
  'net-worth': 'Net worth',
  'cash-flow': 'Cash flow',
  spending: 'Spending',
  budget: 'Budget',
  'recent-transactions': 'Recent transactions',
  upcoming: 'Upcoming recurring',
  goals: 'Goals',
  investments: 'Investments',
};

function WidgetFrame({ widget, children, onRemove, onMove, canMoveUp, canMoveDown }: {
  widget: DashboardWidget;
  children: React.ReactNode;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Card
      className={widget.size === 'large' ? 'lg:col-span-2' : ''}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {widget.title || WIDGET_LABELS[widget.kind]}
        </h3>
        <div className={`flex items-center gap-0.5 transition-opacity ${hover ? 'opacity-100' : 'opacity-0'} `}>
          <button className="btn-ghost p-1" disabled={!canMoveUp} onClick={() => onMove(widget.id, -1)} aria-label="Move widget up">
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button className="btn-ghost p-1" disabled={!canMoveDown} onClick={() => onMove(widget.id, 1)} aria-label="Move widget down">
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button className="btn-ghost p-1 text-red-500" onClick={() => onRemove(widget.id)} aria-label="Remove widget">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <CardBody className="p-4">{children}</CardBody>
    </Card>
  );
}

export default function DashboardPage() {
  const { accounts, repo, goals, securities, holdings, recurring, budgets, budgetItems, settings, dataVersion, refresh, categoryById, accountById } = useApp();

  const [recentTxns, setRecentTxns] = useState<Transaction[]>([]);
  const [rangeTxns, setRangeTxns] = useState<Transaction[]>([]);
  const [allTxnsForHistory, setAllTxnsForHistory] = useState<Transaction[]>([]);
  const [widgetPickerOpen, setWidgetPickerOpen] = useState(false);

  const month = currentMonthKey();
  const prevMonth = addMonthsToKey(month, -1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const recent = await repo.queryTransactions({ limit: 8, sort: 'date-desc' });
      const range = await repo.transactionsInRange(`${addMonthsToKey(month, -2)}-01`, monthEnd(month));
      const history = await repo.transactionsInRange(undefined, undefined);
      if (!cancelled) {
        setRecentTxns(recent.items);
        setRangeTxns(range);
        setAllTxnsForHistory(history);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, dataVersion.txn, month]);

  const netWorth = useMemo(() => netWorthFromAccounts(accounts), [accounts]);

  const history = useMemo(
    () => netWorthHistory(accounts, allTxnsForHistory, 11).slice(-6),
    [accounts, allTxnsForHistory],
  );

  const thisMonthTxns = useMemo(
    () => rangeTxns.filter((t) => monthKeyOf(t.date) === month),
    [rangeTxns, month],
  );
  const prevMonthTxns = useMemo(
    () => rangeTxns.filter((t) => monthKeyOf(t.date) === prevMonth),
    [rangeTxns, prevMonth],
  );
  const ytdStart = `${month.slice(0, 4)}-01-01`;
  const ytdTxns = useMemo(
    () => rangeTxns.filter((t) => t.date >= ytdStart && t.date <= monthEnd(month)),
    [rangeTxns, ytdStart, month],
  );

  const thisFlow = cashFlow(thisMonthTxns);
  const prevFlow = cashFlow(prevMonthTxns);
  const ytdFlow = cashFlow(ytdTxns);

  const spendByCat = useMemo(() => spendingByCategory(thisMonthTxns, []), [thisMonthTxns]);
  const budget = budgets.find((b) => b.month === month) ?? null;
  const monthBudgetItems = budgetItems.filter((bi) => bi.budgetId === budget?.id);
  const prevMonthBudget = budgets.find((b) => b.month === prevMonth) ?? null;
  const prevMonthBudgetItems = budgetItems.filter((bi) => bi.budgetId === prevMonthBudget?.id);
  const prevSpendByCat = useMemo(() => spendingByCategory(prevMonthTxns, []), [prevMonthTxns]);
  const carryover = useMemo(
    () => budgetRolloverCarryover(prevMonthBudgetItems, prevSpendByCat),
    [prevMonthBudgetItems, prevSpendByCat],
  );
  const bSummary = useMemo(
    () => budgetSummary(budget, monthBudgetItems, spendByCat, carryover),
    [budget, monthBudgetItems, spendByCat, carryover],
  );

  const upcoming = useMemo(() => upcomingRecurring(recurring, 1).slice(0, 6), [recurring]);

  const goalsWithProgress = useMemo(() => goals.map(goalProgress), [goals]);

  const portfolio = useMemo(() => portfolioSummary(holdings, securities, accounts), [holdings, securities, accounts]);

  const spendingByCatList = useMemo(
    () =>
      [...spendByCat.entries()]
        .map(([catId, amount]) => ({ name: categoryById(catId)?.name ?? 'Uncategorized', value: amount }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    [spendByCat, categoryById],
  );

  const widgets = [...useApp().dashboard].sort((a, b) => a.sortOrder - b.sortOrder);
  const moveWidget = async (id: string, dir: -1 | 1) => {
    const sorted = [...widgets].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex((w) => w.id === id);
    const other = idx + dir;
    if (idx < 0 || other < 0 || other >= sorted.length) return;
    const [a, b] = [sorted[idx], sorted[other]];
    const aOrder = a.sortOrder;
    const next = sorted.map((w) => (w.id === a.id ? { ...w, sortOrder: b.sortOrder } : w.id === b.id ? { ...w, sortOrder: aOrder } : w));
    await repo.saveDashboardWidgets(next);
    await refresh();
  };

  const removeWidget = async (id: string) => {
    await repo.saveDashboardWidgets(widgets.filter((w) => w.id !== id));
    await refresh();
  };

  const addWidget = async (kind: DashboardWidgetKind) => {
    const maxOrder = widgets.reduce((m, w) => Math.max(m, w.sortOrder), -1);
    await repo.saveDashboardWidgets([
      ...widgets,
      {
        id: `widget-${kind}-${Date.now()}`,
        kind,
        title: '',
        size: kind === 'recent-transactions' || kind === 'net-worth' ? 'large' : 'medium',
        sortOrder: maxOrder + 1,
        visible: true,
        config: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    await refresh();
    setWidgetPickerOpen(false);
  };

  const visibleWidgets = widgets.filter((w) => w.visible);
  const missingKinds = (Object.keys(WIDGET_LABELS) as DashboardWidgetKind[]).filter((k) => !widgets.some((w) => w.kind === k));

  const renderWidget = (w: DashboardWidget) => {
    void dataVersion;
    switch (w.kind) {
      case 'net-worth':
        return (
          <div>
            <div className="mb-1 flex flex-wrap gap-6">
              <Stat label="Net worth" value={formatMoney(netWorth.netWorth)} sub={`Assets ${formatMoney(netWorth.assets)} · Liabilities ${formatMoney(netWorth.liabilities)}`} />
            </div>
            {history.length > 0 ? (
              <TrendAreaChart data={history.map((h) => ({ label: h.month, value: h.netWorth }))} dataKey="value" />
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">Add accounts to see your net worth trend.</div>
            )}
          </div>
        );
      case 'cash-flow':
        return (
          <div className="grid grid-cols-3 gap-3">
            <Stat label="This month" value={formatMoney(thisFlow.net)} tone={thisFlow.net >= 0 ? 'pos' : 'neg'} sub={`In ${formatMoney(thisFlow.income)} · Out ${formatMoney(thisFlow.expenses)}`} />
            <Stat label="Last month" value={formatMoney(prevFlow.net)} tone={prevFlow.net >= 0 ? 'pos' : 'neg'} sub={`In ${formatMoney(prevFlow.income)} · Out ${formatMoney(prevFlow.expenses)}`} />
            <Stat label="Year to date" value={formatMoney(ytdFlow.net)} tone={ytdFlow.net >= 0 ? 'pos' : 'neg'} sub={`In ${formatMoney(ytdFlow.income)} · Out ${formatMoney(ytdFlow.expenses)}`} />
          </div>
        );
      case 'spending':
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Stat label="Spending this month" value={formatMoney(thisFlow.expenses)} sub={`${spendingByCatList.length} categories`} />
              <div className="mt-3">
                <DonutChart data={spendingByCatList} height={150} formatter={(v) => formatMoney(v)} />
              </div>
            </div>
            <div className="flex flex-col justify-center">
              <LegendList
                items={spendingByCatList.slice(0, 6).map((s, i) => ({ ...s, color: CHART_COLORS[i] }))}
                formatter={(v) => formatMoney(v)}
              />
            </div>
          </div>
        );
      case 'budget':
        return (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Budgeted" value={formatMoney(bSummary.totalBudgeted)} />
              <Stat label="Spent" value={formatMoney(bSummary.totalSpent)} tone={bSummary.totalSpent > bSummary.totalBudgeted ? 'neg' : 'default'} />
              <Stat label="Remaining" value={formatMoney(bSummary.totalRemaining)} tone={bSummary.totalRemaining < 0 ? 'neg' : bSummary.totalRemaining > 0 ? 'pos' : 'default'} />
            </div>
            <ProgressBar value={bSummary.totalBudgeted > 0 ? (bSummary.totalSpent / bSummary.totalBudgeted) * 100 : 0} tone={bSummary.totalSpent > bSummary.totalBudgeted ? 'over' : 'default'} />
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {bSummary.totalBudgeted > 0
                ? `${Math.round((bSummary.totalSpent / bSummary.totalBudgeted) * 100)}% of budget used`
                : 'No budget set for this month'}
            </div>
          </div>
        );
      case 'recent-transactions':
        return (
          <div className="-mx-4 -mb-4 overflow-x-auto">
            <table className="table-base min-w-[560px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {recentTxns.map((t) => (
                  <tr key={t.id}>
                    <td className="whitespace-nowrap text-xs text-slate-500">{t.date}</td>
                    <td className="max-w-[180px] truncate text-sm font-medium text-slate-900 dark:text-slate-100">{t.merchant}</td>
                    <td className="whitespace-nowrap text-xs text-slate-500">{accountById(t.accountId)?.name ?? '—'}</td>
                    <td className="whitespace-nowrap text-xs">{categoryById(t.categoryId)?.name ?? (t.type === 'transfer' ? 'Transfer' : '—')}</td>
                    <td className={`whitespace-nowrap text-right text-sm font-semibold ${t.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {formatMoney(t.amount, accountById(t.accountId)?.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'upcoming':
        return (
          <div className="space-y-2">
            {upcoming.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No upcoming recurring transactions.</div>}
            {upcoming.map(({ recurring: r, date }) => (
              <div key={`${r.id}-${date}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                <div>
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.merchant}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{date} · {r.interval}</div>
                </div>
                <span className={r.amount < 0 ? 'text-sm font-semibold text-slate-900 dark:text-slate-100' : 'text-sm font-semibold text-emerald-600 dark:text-emerald-400'}>
                  {formatMoney(r.amount)}
                </span>
              </div>
            ))}
          </div>
        );
      case 'goals':
        return (
          <div className="space-y-3">
            {goalsWithProgress.length === 0 && <div className="py-6 text-center text-sm text-slate-400">No goals yet — create one in Goals.</div>}
            {goalsWithProgress.slice(0, 4).map(({ goal, percent, remaining }) => (
              <div key={goal.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-800 dark:text-slate-100">{goal.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">{formatMoney(goal.currentAmount)} / {formatMoney(goal.targetAmount)}</span>
                </div>
                <ProgressBar value={percent} tone={percent >= 100 ? 'success' : 'default'} />
                <div className="mt-0.5 text-xs text-slate-400">{percent}% · {formatMoney(remaining)} remaining</div>
              </div>
            ))}
          </div>
        );
      case 'investments':
        return (
          <div>
            <div className="mb-3 flex flex-wrap gap-6">
              <Stat label="Portfolio value" value={formatMoney(portfolio.totalValue)} />
              <Stat
                label="Gain / loss"
                value={`${portfolio.totalGainLoss >= 0 ? '+' : ''}${formatMoney(portfolio.totalGainLoss)}`}
                tone={portfolio.totalGainLoss >= 0 ? 'pos' : 'neg'}
                sub={`${portfolio.totalGainLossPct >= 0 ? '+' : ''}${portfolio.totalGainLossPct}%`}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DonutChart
                data={[...portfolio.bySecurityType.entries()].map(([name, value]) => ({ name, value }))}
                height={150}
                formatter={(v) => formatMoney(v)}
              />
              <div className="flex flex-col justify-center">
                <LegendList
                  items={[...portfolio.bySecurityType.entries()].slice(0, 6).map(([name, value], i) => ({ name, value, color: CHART_COLORS[i] }))}
                  formatter={(v) => formatMoney(v)}
                />
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (!settings) return <PageLoader />;
  void settings;

  return (
    <div>
      <PageHeader
        title={`Welcome${settings.firstName ? `, ${settings.firstName}` : ''}`}
        description={`${monthKeyOf(todayISO())} overview · your data never leaves this device`}
        actions={
          <>
            {missingKinds.length > 0 && (
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setWidgetPickerOpen(true)}>
                Add widget
              </Button>
            )}
            {missingKinds.length === 0 && (
              <Button variant="secondary" icon={<LayoutGrid className="h-4 w-4" />} onClick={() => setWidgetPickerOpen(true)}>
                Customize
              </Button>
            )}
          </>
        }
      />

      {/* Customize hint when widgets were removed */}
      {visibleWidgets.length < Object.keys(WIDGET_LABELS).length && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
          <span>Some widgets are hidden. Hover any widget to reorder or remove it.</span>
          <Button variant="ghost" size="sm" onClick={() => setWidgetPickerOpen(true)}>Customize <ArrowRight className="h-3.5 w-3.5" /></Button>
        </div>
      )}

      {visibleWidgets.length === 0 ? (
        <Card>
          <EmptyState
            icon={<LayoutGrid className="h-6 w-6" />}
            title="Your dashboard is empty"
            description="Add widgets to see your net worth, cash flow, spending, and more."
            action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setWidgetPickerOpen(true)}>Add a widget</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {visibleWidgets.map((w, i) => (
            <WidgetFrame
              key={w.id}
              widget={w}
              onRemove={removeWidget}
              onMove={moveWidget}
              canMoveUp={i > 0}
              canMoveDown={i < visibleWidgets.length - 1}
            >
              {renderWidget(w)}
            </WidgetFrame>
          ))}
        </div>
      )}

      <Modal
        open={widgetPickerOpen}
        onClose={() => setWidgetPickerOpen(false)}
        title="Add a widget"
        size="sm"
      >
        <div className="space-y-2">
          {missingKinds.length === 0 && (
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">All widgets are already on your dashboard. Hover a widget and use the controls to reorder or remove it.</p>
          )}
          {missingKinds.map((k) => (
            <button
              key={k}
              onClick={() => void addWidget(k)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-brand-900/30"
            >
              {WIDGET_LABELS[k]}
              <Plus className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}