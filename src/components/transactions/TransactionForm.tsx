import React, { useMemo, useState } from 'react';
import { useApp } from '../../store/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/basic';
import { Field, Input, Select, Textarea, Toggle, AmountInput } from '../ui/form';
import type { Transaction, TransactionType } from '../../domain/types';
import { isLiabilityType } from '../../domain/types';
import { newId } from '../../lib/id';
import { todayISO } from '../../lib/dates';

export interface TransactionDraft {
  id: string;
  date: string;
  merchant: string;
  amount: number;
  accountId: string;
  categoryId: string | null;
  tagIds: string[];
  notes: string;
  type: TransactionType;
  cleared: boolean;
  pending: boolean;
  reviewed: boolean;
  transferId: string | null;
  externalId: string | null;
}

export function emptyDraft(accountId: string, date?: string): TransactionDraft {
  return {
    id: newId(),
    date: date ?? todayISO(),
    merchant: '',
    amount: 0,
    accountId,
    categoryId: null,
    tagIds: [],
    notes: '',
    type: 'expense',
    cleared: true,
    pending: false,
    reviewed: false,
    transferId: null,
    externalId: null,
  };
}

export function draftFromTransaction(t: Transaction): TransactionDraft {
  return {
    id: t.id,
    date: t.date,
    merchant: t.merchant,
    amount: t.amount,
    accountId: t.accountId,
    categoryId: t.categoryId,
    tagIds: t.tagIds ?? [],
    notes: t.notes ?? '',
    type: t.type,
    cleared: t.cleared,
    pending: t.pending,
    reviewed: t.reviewed,
    transferId: t.transferId,
    externalId: t.externalId,
  };
}

export function TransactionFormModal({
  open,
  onClose,
  draft,
  onSave,
  title,
  allowTransfer,
  lockAccount,
}: {
  open: boolean;
  onClose: () => void;
  draft: TransactionDraft;
  onSave: (d: TransactionDraft) => Promise<void>;
  title: string;
  allowTransfer?: boolean;
  lockAccount?: boolean;
}) {
  const { accounts, categories, groups, tags } = useApp();
  const [d, setD] = useState<TransactionDraft>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset when a different draft is opened.
  React.useEffect(() => {
    setD(draft);
    setError(null);
  }, [draft, open]);

  const activeAccounts = accounts.filter((a) => a.active);
  const expenseGroups = groups.filter((g) => !g.archived);
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

  const submit = async () => {
    if (!d.merchant.trim()) {
      setError('Merchant is required.');
      return;
    }
    if (!d.date) {
      setError('Date is required.');
      return;
    }
    if (d.amount === 0 && d.type !== 'transfer') {
      setError('Amount cannot be zero.');
      return;
    }
    setSaving(true);
    try {
      await onSave(d);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save transaction'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date">
          <Input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} />
        </Field>
        <Field label="Amount">
          <AmountInput value={d.amount} onChange={(cents) => setD({ ...d, amount: cents ?? 0, type: cents !== null && cents < 0 ? 'expense' : cents !== null && cents > 0 ? 'income' : d.type })} />
        </Field>
        <Field label="Merchant / payee" className="sm:col-span-2">
          <Input value={d.merchant} onChange={(e) => setD({ ...d, merchant: e.target.value })} placeholder="e.g. Whole Foods Market" autoFocus />
        </Field>
        <Field label="Account">
          <Select
            value={d.accountId}
            disabled={lockAccount}
            onChange={(e) => {
              const acc = accounts.find((a) => a.id === e.target.value);
              setD({ ...d, accountId: e.target.value, type: acc && isLiabilityType(acc.type) && d.amount > 0 ? 'expense' : d.type });
            }}
          >
            {activeAccounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Category">
          <Select value={d.categoryId ?? ''} onChange={(e) => setD({ ...d, categoryId: e.target.value || null })}>
            <option value="">Uncategorized</option>
            {expenseGroups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {(catsByGroup.get(g.id) ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Transaction type" className="sm:col-span-2">
          <div className="flex gap-2">
            {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
              <button
                key={t}
                type="button"
                disabled={!allowTransfer && t === 'transfer'}
                onClick={() => setD({ ...d, type: t })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  d.type === t
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                {t === 'expense' ? 'Expense' : t === 'income' ? 'Income' : 'Transfer'}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Tags" className="sm:col-span-2">
          <div className="flex flex-wrap gap-2">
            {tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() =>
                  setD({
                    ...d,
                    tagIds: d.tagIds.includes(t.id) ? d.tagIds.filter((x) => x !== t.id) : [...d.tagIds, t.id],
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  d.tagIds.includes(t.id)
                    ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                    : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'
                }`}
              >
                {t.name}
              </button>
            ))}
            {tags.length === 0 && <span className="text-xs text-slate-400">No tags yet — create them in Settings.</span>}
          </div>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} placeholder="Optional notes" />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Cleared</span>
            <Toggle checked={d.cleared} onChange={(v) => setD({ ...d, cleared: v })} label="Cleared" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Pending</span>
            <Toggle checked={d.pending} onChange={(v) => setD({ ...d, pending: v })} label="Pending" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Reviewed</span>
            <Toggle checked={d.reviewed} onChange={(v) => setD({ ...d, reviewed: v })} label="Reviewed" />
          </div>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    </Modal>
  );
}