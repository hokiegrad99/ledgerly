import { useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardBody, Badge, EmptyState, Stat, Button } from '../components/ui/basic';
import { Field, Input, Select, AmountInput } from '../components/ui/form';
import { Modal } from '../components/ui/Modal';
import { Calculator } from 'lucide-react';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import { formatDate, todayISO, currentMonthKey, addMonthsToKey, monthEnd } from '../lib/dates';
import { payoffSchedule, upcomingRecurring } from '../domain/calculations';
import type { Liability } from '../domain/types';
import { SimpleLineChart } from '../components/ui/Charts';

export default function PlanningPage() {
  const { liabilities, accounts, repo, refresh, bumpTxn, recurring } = useApp();
  const [editing, setEditing] = useState<Liability | null>(null);

  const liabById = useMemo(() => {
    const m = new Map(liabilities.map((l) => [l.accountId, l]));
    return m;
  }, [liabilities]);

  const debtAccounts = accounts.filter((a) => {
    const l = liabById.get(a.id);
    return l !== undefined || ['mortgage', 'auto-loan', 'student-loan', 'personal-loan', 'credit-card', 'other-liability'].includes(a.type);
  });

  // Forecast: projected checking/savings balance from recurring.
  const upcoming = useMemo(() => upcomingRecurring(recurring, 6), [recurring]);

  const forecast = useMemo(() => {
    const active = accounts.filter((a) => a.active && (a.type === 'checking' || a.type === 'savings' || a.type === 'cash'));
    const base = active.reduce((acc, a) => acc + a.balance, 0);
    const points: { label: string; value: number }[] = [];
    let balance = base;
    const months: string[] = [];
    for (let i = 0; i <= 6; i++) months.push(addMonthsToKey(currentMonthKey(), i));
    let idx = 0;
    for (const m of months) {
      const end = monthEnd(m);
      while (idx < upcoming.length && upcoming[idx].date <= end) {
        balance += upcoming[idx].recurring.amount;
        idx++;
      }
      points.push({ label: m, value: balance });
    }
    return points;
  }, [accounts, upcoming]);

  return (
    <div>
      <PageHeader title="Planning" description="Debt payoff plans and balance forecasts. Numbers are estimates — not financial advice." />

      {/* Debt payoff */}
      <h2 className="mb-2 mt-2 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Debt payoff</h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {debtAccounts.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Calculator className="h-6 w-6" />}
              title="No debts configured"
              description="Add liability accounts (mortgage, loans, credit cards) and configure payoff details to see projections."
            />
          </Card>
        ) : (
          debtAccounts.map((acc) => {
            const liab = liabById.get(acc.id);
            return (
              <Card key={acc.id}>
                <CardBody>
                  <div className="mb-2 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{acc.name}</h3>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{acc.institution || acc.type}</div>
                    </div>
                    <Badge tone="red">{formatMoney(acc.balance)}</Badge>
                  </div>
                  {liab ? (
                    <LiabilityPlan key={liab.id} liability={liab} onEdit={() => setEditing(liab)} balance={acc.balance} />
                  ) : (
                    <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      No payoff plan configured.
                      <button className="ml-2 font-medium text-brand-600 hover:underline dark:text-brand-400" onClick={() => setEditing(createLiability(acc.id))}>
                        Add plan
                      </button>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })
        )}
      </div>

      {/* Forecast */}
      <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Balance forecast</h2>
      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap gap-6">
            <Stat label="Current cash (checking + savings)" value={formatMoney(forecast[0]?.value ?? 0)} />
            <Stat label="Projected in 6 months" value={formatMoney(forecast[forecast.length - 1]?.value ?? 0)} />
          </div>
          <SimpleLineChart data={forecast} dataKey="value" height={240} color="#10b981" />
          <p className="mt-3 text-xs text-slate-400">
            Based on active recurring transactions only. One-off spending is not included.
          </p>
        </CardBody>
      </Card>

      {editing && (
        <LiabilityModal
          open={!!editing}
          onClose={() => setEditing(null)}
          liability={editing}
          onSave={async (l) => {
            await repo.saveLiability(l);
            bumpTxn();
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function createLiability(accountId: string): Liability {
  return {
    id: newId(),
    accountId,
    interestRate: 0,
    minimumPayment: 0,
    paymentDay: 1,
    originalBalance: 0,
    payoffStrategy: 'avalanche',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

function LiabilityPlan({ liability, onEdit, balance }: { liability: Liability; onEdit: () => void; balance: number }) {
  const [showAll, setShowAll] = useState(false);
  const schedule = useMemo(
    () => payoffSchedule(balance, liability.interestRate, liability.minimumPayment, todayISO()),
    [balance, liability],
  );
  const payoffDate = schedule.length > 0 ? schedule[schedule.length - 1].date : null;
  const totalInterest = schedule.reduce((a, r) => a + r.interestPaid, 0);
  const months = schedule.length;

  return (
    <div className="mt-2 space-y-2">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Rate</div>
          <div className="text-sm font-semibold">{liability.interestRate}%</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Min payment</div>
          <div className="text-sm font-semibold">{formatMoney(liability.minimumPayment)}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Payoff</div>
          <div className="text-sm font-semibold">{payoffDate ?? '—'}</div>
        </div>
        <div className="rounded-lg bg-slate-50 px-2 py-1.5 text-center dark:bg-slate-800">
          <div className="text-[10px] text-slate-500 dark:text-slate-400">Interest</div>
          <div className="text-sm font-semibold">{formatMoney(totalInterest)}</div>
        </div>
      </div>
      {months > 0 && (
        <>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>{months} months to payoff</span>
            <span>·</span>
            <span>{liability.payoffStrategy} strategy</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
          </div>
          {showAll && (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Payment</th>
                    <th className="text-right">Interest</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.slice(0, 36).map((r) => (
                    <tr key={r.month}>
                      <td className="text-xs text-slate-500">{formatDate(r.date)}</td>
                      <td className="text-right text-xs">{formatMoney(r.payment)}</td>
                      <td className="text-right text-xs">{formatMoney(r.interestPaid)}</td>
                      <td className="text-right text-xs font-medium">{formatMoney(r.remainingBalance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowAll((s) => !s)}>{showAll ? 'Hide schedule' : 'Show schedule'}</Button>
            <Button variant="ghost" size="sm" onClick={onEdit}>Edit plan</Button>
          </div>
        </>
      )}
    </div>
  );
}

function LiabilityModal({ open, onClose, liability, onSave }: {
  open: boolean;
  onClose: () => void;
  liability: Liability;
  onSave: (l: Liability) => Promise<void>;
}) {
  const [form, setForm] = useState<Liability>({ ...liability });

  return (
    <Modal open={open} onClose={onClose} title="Configure payoff plan" size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void onSave({ ...form, updatedAt: nowISO() }).then(onClose)}>Save plan</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interest rate (APR %)">
            <Input type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Minimum payment">
            <AmountInput value={form.minimumPayment} onChange={(v) => setForm({ ...form, minimumPayment: v ?? 0 })} />
          </Field>
          <Field label="Payment day of month">
            <Input type="number" min={1} max={31} value={form.paymentDay} onChange={(e) => setForm({ ...form, paymentDay: Math.min(31, Math.max(1, Number(e.target.value) || 1)) })} />
          </Field>
          <Field label="Original balance">
            <AmountInput value={form.originalBalance} onChange={(v) => setForm({ ...form, originalBalance: v ?? 0 })} />
          </Field>
          <Field label="Strategy" className="col-span-2">
            <Select value={form.payoffStrategy} onChange={(e) => setForm({ ...form, payoffStrategy: e.target.value as Liability['payoffStrategy'] })}>
              <option value="snowball">Snowball (smallest balance first)</option>
              <option value="avalanche">Avalanche (highest rate first)</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}