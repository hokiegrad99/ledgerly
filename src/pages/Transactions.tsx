import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, CheckCheck, Link2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, EmptyState, Badge, PageLoader, Stat } from '../components/ui/basic';
import { Select, SearchBox, Checkbox } from '../components/ui/form';
import { ConfirmDialog } from '../components/ui/Modal';
import { DropdownMenu, MenuItem } from '../components/ui/Menu';
import { TransactionFormModal, draftFromTransaction, emptyDraft, type TransactionDraft } from '../components/transactions/TransactionForm';
import { SplitModal } from '../components/transactions/SplitModal';
import { TransferModal } from '../components/transactions/TransferModal';
import type { Transaction, TransactionSplit, TransferPair } from '../domain/types';
import { isLiabilityType } from '../domain/types';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import { cashFlow, detectTransferPairs } from '../domain/calculations';
import { monthKeyOf, todayISO } from '../lib/dates';
import { applyRulesToTransaction } from '../domain/rules';
import type { TransactionQuery } from '../data/repository';

const PAGE_SIZE = 50;

interface Filters {
  dateFrom: string;
  dateTo: string;
  accountId: string;
  categoryId: string;
  type: string;
  reviewed: string;
  pending: string;
  transferOnly: boolean;
  tagId: string;
  search: string;
}

const DEFAULT_FILTERS: Filters = {
  dateFrom: '',
  dateTo: '',
  accountId: '',
  categoryId: '',
  type: '',
  reviewed: '',
  pending: '',
  transferOnly: false,
  tagId: '',
  search: '',
};

export default function TransactionsPage() {
  const { repo, accounts, categories, groups, tags, categoryById, accountById, dataVersion, refresh, bumpTxn } = useApp();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Editing state
  const [formOpen, setFormOpen] = useState(false);
  const [formDraft, setFormDraft] = useState<TransactionDraft>(emptyDraft(''));
  const [formTitle, setFormTitle] = useState('Add transaction');
  const [splitTxn, setSplitTxn] = useState<Transaction | null>(null);
  const [transferTxn, setTransferTxn] = useState<Transaction | null>(null);
  const [transferCandidates, setTransferCandidates] = useState<Transaction[]>([]);
  const [deleteIds, setDeleteIds] = useState<string[]>([]);

  const loadRef = useRef(0);

  const buildQuery = useCallback((): TransactionQuery => {
    const q: TransactionQuery = {
      dateFrom: filters.dateFrom || undefined,
      dateTo: filters.dateTo || undefined,
      accountId: filters.accountId || undefined,
      categoryId: filters.categoryId || undefined,
      merchant: filters.search || undefined,
      type: (filters.type as Transaction['type']) || undefined,
      tagId: filters.tagId || undefined,
      reviewed: filters.reviewed === 'reviewed' ? true : undefined,
      unreviewed: filters.reviewed === 'unreviewed' ? true : undefined,
      pending: filters.pending === 'pending' ? true : undefined,
      transferOnly: filters.transferOnly || undefined,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    };
    return q;
  }, [filters, page]);

  const load = useCallback(async () => {
    const q = buildQuery();
    setLoading(true);
    const myRef = ++loadRef.current;
    const res = await repo.queryTransactions(q);
    if (myRef !== loadRef.current) return;
    setRows(res.items);
    setTotal(res.total);
    setSplits(await repo.getSplitsForTransactions(res.items.map((t) => t.id)));
    setLoading(false);
  }, [buildQuery, repo]);

  useEffect(() => {
    void load();
  }, [load, dataVersion.txn]);

  // Reset page when filters change.
  useEffect(() => {
    setPage(0);
  }, [filters]);

  // Summary computed over the full filtered set (no pagination).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = buildQuery();
      delete q.offset;
      delete q.limit;
      const res = await repo.queryTransactions({ ...q, limit: 100000 });
      if (!cancelled) setSummaryData(cashFlow(res.items));
    })();
    return () => {
      cancelled = true;
    };
  }, [buildQuery, repo, dataVersion.txn]);
  const [summaryData, setSummaryData] = useState<ReturnType<typeof cashFlow> | null>(null);

  const accountCurrency = (id: string) => accountById(id)?.currency ?? 'USD';

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ------------------------------------------------------------- mutations

  const saveDraft = async (d: TransactionDraft) => {
    const acc = accountById(d.accountId);
    const isLiability = acc ? isLiabilityType(acc.type) : false;
    // For liability accounts, positive amounts are expenses (payments toward the card).
    let amount = d.amount;
    let type = d.type;
    if (isLiability && d.type === 'expense' && amount > 0) amount = -amount;
    if (!isLiability && d.type === 'expense' && amount > 0) amount = -amount;
    if (d.type === 'income' && amount < 0) amount = -amount;
    if (d.type === 'transfer') {
      // Transfers are created via the transfer modal; keep sign as entered.
    }
    const existing = rows.find((r) => r.id === d.id) ?? (await repo.getTransaction(d.id));
    const txn: Transaction = {
      id: d.id,
      accountId: d.accountId,
      date: d.date,
      amount,
      merchant: d.merchant,
      originalDescription: existing?.originalDescription ?? d.merchant,
      categoryId: d.categoryId,
      tagIds: d.tagIds,
      notes: d.notes,
      type,
      cleared: d.cleared,
      pending: d.pending,
      reviewed: d.reviewed,
      transferId: d.transferId ?? existing?.transferId ?? null,
      recurringId: existing?.recurringId ?? null,
      externalId: existing?.externalId ?? d.externalId,
      splitParentId: existing?.splitParentId ?? null,
      importSessionId: existing?.importSessionId ?? null,
      createdAt: existing?.createdAt ?? nowISO(),
      updatedAt: nowISO(),
    };
    // Apply rules on newly created transactions only.
    if (!existing) {
      const { txn: applied } = applyRulesToTransaction(rulesRef.current, txn, categoryById);
      await repo.saveTransaction(applied);
    } else {
      await repo.saveTransaction(txn);
    }
    bumpTxn();
    await refresh();
  };

  // Keep rules in a ref so saveDraft can access latest without re-creating.
  const { rules } = useApp();
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const openAdd = () => {
    const firstAccount = accounts.find((a) => a.active)?.id ?? '';
    setFormDraft(emptyDraft(firstAccount));
    setFormTitle('Add transaction');
    setFormOpen(true);
  };

  const openEdit = (t: Transaction) => {
    setFormDraft(draftFromTransaction(t));
    setFormTitle('Edit transaction');
    setFormOpen(true);
  };

  const duplicateTxn = async (t: Transaction) => {
    const copy: Transaction = {
      ...t,
      id: newId(),
      merchant: `${t.merchant} (copy)`,
      createdAt: nowISO(),
      updatedAt: nowISO(),
      reviewed: false,
    };
    await repo.saveTransaction(copy);
    bumpTxn();
    await refresh();
  };

  const markReviewed = async (ids: string[]) => {
    const txns = await repo.getAllTransactions();
    const updates = txns.filter((t) => ids.includes(t.id)).map((t) => ({ ...t, reviewed: true, updatedAt: nowISO() }));
    await repo.saveTransactions(updates);
    bumpTxn();
  };

  const doDelete = async (ids: string[]) => {
    await repo.deleteTransactions(ids);
    setSelected(new Set());
    bumpTxn();
    await refresh();
  };

  const applyBulkCategory = async (categoryId: string) => {
    const txns = await repo.getAllTransactions();
    const updates = txns.filter((t) => selected.has(t.id)).map((t) => ({ ...t, categoryId, reviewed: true, updatedAt: nowISO() }));
    await repo.saveTransactions(updates);
    bumpTxn();
    await refresh();
  };

  const applyBulkTag = async (tagId: string, add: boolean) => {
    const txns = await repo.getAllTransactions();
    const updates = txns
      .filter((t) => selected.has(t.id))
      .map((t) => {
        const tagIds = new Set(t.tagIds ?? []);
        if (add) tagIds.add(tagId);
        else tagIds.delete(tagId);
        return { ...t, tagIds: [...tagIds], updatedAt: nowISO() };
      });
    await repo.saveTransactions(updates);
    bumpTxn();
    await refresh();
  };

  // ---------------------------------------------------------------- splits

  const saveSplits = async (newSplits: TransactionSplit[]) => {
    if (!splitTxn) return;
    await repo.deleteSplitsForTransactions([splitTxn.id]);
    await repo.saveSplits(newSplits.map((s) => ({ ...s, transactionId: splitTxn.id })));
    bumpTxn();
    await refresh();
  };

  const openSplit = (t: Transaction) => {
    setSplitTxn(t);
  };

  const splitLines = useMemo(() => {
    const map = new Map<string, TransactionSplit[]>();
    for (const s of splits) {
      const arr = map.get(s.transactionId) ?? [];
      arr.push(s);
      map.set(s.transactionId, arr);
    }
    return map;
  }, [splits]);

  // --------------------------------------------------------------- transfers

  const openTransfer = async (t: Transaction) => {
    setTransferTxn(t);
    const all = await repo.getAllTransactions();
    const cands = all.filter(
      (c) =>
        c.id !== t.id &&
        c.amount === -t.amount &&
        c.accountId !== t.accountId &&
        !c.transferId &&
        !t.transferId,
    );
    setTransferCandidates(cands);
  };

  const linkTransfer = async (counterpart: Transaction) => {
    if (!transferTxn) return;
    const pairId = newId();
    const pair: TransferPair = {
      id: pairId,
      fromTransactionId: transferTxn.amount < 0 ? transferTxn.id : counterpart.id,
      toTransactionId: transferTxn.amount < 0 ? counterpart.id : transferTxn.id,
      amount: Math.abs(transferTxn.amount),
      date: transferTxn.date,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    const t1 = { ...transferTxn, transferId: pairId, type: 'transfer' as const, updatedAt: nowISO() };
    const t2 = { ...counterpart, transferId: pairId, type: 'transfer' as const, updatedAt: nowISO() };
    await repo.saveTransactions([t1, t2]);
    await repo.saveTransfer(pair);
    bumpTxn();
    await refresh();
  };

  const createTransferPair = async (targetAccountId: string) => {
    if (!transferTxn) return;
    const pairId = newId();
    const amount = Math.abs(transferTxn.amount);
    const isOutflow = transferTxn.amount < 0;
    const counterpart: Transaction = {
      id: newId(),
      accountId: targetAccountId,
      date: transferTxn.date,
      amount: isOutflow ? amount : -amount,
      merchant: isOutflow ? `Transfer from ${accountById(transferTxn.accountId)?.name ?? 'account'}` : `Transfer to ${accountById(transferTxn.accountId)?.name ?? 'account'}`,
      originalDescription: 'Transfer (auto-created)',
      categoryId: null,
      tagIds: [],
      notes: '',
      type: 'transfer',
      cleared: true,
      pending: false,
      reviewed: true,
      transferId: pairId,
      recurringId: null,
      externalId: null,
      splitParentId: null,
      importSessionId: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    const t1: Transaction = { ...transferTxn, transferId: pairId, type: 'transfer', updatedAt: nowISO() };
    const pair: TransferPair = {
      id: pairId,
      fromTransactionId: isOutflow ? t1.id : counterpart.id,
      toTransactionId: isOutflow ? counterpart.id : t1.id,
      amount,
      date: transferTxn.date,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    await repo.saveTransactions([t1, counterpart]);
    await repo.saveTransfer(pair);
    bumpTxn();
    await refresh();
  };

  const unlinkTransfer = async (t: Transaction) => {
    if (!t.transferId) return;
    const [txns, pairs] = await Promise.all([repo.getAllTransactions(), repo.getTransfers()]);
    const pair = pairs.find((p) => p.id === t.transferId);
    const updates = txns.filter((x) => x.transferId === t.transferId).map((x) => ({ ...x, transferId: null, updatedAt: nowISO() }));
    await repo.saveTransactions(updates);
    if (pair) await repo.deleteTransfer(pair.id);
    bumpTxn();
    await refresh();
  };

  const runTransferDetection = async () => {
    const all = await repo.getAllTransactions();
    const pairs = detectTransferPairs(all, accounts);
    if (pairs.length === 0) return;
    let linked = 0;
    for (const p of pairs) {
      const pairId = newId();
      const pair: TransferPair = {
        id: pairId,
        fromTransactionId: p.from.id,
        toTransactionId: p.to.id,
        amount: Math.abs(p.from.amount),
        date: p.from.date,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      };
      await repo.saveTransactions([
        { ...p.from, transferId: pairId, type: 'transfer', updatedAt: nowISO() },
        { ...p.to, transferId: pairId, type: 'transfer', updatedAt: nowISO() },
      ]);
      await repo.saveTransfer(pair);
      linked++;
    }
    bumpTxn();
    await refresh();
    alert(`Linked ${linked} possible transfer pair${linked === 1 ? '' : 's'}.`);
  };

  // ------------------------------------------------------------------ view

  const catsByGroup = useMemo(() => {
    const map = new Map<string, typeof categories>();
    for (const c of categories) {
      const arr = map.get(c.groupId) ?? [];
      arr.push(c);
      map.set(c.groupId, arr);
    }
    return map;
  }, [categories]);

  const expenseGroups = groups.filter((g) => !g.archived);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterEls = (
    <div className="mb-4 space-y-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={filters.search}
          onChange={(v) => setFilters((f) => ({ ...f, search: v }))}
          placeholder="Search transactions…"
          className="min-w-[180px] flex-1"
        />
        <Select className="w-auto" value={filters.accountId} onChange={(e) => setFilters((f) => ({ ...f, accountId: e.target.value }))} aria-label="Filter by account">
          <option value="">All accounts</option>
          {accounts.filter((a) => a.active).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select className="w-auto" value={filters.categoryId} onChange={(e) => setFilters((f) => ({ ...f, categoryId: e.target.value }))} aria-label="Filter by category">
          <option value="">All categories</option>
          {expenseGroups.map((g) => (
            <optgroup key={g.id} label={g.name}>
              {(catsByGroup.get(g.id) ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Select className="w-auto" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} aria-label="Filter by type">
          <option value="">All types</option>
          <option value="expense">Expenses</option>
          <option value="income">Income</option>
          <option value="transfer">Transfers</option>
        </Select>
        <Select className="w-auto" value={filters.reviewed} onChange={(e) => setFilters((f) => ({ ...f, reviewed: e.target.value }))} aria-label="Filter by reviewed status">
          <option value="">Reviewed: all</option>
          <option value="reviewed">Reviewed</option>
          <option value="unreviewed">Unreviewed</option>
        </Select>
        <Select className="w-auto" value={filters.tagId} onChange={(e) => setFilters((f) => ({ ...f, tagId: e.target.value }))} aria-label="Filter by tag">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" className="input w-auto" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} aria-label="From date" />
        <span className="text-xs text-slate-400">to</span>
        <input type="date" className="input w-auto" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} aria-label="To date" />
        <button
          className="btn-secondary text-xs"
          onClick={() => {
            const m = monthKeyOf(todayISO());
            setFilters((f) => ({ ...f, dateFrom: `${m}-01`, dateTo: todayISO() }));
          }}
        >
          This month
        </button>
        <button
          className="btn-secondary text-xs"
          onClick={() => setFilters((f) => ({ ...f, dateFrom: '', dateTo: '' }))}
        >
          All time
        </button>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={filters.transferOnly} onChange={(e) => setFilters((f) => ({ ...f, transferOnly: e.target.checked }))} className="h-3.5 w-3.5" />
          Transfers only
        </label>
        <button className="btn-secondary text-xs" onClick={runTransferDetection} title="Find transactions that look like transfers and link them">
          <Link2 className="h-3.5 w-3.5" /> Detect transfers
        </button>
        {total > 0 && <span className="ml-auto text-xs text-slate-400">{total.toLocaleString()} transactions</span>}
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="Search, filter, and manage every transaction. Transfers and splits are handled automatically."
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add transaction</Button>}
      />

      {/* Summary */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><div className="px-4 py-3"><Stat label="Income (filtered)" value={summaryData ? formatMoney(summaryData.income) : '…'} tone="pos" /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Expenses (filtered)" value={summaryData ? formatMoney(summaryData.expenses) : '…'} tone="neg" /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Net (filtered)" value={summaryData ? formatMoney(summaryData.net) : '…'} sub={summaryData ? `Based on ${total} matching transactions` : undefined} /></div></Card>
      </div>

      {filterEls}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-brand-50 px-3 py-2 dark:bg-brand-900/30">
          <span className="text-sm font-medium text-brand-800 dark:text-brand-200">{selected.size} selected</span>
          <div className="flex-1" />
          <Select
            className="w-auto text-xs"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                applyBulkCategory(e.target.value);
              }
            }}
            aria-label="Set category for selected"
          >
            <option value="">Set category…</option>
            {expenseGroups.map((g) => (
              <optgroup key={g.id} label={g.name}>
                {(catsByGroup.get(g.id) ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select
            className="w-auto text-xs"
            value=""
            onChange={(e) => {
              if (e.target.value) void applyBulkTag(e.target.value, true);
            }}
            aria-label="Add tag to selected"
          >
            <option value="">Add tag…</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          <Button variant="secondary" size="sm" icon={<CheckCheck className="h-3.5 w-3.5" />} onClick={() => void markReviewed([...selected])}>
            Mark reviewed
          </Button>
          <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => setDeleteIds([...selected])}>
            Delete
          </Button>
        </div>
      )}

      {loading ? (
        <PageLoader />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title={total === 0 ? 'No transactions yet' : 'No matching transactions'}
            description={
              total === 0
                ? 'Add a transaction manually or import a CSV/QFX statement from your bank.'
                : 'Try adjusting your filters or search terms.'
            }
            action={total === 0 ? <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={openAdd}>Add transaction</Button> : undefined}
          />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base min-w-[720px]">
              <thead>
                <tr>
                  <th className="w-8">
                    <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Select all" />
                  </th>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Account</th>
                  <th>Category</th>
                  <th className="text-right">Amount</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const isSplit = splitLines.has(t.id);
                  return (
                    <tr key={t.id} className={selected.has(t.id) ? 'bg-brand-50/60 dark:bg-brand-900/20' : ''}>
                      <td>
                        <Checkbox checked={selected.has(t.id)} onChange={() => toggleOne(t.id)} aria-label={`Select ${t.merchant}`} />
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{t.date}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button className="max-w-[220px] truncate text-left text-sm font-medium text-slate-900 hover:underline dark:text-slate-100" onClick={() => openEdit(t)} title={t.merchant}>
                            {t.merchant}
                          </button>
                          {t.pending && <Badge tone="amber">Pending</Badge>}
                          {!t.reviewed && <Badge tone="blue">New</Badge>}
                          {t.type === 'transfer' && <Badge tone="purple">Transfer</Badge>}
                          {isSplit && <Badge tone="neutral">Split</Badge>}
                        </div>
                        {t.notes && <div className="mt-0.5 truncate text-xs text-slate-400 dark:text-slate-500">{t.notes}</div>}
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">{accountById(t.accountId)?.name ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-300">{categoryById(t.categoryId)?.name ?? (isSplit ? 'Split' : '—')}</td>
                      <td className={`whitespace-nowrap text-right text-sm font-semibold ${t.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatMoney(t.amount, accountCurrency(t.accountId))}
                      </td>
                      <td>
                        <DropdownMenu>
                          <MenuItem onClick={() => openEdit(t)}>Edit</MenuItem>
                          <MenuItem onClick={() => openSplit(t)}>Split…</MenuItem>
                          <MenuItem onClick={() => void duplicateTxn(t)}>Duplicate</MenuItem>
                          {t.transferId ? (
                            <MenuItem onClick={() => void unlinkTransfer(t)}>Unlink transfer</MenuItem>
                          ) : (
                            <MenuItem onClick={() => void openTransfer(t)}>Link transfer…</MenuItem>
                          )}
                          <MenuItem onClick={() => void markReviewed([t.id])}>Mark reviewed</MenuItem>
                          <MenuItem danger onClick={() => setDeleteIds([t.id])}>Delete</MenuItem>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {total === 0 ? '0 transactions' : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)} icon={<ChevronLeft className="h-4 w-4" />}>
                Prev
              </Button>
              <span className="px-2 text-xs text-slate-500">{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
                Next <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Modals */}
      {formOpen && (
        <TransactionFormModal
          open={formOpen}
          onClose={() => setFormOpen(false)}
          draft={formDraft}
          onSave={saveDraft}
          title={formTitle}
        />
      )}
      {splitTxn && (
        <SplitModal
          open={!!splitTxn}
          onClose={() => setSplitTxn(null)}
          transaction={splitTxn}
          existingSplits={splitLines.get(splitTxn.id) ?? []}
          onSave={saveSplits}
        />
      )}
      {transferTxn && (
        <TransferModal
          open={!!transferTxn}
          onClose={() => setTransferTxn(null)}
          transaction={transferTxn}
          candidates={transferCandidates}
          onLink={linkTransfer}
          onCreatePair={createTransferPair}
        />
      )}
      <ConfirmDialog
        open={deleteIds.length > 0}
        onClose={() => setDeleteIds([])}
        onConfirm={() => void doDelete(deleteIds)}
        danger
        title={`Delete ${deleteIds.length} transaction${deleteIds.length === 1 ? '' : 's'}?`}
        confirmLabel="Delete"
        message="This permanently deletes the selected transactions and any associated splits. This cannot be undone."
      />
    </div>
  );
}