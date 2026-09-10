import React, { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/basic';
import { Select, Input } from '../ui/form';
import type { Category, Transaction, TransactionSplit } from '../../domain/types';
import { newId, nowISO } from '../../lib/id';

export function SplitModal({
  open,
  onClose,
  transaction,
  existingSplits,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  existingSplits: TransactionSplit[];
  onSave: (splits: TransactionSplit[]) => Promise<void>;
}) {
  const { categories, groups } = useApp();
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    if (existingSplits.length > 0) {
      setSplits(existingSplits.map((s) => ({ ...s })));
    } else {
      setSplits([]);
    }
    setError(null);
  }, [open, existingSplits]);

  const totalAbs = Math.abs(transaction.amount);
  const allocated = useMemo(
    () => splits.reduce((acc, s) => acc + Math.abs(s.amount), 0),
    [splits],
  );
  const remaining = totalAbs - allocated;

  const catsByGroup = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories) {
      if (c.archived) continue;
      const arr = map.get(c.groupId) ?? [];
      arr.push(c);
      map.set(c.groupId, arr);
    }
    return map;
  }, [categories]);

  const addLine = () => {
    const remainingShare = totalAbs - allocated;
    setSplits([
      ...splits,
      {
        id: newId(),
        transactionId: transaction.id,
        categoryId: null,
        amount: remainingShare > 0 ? remainingShare : 0,
        merchant: '',
        notes: '',
        tagIds: [],
        createdAt: nowISO(),
        updatedAt: nowISO(),
      },
    ]);
  };

  const updateLine = (id: string, patch: Partial<TransactionSplit>) => {
    setSplits(splits.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowISO() } : s)));
  };

  const removeLine = (id: string) => {
    setSplits(splits.filter((s) => s.id !== id));
  };

  const submit = async () => {
    if (splits.length === 0) {
      setError('Add at least one split line.');
      return;
    }
    if (Math.abs(remaining) > 1) {
      setError(`Split lines total ${(allocated / 100).toFixed(2)} but the transaction is ${(totalAbs / 100).toFixed(2)}. Adjust the amounts.`);
      return;
    }
    setSaving(true);
    try {
      const sign = transaction.amount < 0 ? -1 : 1;
      await onSave(splits.map((s) => ({ ...s, amount: Math.abs(s.amount) * sign })));
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save splits.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Split transaction — ${transaction.merchant}`}
      size="lg"
      footer={
        <>
          <div className="mr-auto text-sm text-slate-500 dark:text-slate-400">
            {splits.length === 0 ? (
              'Split this transaction across multiple categories.'
            ) : (
              <>
                Allocated {allocated / 100} of {totalAbs / 100}
                {Math.abs(remaining) > 1 && <span className="ml-2 font-medium text-red-500">({(remaining / 100).toFixed(2)} remaining)</span>}
              </>
            )}
          </div>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Save splits'}</Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800">
        <span className="font-medium text-slate-700 dark:text-slate-200">{transaction.merchant}</span>
        <span className="font-semibold text-slate-900 dark:text-white">{(transaction.amount / 100).toFixed(2)}</span>
      </div>
      {splits.length === 0 ? (
        <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          No split lines yet.
          <div className="mt-3">
            <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addLine}>Add split line</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_130px_36px] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span>Category</span>
            <span className="text-right">Amount</span>
            <span />
          </div>
          {splits.map((s) => (
            <div key={s.id} className="grid grid-cols-[1fr_130px_36px] items-center gap-2">
              <Select value={s.categoryId ?? ''} onChange={(e) => updateLine(s.id, { categoryId: e.target.value || null })}>
                <option value="">Uncategorized</option>
                {groups.filter((g) => !g.archived).map((g) => (
                  <optgroup key={g.id} label={g.name}>
                    {(catsByGroup.get(g.id) ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </optgroup>
                ))}
              </Select>
              <Input
                type="number"
                step="0.01"
                value={(Math.abs(s.amount) / 100).toFixed(2)}
                onChange={(e) => {
                  const v = Math.round(Number(e.target.value) * 100);
                  updateLine(s.id, { amount: Number.isFinite(v) ? v : 0 });
                }}
                className="text-right"
                aria-label="Split amount"
              />
              <button className="btn-ghost p-1.5 text-red-500" onClick={() => removeLine(s.id)} aria-label="Remove split line">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={addLine}>Add split line</Button>
        </div>
      )}
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    </Modal>
  );
}