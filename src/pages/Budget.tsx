import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Copy, Save, PiggyBank } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, EmptyState, ProgressBar, Stat, Badge } from '../components/ui/basic';
import { AmountInput } from '../components/ui/form';
import type { Budget, BudgetItem, Category } from '../domain/types';
import { budgetSummary, budgetRolloverCarryover, spendingByCategory } from '../domain/calculations';
import { addMonthsToKey, currentMonthKey, formatMonth, monthEnd, monthStart, monthsBetween } from '../lib/dates';
import { newId, nowISO } from '../lib/id';
import { formatMoney } from '../lib/money';

export default function BudgetPage() {
  const { repo, groups, categories, budgetItems, budgets, dataVersion, refresh, bumpTxn } = useApp();
  const [month, setMonth] = useState(currentMonthKey());
  const [txns, setTxns] = useState<Awaited<ReturnType<typeof repo.transactionsInRange>>>([]);
  const [prevTxns, setPrevTxns] = useState<Awaited<ReturnType<typeof repo.transactionsInRange>>>([]);
  const [drafts, setDrafts] = useState<Map<string, number | null>>(new Map());
  const [rolloverDrafts, setRolloverDrafts] = useState<Map<string, boolean>>(new Map());
  const [flexDraft, setFlexDraft] = useState<string>('');
  const [saved, setSaved] = useState(false);

  const budget = budgets.find((b) => b.month === month) ?? null;
  const monthBudgetItems = useMemo(
    () => budgetItems.filter((bi) => bi.budgetId === budget?.id),
    [budgetItems, budget],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prevKey = addMonthsToKey(month, -1);
      const [range, prevRange] = await Promise.all([
        repo.transactionsInRange(monthStart(month), monthEnd(month)),
        repo.transactionsInRange(monthStart(prevKey), monthEnd(prevKey)),
      ]);
      if (!cancelled) {
        setTxns(range);
        setPrevTxns(prevRange);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, month, dataVersion.txn]);

  // Initialize drafts when the month or budget changes.
  useEffect(() => {
    const map = new Map<string, number | null>();
    const roMap = new Map<string, boolean>();
    for (const bi of monthBudgetItems) {
      map.set(bi.categoryId, bi.amount);
      roMap.set(bi.categoryId, bi.rollover);
    }
    setDrafts(map);
    setRolloverDrafts(roMap);
    setFlexDraft(budget?.flexAmount != null ? String(budget.flexAmount / 100) : '');
    setSaved(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, budget?.id, monthBudgetItems.length]);

  const isFlex = budget?.mode === 'flex';
  const mode = budget?.mode ?? 'category';

  const spendByCat = useMemo(() => spendingByCategory(txns, []), [txns]);
  const prevMonth = addMonthsToKey(month, -1);
  const prevBudget = budgets.find((b) => b.month === prevMonth) ?? null;
  const prevBudgetItems = budgetItems.filter((bi) => bi.budgetId === prevBudget?.id);
  const prevSpendByCat = useMemo(() => spendingByCategory(prevTxns, []), [prevTxns]);
  const carryover = useMemo(
    () => budgetRolloverCarryover(prevBudgetItems, prevSpendByCat),
    [prevBudgetItems, prevSpendByCat],
  );
  const bSummary = useMemo(
    () => budgetSummary(budget, monthBudgetItems, spendByCat, carryover),
    [budget, monthBudgetItems, spendByCat, carryover],
  );

  // Only expense categories that are actually used in budgets or spending.
  const expenseCats = useMemo(() => {
    const groupsByKind = groups.filter((g) => !g.archived && g.kind === 'expense');
    const cats = categories.filter((c) => !c.archived);
    const map = new Map<string, Category[]>();
    for (const g of groupsByKind) map.set(g.id, []);
    for (const c of cats) {
      if (map.has(c.groupId)) map.get(c.groupId)!.push(c);
    }
    // Include categories with spending even if their group is income-ish (e.g. refunds).
    return [...map.entries()].map(([gid, cs]) => ({ group: groups.find((g) => g.id === gid)!, cats: cs }));
  }, [groups, categories]);

  const saveCategoryBudget = async () => {
    if (!budget) {
      // Create the budget row first.
      const b: Budget = {
        id: newId(),
        month,
        mode: 'category',
        flexAmount: null,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      await repo.saveBudget(b);
      const items: BudgetItem[] = [...drafts.entries()]
        .filter(([, amt]) => amt !== null && amt !== 0)
        .map(([categoryId, amt]) => ({
          id: newId(),
          budgetId: b.id,
          categoryId,
          amount: amt ?? 0,
          rollover: rolloverDrafts.get(categoryId) ?? true,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        }));
      await repo.saveBudgetItems(items);
    } else {
      const existing = new Map(monthBudgetItems.map((bi) => [bi.categoryId, bi]));
      const items: BudgetItem[] = [];
      for (const [categoryId, amt] of drafts) {
        const prev = existing.get(categoryId);
        if (amt === null || amt === 0) {
          if (prev) items.push({ ...prev, amount: 0, updatedAt: nowISO() });
          continue;
        }
        if (prev) items.push({ ...prev, amount: amt, rollover: rolloverDrafts.get(categoryId) ?? prev.rollover, updatedAt: nowISO() });
        else items.push({ id: newId(), budgetId: budget.id, categoryId, amount: amt, rollover: rolloverDrafts.get(categoryId) ?? true, createdAt: nowISO(), updatedAt: nowISO() });
      }
      // Remove zeroed-out items.
      await repo.deleteBudgetItems(budget.id);
      await repo.saveBudgetItems(items.filter((i) => i.amount > 0));
    }
    bumpTxn();
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const saveFlex = async () => {
    const flexAmount = Math.round(Number(flexDraft) * 100) || null;
    if (budget) {
      await repo.saveBudget({ ...budget, mode: 'flex', flexAmount, updatedAt: nowISO() });
    } else {
      await repo.saveBudget({
        id: newId(),
        month,
        mode: 'flex',
        flexAmount,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
    }
    bumpTxn();
    await refresh();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const switchMode = async (next: 'category' | 'flex') => {
    if (!budget) return;
    await repo.saveBudget({ ...budget, mode: next, updatedAt: nowISO() });
    bumpTxn();
    await refresh();
  };

  const copyToNextMonth = async () => {
    const nextMonth = addMonthsToKey(month, 1);
    const existing = budgets.find((b) => b.month === nextMonth);
    if (existing) {
      await repo.deleteBudgetItems(existing.id);
    }
    const b: Budget = {
      id: existing?.id ?? newId(),
      month: nextMonth,
      mode: budget?.mode ?? 'category',
      flexAmount: budget?.flexAmount ?? null,
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    await repo.saveBudget(b);
    const items: BudgetItem[] = monthBudgetItems.map((bi) => ({
      id: newId(),
      budgetId: b.id,
      categoryId: bi.categoryId,
      amount: bi.amount,
      rollover: bi.rollover,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    }));
    await repo.saveBudgetItems(items);
    bumpTxn();
    await refresh();
    setMonth(nextMonth);
  };

  const flexSpent = useMemo(() => {
    // Flex mode: sum spending across budgeted categories.
    let spent = 0;
    for (const [, amt] of spendByCat) spent += amt;
    return spent;
  }, [spendByCat]);

  const flexAmount = budget?.flexAmount ?? null;

  return (
    <div>
      <PageHeader
        title="Budget"
        description="Set monthly spending targets. Transfers and savings never count against your budget."
        actions={
          <>
            <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copyToNextMonth()}>Copy to next month</Button>
            {saved && <Badge tone="green">Saved</Badge>}
          </>
        }
      />

      {/* Month + mode switcher */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonthsToKey(month, -1))} aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[130px] text-center text-sm font-semibold text-slate-800 dark:text-slate-100">{formatMonth(month)}</span>
          <Button variant="ghost" size="sm" onClick={() => setMonth(addMonthsToKey(month, 1))} aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {monthsBetween(month, currentMonthKey()) !== 0 && (
            <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonthKey())}>Today</Button>
          )}
        </div>
        <div className="ml-auto flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(['category', 'flex'] as const).map((m) => (
            <button
              key={m}
              onClick={() => void switchMode(m)}
              disabled={!budget}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                mode === m
                  ? 'bg-brand-600 text-white dark:bg-brand-500'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              {m === 'category' ? 'Category budget' : 'Flex budget'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card><div className="px-4 py-3"><Stat label={isFlex ? 'Flex budget' : 'Total budgeted'} value={formatMoney(isFlex ? (flexAmount ?? 0) : bSummary.totalBudgeted)} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Spent" value={formatMoney(isFlex ? flexSpent : bSummary.totalSpent)} tone={isFlex ? (flexSpent > (flexAmount ?? 0) ? 'neg' : 'default') : bSummary.totalSpent > bSummary.totalBudgeted ? 'neg' : 'default'} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Remaining" value={formatMoney(isFlex ? (flexAmount ?? 0) - flexSpent : bSummary.totalRemaining)} tone={(isFlex ? (flexAmount ?? 0) - flexSpent : bSummary.totalRemaining) < 0 ? 'neg' : 'pos'} /></div></Card>
        <Card><div className="px-4 py-3">
          <Stat
            label="Budget used"
            value={`${isFlex ? ((flexAmount ?? 0) > 0 ? Math.round((flexSpent / (flexAmount ?? 1)) * 100) : 0) : bSummary.totalBudgeted > 0 ? Math.round((bSummary.totalSpent / bSummary.totalBudgeted) * 100) : 0}%`}
            sub={<ProgressBar value={isFlex ? ((flexAmount ?? 0) > 0 ? (flexSpent / (flexAmount ?? 1)) * 100 : 0) : bSummary.totalBudgeted > 0 ? (bSummary.totalSpent / bSummary.totalBudgeted) * 100 : 0} tone={(isFlex ? flexSpent > (flexAmount ?? 0) : bSummary.totalSpent > bSummary.totalBudgeted) ? 'over' : 'default'} />}
          />
        </div></Card>
      </div>

      {!isFlex ? (
        <Card>
          {expenseCats.every(({ cats }) => cats.length === 0) ? (
            <EmptyState title="No expense categories" description="Create categories in Settings to start budgeting." />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-[760px]">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="w-32">Budgeted</th>
                    <th className="w-32 text-right">Actual</th>
                    <th className="w-32 text-right">Remaining</th>
                    <th className="w-40">Progress</th>
                    <th className="w-24 text-center">Rollover</th>
                  </tr>
                </thead>
                <tbody>
                  {expenseCats.map(({ group, cats }) => (
                    <React.Fragment key={group.id}>
                      <tr>
                        <td colSpan={6} className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                          {group.name}
                        </td>
                      </tr>
                      {cats.map((c) => {
                        const spent = spendByCat.get(c.id) ?? 0;
                        const draftAmount = drafts.get(c.id) ?? null;
                        const carry = carryover.get(c.id) ?? 0;
                        const budgeted = (draftAmount ?? 0) + carry;
                        const remaining = budgeted - spent;
                        const pct = budgeted > 0 ? (spent / budgeted) * 100 : 0;
                        const hasItem = budgetItems.some((bi) => bi.budgetId === budget?.id && bi.categoryId === c.id);
                        return (
                          <tr key={c.id}>
                            <td>
                              <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                              {!hasItem && spent > 0 && <Badge tone="amber" className="ml-2">Unbudgeted</Badge>}
                            </td>
                            <td>
                              <AmountInput value={draftAmount} onChange={(v) => setDrafts((prev) => { const m = new Map(prev); m.set(c.id, v); return m; })} negative={false} />
                              {carry > 0 && (
                                <div className="mt-0.5 text-right text-[11px] font-medium text-emerald-600 dark:text-emerald-400">+{formatMoney(carry)} carried</div>
                              )}
                              {carry < 0 && (
                                <div className="mt-0.5 text-right text-[11px] font-medium text-red-500 dark:text-red-400">−{formatMoney(-carry)} deficit</div>
                              )}
                            </td>
                            <td className="text-right text-sm text-slate-700 dark:text-slate-300">{spent > 0 ? formatMoney(spent) : '—'}</td>
                            <td className={`text-right text-sm font-semibold ${remaining < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {budgeted !== 0 ? formatMoney(remaining) : '—'}
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <ProgressBar value={pct} tone={spent > budgeted ? 'over' : 'default'} className="flex-1" />
                                <span className="w-10 text-right text-xs text-slate-500">{Math.round(pct)}%</span>
                              </div>
                            </td>
                            <td className="text-center">
                              <input
                                type="checkbox"
                                checked={rolloverDrafts.get(c.id) ?? true}
                                onChange={(e) => setRolloverDrafts((prev) => { const m = new Map(prev); m.set(c.id, e.target.checked); return m; })}
                                aria-label={`Roll over unused ${c.name} budget to next month`}
                                title="Carry unused budget to next month"
                                className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-800"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={() => void saveCategoryBudget()}>Save budget</Button>
          </div>
        </Card>
      ) : (
        <Card>
          <CardBody className="space-y-4">
            <div className="flex items-center gap-4">
              <PiggyBank className="h-6 w-6 text-brand-500" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Flex budget</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Set one total for flexible spending. You don&apos;t need to budget every category individually.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-48">
                <label className="label">Monthly flex budget</label>
                <AmountInput value={flexAmount} onChange={(v) => setFlexDraft(v === null ? '' : String(v / 100))} />
              </div>
              <Button variant="primary" icon={<Save className="h-4 w-4" />} onClick={() => void saveFlex()}>Save flex budget</Button>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-800">
              <div className="grid grid-cols-3 gap-4">
                <Stat label="Flex budget" value={formatMoney(flexAmount ?? 0)} />
                <Stat label="Spent" value={formatMoney(flexSpent)} tone={flexSpent > (flexAmount ?? 0) ? 'neg' : 'default'} />
                <Stat label="Remaining" value={formatMoney((flexAmount ?? 0) - flexSpent)} tone={(flexAmount ?? 0) - flexSpent < 0 ? 'neg' : 'pos'} />
              </div>
              <ProgressBar value={(flexAmount ?? 0) > 0 ? (flexSpent / (flexAmount ?? 1)) * 100 : 0} tone={flexSpent > (flexAmount ?? 0) ? 'over' : 'default'} className="mt-3" />
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}