import { useMemo, useState } from 'react';
import { Plus, Target, Trash2, TrendingUp, CalendarDays } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, EmptyState, ProgressBar, Badge, Stat } from '../components/ui/basic';
import { Field, Input, Select, Textarea, AmountInput } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import type { Goal, GoalType } from '../domain/types';
import { goalProgress } from '../domain/calculations';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/dates';
import { newId, nowISO } from '../lib/id';

const GOAL_TYPES: { value: GoalType; label: string; icon: string }[] = [
  { value: 'savings', label: 'Savings', icon: '💰' },
  { value: 'emergency-fund', label: 'Emergency fund', icon: '🛟' },
  { value: 'vacation', label: 'Vacation', icon: '✈️' },
  { value: 'home-purchase', label: 'Home purchase', icon: '🏠' },
  { value: 'major-purchase', label: 'Major purchase', icon: '🛍️' },
  { value: 'debt-payoff', label: 'Debt payoff', icon: '📉' },
  { value: 'investment', label: 'Investment', icon: '📈' },
  { value: 'retirement', label: 'Retirement', icon: '🌴' },
  { value: 'custom', label: 'Custom', icon: '⭐' },
];

function GoalFormModal({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: Goal | null }) {
  const { repo, refresh, accounts, bumpTxn } = useApp();
  const [form, setForm] = useState<Goal>(() =>
    goal ?? {
      id: newId(),
      name: '',
      type: 'savings',
      targetAmount: 0,
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: 0,
      accountIds: [],
      notes: '',
      completed: false,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );
  const [error, setError] = useState<string | null>(null);

  const toggleAccount = (id: string) => {
    setForm((f) => ({
      ...f,
      accountIds: f.accountIds.includes(id) ? f.accountIds.filter((x) => x !== id) : [...f.accountIds, id],
    }));
  };

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Give your goal a name.');
      return;
    }
    if (form.targetAmount <= 0) {
      setError('Target amount must be greater than zero.');
      return;
    }
    await repo.saveGoal({ ...form, name: form.name.trim(), updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={goal ? `Edit ${goal.name}` : 'New goal'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{goal ? 'Save changes' : 'Create goal'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Goal name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Emergency fund" autoFocus />
        </Field>
        <Field label="Goal type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as GoalType })}>
            {GOAL_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Target amount">
          <AmountInput value={form.targetAmount} onChange={(v) => setForm({ ...form, targetAmount: v ?? 0 })} />
        </Field>
        <Field label="Current amount">
          <AmountInput value={form.currentAmount} onChange={(v) => setForm({ ...form, currentAmount: v ?? 0 })} />
        </Field>
        <Field label="Target date" hint="Optional">
          <Input type="date" value={form.targetDate ?? ''} onChange={(e) => setForm({ ...form, targetDate: e.target.value || null })} />
        </Field>
        <Field label="Monthly contribution" hint="Used for the forecast">
          <AmountInput value={form.monthlyContribution} onChange={(v) => setForm({ ...form, monthlyContribution: v ?? 0 })} />
        </Field>
        <Field label="Linked accounts" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {accounts.filter((a) => a.active).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggleAccount(a.id)}
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  form.accountIds.includes(a.id)
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
        </Field>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    </Modal>
  );
}

export default function GoalsPage() {
  const { goals, repo, refresh, bumpTxn } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [deleting, setDeleting] = useState<Goal | null>(null);
  const [adjusting, setAdjusting] = useState<Goal | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<string>('');

  const progress = useMemo(() => goals.map(goalProgress), [goals]);

  const totalSaved = goals.reduce((a, g) => a + g.currentAmount, 0);
  const totalTarget = goals.reduce((a, g) => a + g.targetAmount, 0);

  const adjustGoal = async () => {
    if (!adjusting) return;
    const delta = Math.round(Number(adjustAmount.replace(/[^0-9.\-]/g, '')) * 100) || 0;
    const next = { ...adjusting, currentAmount: Math.max(0, adjusting.currentAmount + delta), updatedAt: nowISO() };
    await repo.saveGoal(next);
    bumpTxn();
    await refresh();
    setAdjusting(null);
    setAdjustAmount('');
  };

  const deleteGoal = async () => {
    if (!deleting) return;
    await repo.deleteGoal(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  return (
    <div>
      <PageHeader
        title="Goals"
        description="Track savings targets, debt payoff, and major purchases."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setModalOpen(true); }}>New goal</Button>}
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><div className="px-4 py-3"><Stat label="Total saved" value={formatMoney(totalSaved)} tone="pos" /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Total targets" value={formatMoney(totalTarget)} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Overall progress" value={`${totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0}%`} sub={<ProgressBar value={totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0} className="mt-2" />} /></div></Card>
      </div>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target className="h-6 w-6" />}
            title="No goals yet"
            description="Create a savings goal, emergency fund, vacation fund, or debt payoff target."
            action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setEditing(null); setModalOpen(true); }}>Create your first goal</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {progress.map(({ goal, percent, remaining, estimatedCompletion, onTrack }) => (
            <Card key={goal.id}>
              <div className="flex items-start justify-between px-4 pt-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{GOAL_TYPES.find((t) => t.value === goal.type)?.icon ?? '⭐'}</span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{goal.name}</h3>
                    {goal.completed && <Badge tone="green">Completed</Badge>}
                    {percent >= 100 && !goal.completed && <Badge tone="green">Target reached</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{GOAL_TYPES.find((t) => t.value === goal.type)?.label}</p>
                </div>
                <div className="flex gap-1">
                  <button className="btn-ghost p-1.5" onClick={() => { setEditing(goal); setModalOpen(true); }} aria-label="Edit goal">
                    <TrendingUp className="h-4 w-4" />
                  </button>
                  <button className="btn-ghost p-1.5 text-red-500" onClick={() => setDeleting(goal)} aria-label="Delete goal">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="px-4 pb-4">
                <div className="mt-3 flex items-end justify-between">
                  <div className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{formatMoney(goal.currentAmount)}</div>
                  <div className="text-sm text-slate-500 dark:text-slate-400">of {formatMoney(goal.targetAmount)}</div>
                </div>
                <ProgressBar value={percent} tone={percent >= 100 ? 'success' : 'default'} className="mt-2" />
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                    <div className="text-slate-500 dark:text-slate-400">Progress</div>
                    <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{percent}%</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                    <div className="text-slate-500 dark:text-slate-400">Remaining</div>
                    <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">{formatMoney(remaining)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                    <div className="text-slate-500 dark:text-slate-400">Forecast completion</div>
                    <div className="mt-0.5 flex items-center gap-1 font-semibold text-slate-900 dark:text-slate-100">
                      <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                      {estimatedCompletion ?? (goal.monthlyContribution > 0 ? '—' : 'Set a monthly contribution')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
                    <div className="text-slate-500 dark:text-slate-400">Target date</div>
                    <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                      {goal.targetDate ? formatDate(goal.targetDate) : 'No target date'}
                      {goal.targetDate && !onTrack && <span className="ml-1 text-red-500">(behind)</span>}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => { setAdjusting(goal); setAdjustAmount(''); }}>
                    Add / withdraw
                  </Button>
                  {goal.monthlyContribution > 0 && (
                    <span className="text-xs text-slate-400 self-center">Saving {formatMoney(goal.monthlyContribution)}/mo</span>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {modalOpen && <GoalFormModal open={modalOpen} onClose={() => setModalOpen(false)} goal={editing} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={deleteGoal}
        danger
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete goal"
        message="This only removes the goal — linked accounts and transactions are not affected."
      />
      <Modal
        open={!!adjusting}
        onClose={() => setAdjusting(null)}
        title={`Adjust ${adjusting?.name ?? ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdjusting(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => void adjustGoal()}>Apply</Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Current: <strong>{formatMoney(adjusting?.currentAmount ?? 0)}</strong>
          </p>
          <Field label="Amount to add (negative to withdraw)">
            <AmountInput value={null} onChange={(v) => setAdjustAmount(v === null ? '' : String(v / 100))} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}