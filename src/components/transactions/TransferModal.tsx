import React, { useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { Modal } from '../ui/Modal';
import { Button, Card, EmptyState } from '../ui/basic';
import { Field, Select } from '../ui/form';
import type { Transaction } from '../../domain/types';
import { formatMoney } from '../../lib/money';
import { diffDays, formatDate } from '../../lib/dates';

/**
 * Transfer linking:
 *  - Link: pick an existing counterpart transaction.
 *  - Create pair: pick a target account; a matching counterpart transaction
 *    is created automatically.
 */
export function TransferModal({
  open,
  onClose,
  transaction,
  candidates,
  onLink,
  onCreatePair,
}: {
  open: boolean;
  onClose: () => void;
  transaction: Transaction;
  /** Candidate counterpart transactions (same amount, opposite sign). */
  candidates: Transaction[];
  onLink: (counterpart: Transaction) => Promise<void>;
  onCreatePair: (targetAccountId: string) => Promise<void>;
}) {
  const { accounts } = useApp();
  const [selectedId, setSelectedId] = useState<string>('');
  const [targetAccount, setTargetAccount] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    setSelectedId('');
    setError(null);
  }, [open]);

  const isOutflow = transaction.amount < 0;
  const amountAbs = Math.abs(transaction.amount);

  const submitLink = async () => {
    const c = candidates.find((x) => x.id === selectedId);
    if (!c) {
      setError('Select a transaction to link.');
      return;
    }
    setSaving(true);
    try {
      await onLink(c);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not link transfer.');
    } finally {
      setSaving(false);
    }
  };

  const submitCreate = async () => {
    if (!targetAccount) {
      setError('Select a target account.');
      return;
    }
    setSaving(true);
    try {
      await onCreatePair(targetAccount);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create transfer.');
    } finally {
      setSaving(false);
    }
  };

  const otherAccounts = accounts.filter((a) => a.active && a.id !== transaction.accountId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link transfer"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="mb-4 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800">
        <ArrowLeftRight className="h-4 w-4 text-slate-400" />
        <div className="text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-100">{transaction.merchant}</span>
          <span className="mx-2 text-slate-400">·</span>
          <span className="font-semibold text-slate-900 dark:text-white">{formatMoney(transaction.amount)}</span>
        </div>
      </div>

      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Link to an existing transaction</h3>
          {candidates.length === 0 ? (
            <Card>
              <EmptyState
                icon={<ArrowLeftRight className="h-5 w-5" />}
                title="No matching transactions found"
                description="Look for a transaction with the same amount in another account around the same date."
              />
            </Card>
          ) : (
            <div className="space-y-2">
              {candidates.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                    selectedId === c.id
                      ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="truncate">
                    <span className="font-medium text-slate-800 dark:text-slate-100">{c.merchant}</span>
                    <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{formatDate(c.date)}</span>
                    {Math.abs(diffDays(c.date, transaction.date)) > 1 && (
                      <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">
                        {diffDays(c.date, transaction.date)}d apart
                      </span>
                    )}
                  </span>
                  <span className={c.amount < 0 ? 'font-semibold text-red-600 dark:text-red-400' : 'font-semibold text-emerald-600 dark:text-emerald-400'}>
                    {formatMoney(c.amount)}
                  </span>
                </button>
              ))}
              <Button variant="primary" size="sm" onClick={submitLink} disabled={saving || !selectedId}>Link selected</Button>
            </div>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
          <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Or create a counterpart transaction
          </h3>
          <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
            A {formatMoney(amountAbs)} {isOutflow ? 'deposit into' : 'withdrawal from'} another account will be created
            on the same date and linked automatically. Transfers don&apos;t count as income or expenses.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Target account" className="min-w-[220px] flex-1">
              <Select value={targetAccount} onChange={(e) => setTargetAccount(e.target.value)}>
                <option value="">Select an account…</option>
                {otherAccounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Button variant="secondary" onClick={submitCreate} disabled={saving || !targetAccount}>
              Create & link
            </Button>
          </div>
        </div>
      </div>
      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
    </Modal>
  );
}