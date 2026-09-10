import { useMemo, useState } from 'react';
import { Plus, Wallet, Building2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, EmptyState, Badge } from '../components/ui/basic';
import { Field, Input, Select, Textarea, Toggle } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { ACCOUNT_TYPES, type Account, type AccountType, isLiabilityType } from '../domain/types';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import { netWorthFromAccounts } from '../domain/calculations';

const TYPE_ICON: Record<string, string> = {
  checking: '🏦', savings: '💰', cash: '💵', 'credit-card': '💳', mortgage: '🏠',
  'auto-loan': '🚗', 'student-loan': '🎓', 'personal-loan': '🤝', brokerage: '📈',
  retirement: '🌴', '401k': '🏖️', ira: '🏦', 'roth-ira': '🏦', hsa: '🩺',
  crypto: '🪙', 'real-estate': '🏡', 'other-asset': '📦', 'other-liability': '📄',
};

function AccountFormModal({ open, onClose, account, onDelete }: { open: boolean; onClose: () => void; account: Account | null; onDelete?: () => void }) {
  const { repo, refresh, bumpTxn } = useApp();
  const isNew = !account;
  const [form, setForm] = useState<Account>(() =>
    account ?? {
      id: newId(),
      name: '',
      institution: '',
      type: 'checking',
      lastFour: '',
      balance: 0,
      startingBalance: 0,
      currency: 'USD',
      notes: '',
      active: true,
      includeInNetWorth: true,
      includeInBudget: true,
      includeInReports: true,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );
  const [balanceDraft, setBalanceDraft] = useState<string>(
    account ? (account.balance / 100).toFixed(2) : '0.00',
  );

  const isLiability = isLiabilityType(form.type);
  const balanceCents = Math.round(Number(balanceDraft.replace(/[^0-9.\-]/g, '')) * 100) || 0;
  const signedBalance = isLiability ? -Math.abs(balanceCents) : balanceCents;

  const submit = async () => {
    if (!form.name.trim()) return;
    // For new accounts, treat the entered balance as the starting balance
    // (no transactions yet). For edits, only update `balance` if transactions are unchanged.
    const next: Account = {
      ...form,
      name: form.name.trim(),
      institution: form.institution.trim(),
      updatedAt: nowISO(),
      balance: signedBalance,
      startingBalance: isNew ? signedBalance : form.startingBalance,
    };
    if (isNew) {
      await repo.saveAccount(next);
    } else {
      // Editing: preserve starting balance; recompute balance from transactions if any exist.
      await repo.saveAccount(next);
      await repo.recomputeBalances();
    }
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isNew ? 'Add account' : `Edit ${account?.name}`}
      size="lg"
      footer={
        <>
          {!isNew && onDelete && (
            <Button variant="danger" className="mr-auto" onClick={onDelete}>Delete account</Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!form.name.trim()}>
            {isNew ? 'Add account' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Everyday Checking" />
        </Field>
        <Field label="Account type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as AccountType })}>
            {ACCOUNT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{TYPE_ICON[t.value]} {t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Institution">
          <Input value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })} placeholder="e.g. First Community Bank" />
        </Field>
        <Field label={`Current balance (${form.currency})`}>
          <Input value={balanceDraft} onChange={(e) => setBalanceDraft(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Last 4 digits" hint="Optional">
          <Input value={form.lastFour} maxLength={4} onChange={(e) => setForm({ ...form, lastFour: e.target.value.replace(/\D/g, '') })} placeholder="1234" />
        </Field>
        <Field label="Currency" className="sm:col-span-2">
          <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'SEK', 'NOK', 'DKK', 'PLN', 'INR', 'BRL', 'MXN'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
        </Field>
        <div className="space-y-3 sm:col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Active</span>
            <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} label="Active" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Include in net worth</span>
            <Toggle checked={form.includeInNetWorth} onChange={(v) => setForm({ ...form, includeInNetWorth: v })} label="Include in net worth" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Include in budget</span>
            <Toggle checked={form.includeInBudget} onChange={(v) => setForm({ ...form, includeInBudget: v })} label="Include in budget" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-700 dark:text-slate-300">Include in reports</span>
            <Toggle checked={form.includeInReports} onChange={(v) => setForm({ ...form, includeInReports: v })} label="Include in reports" />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function AccountsPage() {
  const { accounts, repo, refresh, bumpTxn, settings } = useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [deleting, setDeleting] = useState<Account | null>(null);

  const { assets, liabilities, netWorth } = useMemo(() => netWorthFromAccounts(accounts), [accounts]);

  const assetsList = accounts.filter((a) => !isLiabilityType(a.type));
  const liabilitiesList = accounts.filter((a) => isLiabilityType(a.type));

  const openNew = () => {
    setEditing(null);
    setModalOpen(true);
  };
  const openEdit = (a: Account) => {
    setEditing(a);
    setModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    await repo.deleteAccount(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
    setEditing(null);
  };

  const AccountRow = ({ a }: { a: Account }) => (
    <button
      onClick={() => openEdit(a)}
      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg dark:bg-slate-800">
        {TYPE_ICON[a.type] ?? '💳'}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{a.name}</span>
          {!a.active && <Badge tone="neutral">Inactive</Badge>}
          {!a.includeInNetWorth && <Badge tone="amber">Excluded from net worth</Badge>}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {a.institution && <><Building2 className="h-3 w-3" /> {a.institution}</>}
          {a.institution && a.lastFour && <span>·</span>}
          {a.lastFour && <span>•••• {a.lastFour}</span>}
          {a.currency !== settings.currency && <span className="text-amber-600 dark:text-amber-400">({a.currency})</span>}
        </div>
      </div>
      <div className={isLiabilityType(a.type) ? 'text-right text-sm font-semibold text-red-600 dark:text-red-400' : 'text-right text-sm font-semibold text-slate-900 dark:text-slate-100'}>
        {formatMoney(a.balance, a.currency)}
      </div>
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Accounts"
        description="Manage all your accounts. Balances update automatically as transactions are added."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>Add account</Button>}
      />

      <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><CardBody><div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total assets</div><div className="mt-0.5 text-xl font-semibold text-emerald-600 dark:text-emerald-400">{formatMoney(assets)}</div></CardBody></Card>
        <Card><CardBody><div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total liabilities</div><div className="mt-0.5 text-xl font-semibold text-red-600 dark:text-red-400">{formatMoney(liabilities)}</div></CardBody></Card>
        <Card><CardBody><div className="text-xs font-medium text-slate-500 dark:text-slate-400">Net worth</div><div className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-white">{formatMoney(netWorth)}</div></CardBody></Card>
      </div>

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet className="h-6 w-6" />}
            title="No accounts yet"
            description="Add your checking, savings, credit cards, loans, and investment accounts to get started."
            action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openNew}>Add your first account</Button>}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Assets</div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {assetsList.map((a) => <AccountRow key={a.id} a={a} />)}
            </div>
          </Card>
          <Card>
            <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">Liabilities & debts</div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {liabilitiesList.map((a) => <AccountRow key={a.id} a={a} />)}
            </div>
          </Card>
        </div>
      )}

      {modalOpen && (
        <AccountFormModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          account={editing}
          onDelete={editing ? () => { setModalOpen(false); setDeleting(editing); } : undefined}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        danger
        title={`Delete ${deleting?.name}?`}
        confirmLabel="Delete account"
        message={
          <span>
            This will permanently delete the account <strong>{deleting?.name}</strong> and all of its
            transactions, splits, and holdings. This cannot be undone. Consider exporting a backup first.
          </span>
        }
      />
    </div>
  );
}