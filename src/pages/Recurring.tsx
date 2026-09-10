import { useEffect, useMemo, useState } from 'react';
import { Plus, CalendarClock, Wand2, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, EmptyState, Badge, CardBody, Stat } from '../components/ui/basic';
import { Field, Input, Select, AmountInput, Toggle } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import type { RecurringInterval, RecurringTransaction } from '../domain/types';
import { detectRecurring, upcomingRecurring } from '../domain/calculations';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import { formatDate, formatMonth, todayISO } from '../lib/dates';

const INTERVALS: { value: RecurringInterval; label: string }[] = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Every 2 weeks' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Every 6 months' },
  { value: 'annual', label: 'Annual' },
];

function RecurringFormModal({ open, onClose, item }: { open: boolean; onClose: () => void; item: RecurringTransaction | null }) {
  const { repo, refresh, accounts, categories, groups, bumpTxn } = useApp();
  const [form, setForm] = useState<RecurringTransaction>(() =>
    item ?? {
      id: newId(),
      merchant: '',
      amount: 0,
      categoryId: null,
      accountId: null,
      interval: 'monthly',
      dayOfMonth: 1,
      startDate: todayISO(),
      endDate: null,
      lastOccurrence: null,
      nextOccurrence: null,
      type: 'expense',
      autoCreated: false,
      active: true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );

  const submit = async () => {
    if (!form.merchant.trim()) return;
    await repo.saveRecurring({ ...form, merchant: form.merchant.trim(), updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={item ? `Edit ${item.merchant}` : 'New recurring transaction'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{item ? 'Save changes' : 'Create'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Merchant" className="sm:col-span-2">
          <Input value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder="e.g. Netflix" autoFocus />
        </Field>
        <Field label="Expected amount">
          <AmountInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v ?? 0, type: v !== null && v < 0 ? 'expense' : v !== null && v > 0 ? 'income' : form.type })} />
        </Field>
        <Field label="Frequency">
          <Select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value as RecurringInterval })}>
            {INTERVALS.map((i) => (
              <option key={i.value} value={i.value}>{i.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Day of month" hint="1–31; clamped for short months">
          <Input type="number" min={1} max={31} value={form.dayOfMonth} onChange={(e) => setForm({ ...form, dayOfMonth: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
        </Field>
        <Field label="Account" hint="Optional">
          <Select value={form.accountId ?? ''} onChange={(e) => setForm({ ...form, accountId: e.target.value || null })}>
            <option value="">Any account</option>
            {accounts.filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category" className="sm:col-span-2">
          <Select value={form.categoryId ?? ''} onChange={(e) => setForm({ ...form, categoryId: e.target.value || null })}>
            <option value="">Uncategorized</option>
            {groups.filter((g) => !g.archived).map((g) => (
              <optgroup key={g.id} label={g.name}>
                {categories.filter((c) => !c.archived && c.groupId === g.id).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
        </Field>
        <Field label="End date" hint="Optional — leave empty for ongoing">
          <Input type="date" value={form.endDate ?? ''} onChange={(e) => setForm({ ...form, endDate: e.target.value || null })} />
        </Field>
        <div className="flex items-center justify-between sm:col-span-2">
          <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
          <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
        </div>
      </div>
    </Modal>
  );
}

export default function RecurringPage() {
  const { repo, recurring, refresh, bumpTxn, dataVersion } = useApp();
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [deleting, setDeleting] = useState<RecurringTransaction | null>(null);
  const [detecting, setDetecting] = useState(false);

  // Recompute next occurrences on load (keeps them fresh).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const updates = recurring
        .filter((r) => r.active)
        .map((r) => {
          if (r.nextOccurrence && r.nextOccurrence > today) return null;
          return r;
        })
        .filter(Boolean) as RecurringTransaction[];
      if (updates.length === 0) return;
      // Refresh next occurrences from history-aware module.
      const withNext = updates.map((r) => ({ ...r, nextOccurrence: computeNext(r, today) }));
      if (!cancelled) {
        await repo.saveRecurringMany(withNext);
        await refresh();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataVersion.txn]);

  const upcoming = useMemo(() => upcomingRecurring(recurring, 6), [recurring]);

  const monthlyTotal = useMemo(() => {
    const monthly = recurring.filter((r) => r.active && r.amount < 0).reduce((acc, r) => {
      switch (r.interval) {
        case 'weekly': return acc + Math.abs(r.amount) * 4.33;
        case 'biweekly': return acc + Math.abs(r.amount) * 2.17;
        case 'monthly': return acc + Math.abs(r.amount);
        case 'quarterly': return acc + Math.abs(r.amount) / 3;
        case 'semiannual': return acc + Math.abs(r.amount) / 6;
        case 'annual': return acc + Math.abs(r.amount) / 12;
      }
    }, 0);
    return Math.round(monthly);
  }, [recurring]);

  const runDetection = async () => {
    setDetecting(true);
    try {
      const all = await repo.getAllTransactions();
      const candidates = detectRecurring(all);
      const existingKeys = new Set(recurring.map((r) => `${r.merchant.toLowerCase()}|${r.amount}`));
      const news = candidates
        .filter((c) => !existingKeys.has(`${c.merchant.toLowerCase()}|${c.amount}`))
        .map((c) => {
          const r: RecurringTransaction = {
            id: newId(),
            merchant: c.merchant,
            amount: -Math.abs(c.amount),
            categoryId: null,
            accountId: c.occurrences[0]?.accountId ?? null,
            interval: c.interval,
            dayOfMonth: c.dayOfMonth,
            startDate: c.occurrences[0]?.date ?? todayISO(),
            endDate: null,
            lastOccurrence: c.occurrences[c.occurrences.length - 1]?.date ?? null,
            nextOccurrence: null,
            type: 'expense',
            autoCreated: true,
            active: true,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          };
          return r;
        });
      await repo.saveRecurringMany(news);
      bumpTxn();
      await refresh();
      if (news.length === 0) {
        alert('No new recurring patterns found. Try importing more history first.');
      }
    } finally {
      setDetecting(false);
    }
  };

  const toggleActive = async (r: RecurringTransaction) => {
    await repo.saveRecurring({ ...r, active: !r.active, updatedAt: nowISO() });
    bumpTxn();
    await refresh();
  };

  const deleteItem = async () => {
    if (!deleting) return;
    await repo.deleteRecurring(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  // Calendar: group upcoming occurrences by month.
  const byMonth = useMemo(() => {
    const map = new Map<string, typeof upcoming>();
    for (const u of upcoming) {
      const key = u.date.slice(0, 7);
      const arr = map.get(key) ?? [];
      arr.push(u);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [upcoming]);

  return (
    <div>
      <PageHeader
        title="Recurring transactions"
        description="Bills, subscriptions, and income that repeat on a schedule."
        actions={
          <>
            <Button variant="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={() => void runDetection()} disabled={detecting}>
              {detecting ? 'Detecting…' : 'Auto-detect from history'}
            </Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setModalOpen(true); }}>Add recurring</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><div className="px-4 py-3"><Stat label="Active recurring items" value={recurring.filter((r) => r.active).length} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Est. monthly outflow" value={formatMoney(monthlyTotal)} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Upcoming (next 6 months)" value={upcoming.length} /></div></Card>
      </div>

      <div className="mb-4 flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" style={{ width: 'fit-content' }}>
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              view === v ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {v === 'list' ? 'List view' : 'Calendar view'}
          </button>
        ))}
      </div>

      {recurring.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CalendarClock className="h-6 w-6" />}
            title="No recurring transactions"
            description="Add them manually or run auto-detection against your transaction history."
            action={<Button variant="primary" icon={<Wand2 className="h-4 w-4" />} onClick={() => void runDetection()}>Auto-detect from history</Button>}
          />
        </Card>
      ) : view === 'list' ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base min-w-[700px]">
              <thead>
                <tr>
                  <th>Merchant</th>
                  <th>Amount</th>
                  <th>Frequency</th>
                  <th>Last occurrence</th>
                  <th>Next occurrence</th>
                  <th>Status</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...recurring]
                  .sort((a, b) => (a.nextOccurrence ?? '9999').localeCompare(b.nextOccurrence ?? '9999'))
                  .map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{r.merchant}</span>
                          {r.autoCreated && <Badge tone="blue">Detected</Badge>}
                          {r.type === 'income' && <Badge tone="green">Income</Badge>}
                        </div>
                      </td>
                      <td className={`whitespace-nowrap text-sm font-semibold ${r.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatMoney(r.amount)}
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{INTERVALS.find((i) => i.value === r.interval)?.label} (day {r.dayOfMonth})</td>
                      <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{r.lastOccurrence ? formatDate(r.lastOccurrence) : '—'}</td>
                      <td className="whitespace-nowrap text-xs font-medium text-slate-700 dark:text-slate-300">{r.nextOccurrence ? formatDate(r.nextOccurrence) : '—'}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <Toggle checked={r.active} onChange={() => void toggleActive(r)} label={`${r.merchant} active`} />
                          <span className="text-xs text-slate-500 dark:text-slate-400">{r.active ? 'Active' : 'Paused'}</span>
                        </div>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <button className="btn-ghost p-1.5 text-xs" onClick={() => { setEditing(r); setModalOpen(true); }}>Edit</button>
                          <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleting(r)} aria-label={`Delete ${r.merchant}`}>
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {byMonth.length === 0 && <Card><EmptyState title="Nothing scheduled" description="No upcoming occurrences in the next 6 months." /></Card>}
          {byMonth.map(([key, items]) => (
            <Card key={key}>
              <CardBody>
                <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{formatMonth(key)}</h3>
                <div className="space-y-2">
                  {items.map(({ recurring: r, date }) => (
                    <div key={`${r.id}-${date}`} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="w-24 shrink-0 text-xs font-semibold text-slate-600 dark:text-slate-300">{date.slice(8, 10)}</span>
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{r.merchant}</span>
                      </div>
                      <span className={r.amount < 0 ? 'text-sm font-semibold text-slate-900 dark:text-slate-100' : 'text-sm font-semibold text-emerald-600 dark:text-emerald-400'}>
                        {formatMoney(r.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && <RecurringFormModal open={modalOpen} onClose={() => setModalOpen(false)} item={editing} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={deleteItem}
        danger
        title={`Delete ${deleting?.merchant}?`}
        confirmLabel="Delete"
        message="This removes the recurring schedule. Existing transactions are not affected."
      />
    </div>
  );
}

function computeNext(r: RecurringTransaction, after: string): string {
  // Simple next-occurrence: walk from lastOccurrence or startDate.
  const { nextOccurrence, interval, dayOfMonth, startDate, lastOccurrence } = r;
  void nextOccurrence;
  const from = lastOccurrence && lastOccurrence > startDate ? lastOccurrence : startDate;
  let date = from;
  let guard = 0;
  while (date <= after && guard < 400) {
    date = advance(date, interval, dayOfMonth);
    guard++;
  }
  return date;
}

function advance(date: string, interval: RecurringInterval, dayOfMonth: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dom = Math.min(dayOfMonth, new Date(y, m, 0).getDate());
  switch (interval) {
    case 'weekly': {
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 7);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    case 'biweekly': {
      const dt = new Date(y, m - 1, d);
      dt.setDate(dt.getDate() + 14);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    }
    case 'monthly': {
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      return `${nextY}-${String(nextM).padStart(2, '0')}-${String(Math.min(dom, new Date(nextY, nextM, 0).getDate())).padStart(2, '0')}`;
    }
    case 'quarterly': return advance(advance(advance(date, 'monthly', dom), 'monthly', dom), 'monthly', dom);
    case 'semiannual': return advance(advance(advance(advance(advance(advance(date, 'monthly', dom), 'monthly', dom), 'monthly', dom), 'monthly', dom), 'monthly', dom), 'monthly', dom);
    case 'annual': {
      const nextY = y + 1;
      return `${nextY}-${String(m).padStart(2, '0')}-${String(Math.min(dom, new Date(nextY, m, 0).getDate())).padStart(2, '0')}`;
    }
  }
}