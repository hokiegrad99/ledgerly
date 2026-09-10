import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, EmptyState, Badge } from '../components/ui/basic';
import { Select, Input } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { Download, Save, Copy, Trash2, Search, ArrowRight, Pencil } from 'lucide-react';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import { currentMonthKey, monthStart, addMonthsToKey, monthKeyOf, todayISO } from '../lib/dates';
import {
  spendingByCategory,
  spendingByMerchant,
  cashFlow,
  monthlyCashFlow,
  netWorthHistory,
  netWorthFromAccounts,
} from '../domain/calculations';
import { MoneyBarChart, TrendAreaChart, SimpleLineChart, LegendList, CHART_COLORS } from '../components/ui/Charts';
import { reportExcludedAccountIds, isExcludedFromReports } from '../domain/exclusions';
import type { ReportFilters, SavedReport, Transaction } from '../domain/types';

interface ReportDef {
  kind: string;
  label: string;
  description: string;
}

const REPORT_TYPES: ReportDef[] = [
  { kind: 'spending-category', label: 'Spending by category', description: 'Where your money went' },
  { kind: 'spending-merchant', label: 'Spending by merchant', description: 'Top merchants this period' },
  { kind: 'spending-account', label: 'Spending by account', description: 'Outflows per account' },
  { kind: 'spending-time', label: 'Spending over time', description: 'Monthly spending trend' },
  { kind: 'income-source', label: 'Income by source', description: 'Where income came from' },
  { kind: 'cashflow', label: 'Cash flow', description: 'Income vs expenses per month' },
  { kind: 'networth-time', label: 'Net worth over time', description: 'Assets minus liabilities trend' },
  { kind: 'category-trends', label: 'Category trends', description: 'Top categories across months' },
  { kind: 'money-flow', label: 'Money flow', description: 'Income → categories → spending' },
];

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

function downloadText(filename: string, text: string, mime = 'text/csv'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const { repo, accounts, categories, groups, tags, savedReports, dataVersion, refresh, bumpTxn, categoryById, accountById } = useApp();
  const [kind, setKind] = useState('spending-category');
  const [filters, setFilters] = useState<ReportFilters>({});
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [splits, setSplits] = useState<Awaited<ReturnType<typeof repo.getSplitsForTransactions>>>([]);
  const [saveModal, setSaveModal] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [deleteReport, setDeleteReport] = useState<SavedReport | null>(null);
  const [renameReport, setRenameReport] = useState<SavedReport | null>(null);
  const [renameName, setRenameName] = useState('');

  const month = currentMonthKey();
  const defaultFrom = monthStart(addMonthsToKey(month, -2));

  useEffect(() => {
    setFilters((f) => ({
      ...f,
      dateFrom: f.dateFrom ?? defaultFrom,
      dateTo: f.dateTo ?? todayISO(),
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const range = await repo.transactionsInRange(filters.dateFrom ?? undefined, filters.dateTo ?? undefined);
      const spl = await repo.getSplitsForTransactions(range.map((t) => t.id));
      if (!cancelled) {
        setTxns(range);
        setSplits(spl);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, filters, dataVersion.txn]);

  // Accounts flagged "exclude from reports" are filtered out below.
  const excludedAccountIds = useMemo(() => reportExcludedAccountIds(accounts), [accounts]);

  const filtered = useMemo(() => {
    return txns.filter((t) => {
      if (filters.accountIds && filters.accountIds.length > 0 && !filters.accountIds.includes(t.accountId)) return false;
      if (filters.categoryIds && filters.categoryIds.length > 0 && !(t.categoryId && filters.categoryIds.includes(t.categoryId))) return false;
      if (filters.groupIds && filters.groupIds.length > 0) {
        const cat = t.categoryId ? categories.find((c) => c.id === t.categoryId) : undefined;
        if (!cat || !filters.groupIds.includes(cat.groupId)) return false;
      }
      if (filters.merchant && !(t.merchant || '').toLowerCase().includes(filters.merchant.toLowerCase())) return false;
      if (filters.tagIds && filters.tagIds.length > 0 && !filters.tagIds.some((tg) => t.tagIds?.includes(tg))) return false;
      if (filters.type && t.type !== filters.type) return false;
      // Honour the account "include in reports" toggle and rule-based exclusions.
      if (isExcludedFromReports(t, excludedAccountIds)) return false;
      return true;
    });
  }, [txns, filters, categories, excludedAccountIds]);

  const filteredSplits = useMemo(() => splits.filter((s) => filtered.some((t) => t.id === s.transactionId)), [splits, filtered]);

  // Category filter is grouped by category group for scannability (ISSUE-004).
  const catsByGroup = useMemo(() => {
    const map = new Map<string, typeof categories>();
    for (const c of categories) {
      if (c.archived) continue;
      const arr = map.get(c.groupId) ?? [];
      arr.push(c);
      map.set(c.groupId, arr);
    }
    return map;
  }, [categories]);
  const activeGroups = useMemo(() => groups.filter((g) => !g.archived), [groups]);
  // Non-archived categories whose group is archived or missing stay selectable.
  const orphanCats = useMemo(
    () => [...catsByGroup.entries()]
      .filter(([gid]) => !activeGroups.some((g) => g.id === gid))
      .flatMap(([, cs]) => cs),
    [catsByGroup, activeGroups],
  );

  const spendByCat = useMemo(() => spendingByCategory(filtered, filteredSplits), [filtered, filteredSplits]);
  const merchants = useMemo(() => spendingByMerchant(filtered, 15), [filtered]);
  const flow = cashFlow(filtered);

  const byAccount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type === 'transfer' || t.amount >= 0) continue;
      map.set(t.accountId, (map.get(t.accountId) ?? 0) + -t.amount);
    }
    return [...map.entries()].map(([id, v]) => ({ id, name: accountById(id)?.name ?? '—', value: v })).sort((a, b) => b.value - a.value);
  }, [filtered, accountById]);

  const incomeByCat = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of filtered) {
      if (t.type === 'transfer' || t.amount <= 0) continue;
      map.set(t.categoryId ?? 'uncategorized', (map.get(t.categoryId ?? 'uncategorized') ?? 0) + t.amount);
    }
    return [...map.entries()].map(([id, v]) => ({ name: id === 'uncategorized' ? 'Uncategorized' : (categoryById(id)?.name ?? '—'), value: v })).sort((a, b) => b.value - a.value);
  }, [filtered, categoryById]);

  const monthly = useMemo(() => monthlyCashFlow(filtered, 11), [filtered]);

  // Category trends: top 5 categories across months.
  const categoryTrends = useMemo(() => {
    const months = monthly.map((m) => m.month);
    const topCats = [...spendByCat.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
    const rows = months.map((m) => {
      const row: Record<string, unknown> = { label: m };
      const monthTxns = filtered.filter((t) => monthKeyOf(t.date) === m && t.type !== 'transfer');
      const spend = spendingByCategory(monthTxns, filteredSplits);
      for (const catId of topCats) {
        row[categoryById(catId)?.name ?? 'Cat'] = spend.get(catId) ?? 0;
      }
      return row;
    });
    return { rows, series: topCats.map((id) => categoryById(id)?.name ?? 'Cat') };
  }, [filtered, filteredSplits, monthly, categoryById, spendByCat]);

  const netWorth = useMemo(() => {
    void dataVersion;
    const summary = netWorthFromAccounts(accounts);
    const history = netWorthHistory(accounts, txns, 11);
    return { summary, history };
  }, [accounts, txns]);

  // ------------------------------------------------------------------ render

  const renderReport = () => {
    switch (kind) {
      case 'spending-category': {
        const rows = [...spendByCat.entries()].map(([id, v]) => ({ name: categoryById(id)?.name ?? 'Uncategorized', value: v })).sort((a, b) => b.value - a.value);
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <MoneyBarChart data={rows.map((r) => ({ label: r.name, value: r.value }))} dataKey="value" height={300} color="#3c68ee" />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <LegendList items={rows.slice(0, 10).map((r, i) => ({ ...r, color: CHART_COLORS[i] }))} formatter={(v) => formatMoney(v)} />
                <div className="mt-4">
                  <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('spending-by-category', ['Category', 'Amount'], rows.map((r) => [r.name, r.value]))}>
                    Export CSV
                  </Button>
                </div>
              </CardBody>
            </Card>
          </div>
        );
      }
      case 'spending-merchant':
        return (
          <Card>
            <CardBody>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>
                      <th>Merchant</th>
                      <th className="text-right">Amount</th>
                      <th className="text-right">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchants.map((m) => (
                      <tr key={m.merchant}>
                        <td className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.merchant}</td>
                        <td className="text-right text-sm font-semibold">{formatMoney(m.amount)}</td>
                        <td className="text-right text-xs text-slate-500">{flow.expenses > 0 ? Math.round((m.amount / flow.expenses) * 100) : 0}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('spending-by-merchant', ['Merchant', 'Amount'], merchants.map((m) => [m.merchant, m.amount]))}>
                  Export CSV
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      case 'spending-account':
        return (
          <Card>
            <CardBody>
              <MoneyBarChart data={byAccount.map((a) => ({ label: a.name, value: a.value }))} dataKey="value" height={260} color="#f59e0b" />
              <div className="mt-4">
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('spending-by-account', ['Account', 'Amount'], byAccount.map((a) => [a.name, a.value]))}>
                  Export CSV
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      case 'spending-time':
        return (
          <Card>
            <CardBody>
              <TrendAreaChart data={monthly.map((m) => ({ label: m.month, value: m.expenses }))} dataKey="value" height={300} color="#ef4444" />
            </CardBody>
          </Card>
        );
      case 'income-source':
        return (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardBody>
                <MoneyBarChart data={incomeByCat.map((r) => ({ label: r.name, value: r.value }))} dataKey="value" height={280} color="#10b981" />
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <LegendList items={incomeByCat.slice(0, 8).map((r, i) => ({ ...r, color: CHART_COLORS[i] }))} formatter={(v) => formatMoney(v)} />
              </CardBody>
            </Card>
          </div>
        );
      case 'cashflow':
        return (
          <Card>
            <CardBody>
              <SimpleLineChart data={monthly.map((m) => ({ label: m.month, income: m.income, expenses: m.expenses, net: m.net }))} dataKey="net" height={300} color="#3c68ee" />
              <div className="mt-2 flex flex-wrap gap-6">
                <LegendList items={[
                  { name: 'Income', value: flow.income, color: '#10b981' },
                  { name: 'Expenses', value: flow.expenses, color: '#ef4444' },
                  { name: 'Net', value: flow.net, color: '#3c68ee' },
                ]} formatter={(v) => formatMoney(v)} />
              </div>
              <div className="mt-4">
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('cash-flow', ['Month', 'Income', 'Expenses', 'Net'], monthly.map((m) => [m.month, m.income, m.expenses, m.net]))}>
                  Export CSV
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      case 'networth-time':
        return (
          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap gap-6">
                <Badge tone="green">Net worth {formatMoney(netWorth.summary.netWorth)}</Badge>
                <Badge tone="neutral">Assets {formatMoney(netWorth.summary.assets)}</Badge>
                <Badge tone="red">Liabilities {formatMoney(netWorth.summary.liabilities)}</Badge>
              </div>
              <TrendAreaChart data={netWorth.history.map((h) => ({ label: h.month, value: h.netWorth }))} dataKey="value" height={300} color="#8b5cf6" />
              <div className="mt-4">
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('net-worth', ['Month', 'Assets', 'Liabilities', 'Net worth'], netWorth.history.map((h) => [h.month, h.assets, h.liabilities, h.netWorth]))}>
                  Export CSV
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      case 'category-trends':
        return (
          <Card>
            <CardBody>
              <div className="flex flex-wrap gap-4">
                {categoryTrends.series.map((s, i) => (
                  <span key={s} className="flex items-center gap-1.5 text-xs">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS[i] }} /> {s}
                  </span>
                ))}
              </div>
              <div className="mt-2">
                <SimpleLineChart data={categoryTrends.rows} dataKey={categoryTrends.series[0] ?? 'value'} height={300} />
              </div>
              <div className="mt-4">
                <Button variant="secondary" size="sm" icon={<Download className="h-3.5 w-3.5" />} onClick={() => exportCsv('category-trends', ['Month', ...categoryTrends.series], categoryTrends.rows.map((r) => [String(r.label), ...categoryTrends.series.map((s) => Number(r[s]) || 0)]))}>
                  Export CSV
                </Button>
              </div>
            </CardBody>
          </Card>
        );
      case 'money-flow':
        return (
          <MoneyFlowView income={incomeByCat} spending={[...spendByCat.entries()].map(([id, v]) => ({ name: categoryById(id)?.name ?? 'Uncategorized', value: v })).sort((a, b) => b.value - a.value)} />
        );
      default:
        return <EmptyState title="Unknown report" />;
    }
  };

  const exportCsv = (name: string, headers: string[], rows: (string | number)[][]) => {
    downloadText(`${name}-${todayISO()}.csv`, toCsv(headers, rows));
  };

  const applySaved = (r: SavedReport) => {
    setKind(r.kind);
    setFilters(r.filters);
  };

  const saveReport = async () => {
    if (!saveName.trim()) return;
    const sr: SavedReport = {
      id: newId(),
      name: saveName.trim(),
      kind,
      filters,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    await repo.saveSavedReport(sr);
    bumpTxn();
    await refresh();
    setSaveModal(false);
    setSaveName('');
  };

  const duplicateSaved = async (r: SavedReport) => {
    await repo.saveSavedReport({ ...r, id: newId(), name: `${r.name} (copy)`, createdAt: nowISO(), updatedAt: nowISO() });
    bumpTxn();
    await refresh();
  };

  const deleteSaved = async () => {
    if (!deleteReport) return;
    await repo.deleteSavedReport(deleteReport.id);
    bumpTxn();
    await refresh();
    setDeleteReport(null);
  };

  const renameSaved = async () => {
    if (!renameReport) return;
    const name = renameName.trim();
    if (!name) return;
    await repo.saveSavedReport({ ...renameReport, name, updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    setRenameReport(null);
    setRenameName('');
  };

  const filterPanel = (
    <Card className="mb-4">
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Select className="w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Report type">
            {REPORT_TYPES.map((r) => (
              <option key={r.kind} value={r.kind}>{r.label}</option>
            ))}
          </Select>
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" icon={<Save className="h-3.5 w-3.5" />} onClick={() => { setSaveName(''); setSaveModal(true); }}>Save report</Button>
            {savedReports.length > 0 && (
              <Select className="w-auto text-xs" value="" onChange={(e) => {
                const r = savedReports.find((x) => x.id === e.target.value);
                if (r) applySaved(r);
              }} aria-label="Load saved report">
                <option value="">Saved reports…</option>
                {savedReports.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </Select>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span>From</span>
            <Input type="date" className="w-auto" value={filters.dateFrom ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || null }))} />
            <span>to</span>
            <Input type="date" className="w-auto" value={filters.dateTo ?? ''} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || null }))} />
          </div>
          <Select className="w-auto" value={filters.accountIds?.[0] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, accountIds: e.target.value ? [e.target.value] : null }))} aria-label="Filter by account">
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <Select className="w-auto" value={filters.groupIds?.[0] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, groupIds: e.target.value ? [e.target.value] : null }))} aria-label="Filter by category group">
            <option value="">All groups</option>
            {groups.filter((g) => !g.archived).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </Select>
          <Select className="w-auto" value={filters.categoryIds?.[0] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, categoryIds: e.target.value ? [e.target.value] : null }))} aria-label="Filter by category">
            <option value="">All categories</option>
            {activeGroups.map((g) => {
              const cats = catsByGroup.get(g.id) ?? [];
              if (cats.length === 0) return null;
              return (
                <optgroup key={g.id} label={g.name}>
                  {cats.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              );
            })}
            {orphanCats.length > 0 && (
              <optgroup label="Other">
                {orphanCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            )}
          </Select>
          <Select className="w-auto" value={filters.tagIds?.[0] ?? ''} onChange={(e) => setFilters((f) => ({ ...f, tagIds: e.target.value ? [e.target.value] : null }))} aria-label="Filter by tag">
            <option value="">All tags</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Select className="w-auto" value={filters.type ?? ''} onChange={(e) => setFilters((f) => ({ ...f, type: (e.target.value || null) as ReportFilters['type'] }))} aria-label="Filter by type">
            <option value="">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </Select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Search className="h-3.5 w-3.5" />
            <Input value={filters.merchant ?? ''} onChange={(e) => setFilters((f) => ({ ...f, merchant: e.target.value || null }))} placeholder="Merchant contains…" className="w-44" />
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span>{filtered.length.toLocaleString()} transactions in range</span>
          {filters.dateFrom && <span>· Income {formatMoney(flow.income)} · Expenses {formatMoney(flow.expenses)}</span>}
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div>
      <PageHeader title="Reports" description="Analyze your spending, income, and cash flow. All calculations run locally." />
      {filterPanel}
      {renderReport()}

      {savedReports.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Saved reports</div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
            {savedReports.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-2.5">
                <button className="text-sm font-medium text-slate-800 hover:underline dark:text-slate-100" onClick={() => applySaved(r)}>
                  {r.name}
                </button>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => void duplicateSaved(r)} aria-label={`Duplicate ${r.name}`}>
                    <Copy className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost p-1.5" onClick={() => { setRenameReport(r); setRenameName(r.name); }} aria-label={`Rename ${r.name}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleteReport(r)} aria-label={`Delete ${r.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={saveModal} onClose={() => setSaveModal(false)} title="Save report" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSaveModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => void saveReport()}>Save</Button>
          </>
        }
      >
        <label className="label">Report name</label>
        <Input value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder="e.g. Monthly groceries" autoFocus />
      </Modal>
      <Modal open={!!renameReport} onClose={() => setRenameReport(null)} title="Rename report" size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRenameReport(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void renameSaved()}>Save</Button>
          </>
        }
      >
        <label className="label">Report name</label>
        <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} autoFocus />
      </Modal>
      <ConfirmDialog
        open={!!deleteReport}
        onClose={() => setDeleteReport(null)}
        onConfirm={deleteSaved}
        danger
        title={`Delete ${deleteReport?.name}?`}
        confirmLabel="Delete report"
        message="This removes the saved report definition. Your data is not affected."
      />
    </div>
  );
}

function MoneyFlowView({ income, spending }: { income: { name: string; value: number }[]; spending: { name: string; value: number }[] }) {
  const totalIn = income.reduce((a, b) => a + b.value, 0);
  const totalOut = spending.reduce((a, b) => a + b.value, 0);
  const topIncome = income.slice(0, 6);
  const topSpending = spending.slice(0, 8);
  return (
    <div>
      <Card>
        <CardBody>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Money in</div>
              <div className="text-lg font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(totalIn)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Money out</div>
              <div className="text-lg font-semibold text-red-600 dark:text-red-400">{formatMoney(totalOut)}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500 dark:text-slate-400">Net</div>
              <div className={`text-lg font-semibold ${totalIn - totalOut >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                {formatMoney(totalIn - totalOut)}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_auto_1fr]">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Income sources</div>
              {topIncome.map((i) => (
                <div key={i.name} className="rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-900/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-emerald-900 dark:text-emerald-200">{i.name}</span>
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">{formatMoney(i.value)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-emerald-200 dark:bg-emerald-900">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${totalIn > 0 ? (i.value / totalIn) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden items-center justify-center md:flex">
              <ArrowRight className="h-5 w-5 text-slate-300 dark:text-slate-600" />
            </div>
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Spending categories</div>
              {topSpending.map((s) => (
                <div key={s.name} className="rounded-lg bg-red-50 px-3 py-2 dark:bg-red-900/20">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-red-900 dark:text-red-200">{s.name}</span>
                    <span className="font-semibold text-red-700 dark:text-red-300">{formatMoney(s.value)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-red-200 dark:bg-red-900">
                    <div className="h-full rounded-full bg-red-500" style={{ width: `${totalOut > 0 ? (s.value / totalOut) * 100 : 0}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-400">Transfers are excluded. Based on the current report filters.</p>
        </CardBody>
      </Card>
    </div>
  );
}