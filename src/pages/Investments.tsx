import { useMemo, useState } from 'react';
import { Plus, LineChart, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, EmptyState, Stat, Badge } from '../components/ui/basic';
import { Field, Input, Select, AmountInput } from '../components/ui/form';
import { Modal, ConfirmDialog } from '../components/ui/Modal';
import { DonutChart, LegendList, CHART_COLORS } from '../components/ui/Charts';
import { portfolioSummary, investmentPerformance } from '../domain/calculations';
import { formatMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import type { Holding, InvestmentTransaction, InvestmentTxType, Security, SecurityType } from '../domain/types';
import { SECURITY_TYPES, INVESTMENT_TX_TYPES } from '../domain/types';
import { todayISO } from '../lib/dates';

function HoldingFormModal({ open, onClose, holding }: { open: boolean; onClose: () => void; holding: Holding | null }) {
  const { repo, refresh, accounts, securities, bumpTxn } = useApp();
  const [form, setForm] = useState<Holding>(() =>
    holding ?? {
      id: newId(),
      accountId: accounts.find((a) => a.type === 'brokerage' || a.type === 'retirement' || a.type === '401k' || a.type === 'ira' || a.type === 'roth-ira')?.id ?? accounts[0]?.id ?? '',
      securityId: securities[0]?.id ?? '',
      shares: 0,
      costBasis: 0,
      currentPrice: 0,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );
  const [sharesText, setSharesText] = useState(holding ? String(holding.shares) : '');

  const submit = async () => {
    if (!form.accountId || !form.securityId) return;
    const shares = Number(sharesText) || 0;
    await repo.saveHolding({ ...form, shares, updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={holding ? 'Edit holding' : 'Add holding'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{holding ? 'Save' : 'Add holding'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account">
          <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            {accounts.filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Security">
          <Select value={form.securityId} onChange={(e) => setForm({ ...form, securityId: e.target.value })}>
            {securities.map((s) => (
              <option key={s.id} value={s.id}>{s.symbol} — {s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Shares">
          <Input type="number" step="any" value={sharesText} onChange={(e) => setSharesText(e.target.value)} placeholder="0.000" />
        </Field>
        <Field label="Current price per share">
          <AmountInput value={form.currentPrice} onChange={(v) => setForm({ ...form, currentPrice: v ?? 0 })} />
        </Field>
        <Field label="Cost basis (total)" className="sm:col-span-2">
          <AmountInput value={form.costBasis} onChange={(v) => setForm({ ...form, costBasis: v ?? 0 })} />
        </Field>
      </div>
    </Modal>
  );
}

function SecurityFormModal({ open, onClose, security }: { open: boolean; onClose: () => void; security: Security | null }) {
  const { repo, refresh, bumpTxn } = useApp();
  const [form, setForm] = useState<Security>(() =>
    security ?? {
      id: newId(),
      symbol: '',
      name: '',
      type: 'etf',
      assetClass: '',
      currency: 'USD',
      createdAt: nowISO(),
      updatedAt: nowISO(),
    },
  );

  const submit = async () => {
    if (!form.symbol.trim()) return;
    await repo.saveSecurity({ ...form, symbol: form.symbol.trim().toUpperCase(), name: form.name.trim(), updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={security ? `Edit ${security.symbol}` : 'Add security'}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>{security ? 'Save' : 'Add security'}</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Symbol / ticker">
          <Input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })} placeholder="VTI" />
        </Field>
        <Field label="Security type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as SecurityType })}>
            {SECURITY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Name" className="sm:col-span-2">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Vanguard Total Stock Market ETF" />
        </Field>
        <Field label="Asset class">
          <Input value={form.assetClass} onChange={(e) => setForm({ ...form, assetClass: e.target.value })} placeholder="US Equities" />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
            {['USD', 'EUR', 'GBP', 'CAD', 'JPY', 'CHF'].map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}

function InvestmentTxForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { repo, refresh, accounts, securities, bumpTxn } = useApp();
  const [form, setForm] = useState<InvestmentTransaction>(() => ({
    id: newId(),
    accountId: accounts[0]?.id ?? '',
    securityId: securities[0]?.id ?? null,
    date: todayISO(),
    type: 'buy',
    shares: 0,
    price: 0,
    amount: 0,
    fees: 0,
    notes: '',
    createdAt: nowISO(),
    updatedAt: nowISO(),
  }));
  const [sharesText, setSharesText] = useState('');

  const submit = async () => {
    if (!form.accountId) return;
    const shares = Number(sharesText) || 0;
    await repo.saveInvestmentTransaction({ ...form, shares, updatedAt: nowISO() });
    bumpTxn();
    await refresh();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record investment activity"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit}>Save</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as InvestmentTxType })}>
            {INVESTMENT_TX_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </Field>
        <Field label="Account">
          <Select value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
            {accounts.filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Security">
          <Select value={form.securityId ?? ''} onChange={(e) => setForm({ ...form, securityId: e.target.value || null })}>
            <option value="">—</option>
            {securities.map((s) => (
              <option key={s.id} value={s.id}>{s.symbol} — {s.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Shares">
          <Input type="number" step="any" value={sharesText} onChange={(e) => setSharesText(e.target.value)} />
        </Field>
        <Field label="Price per share">
          <AmountInput value={form.price} onChange={(v) => setForm({ ...form, price: v ?? 0 })} />
        </Field>
        <Field label="Total amount">
          <AmountInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v ?? 0 })} />
        </Field>
        <Field label="Fees">
          <AmountInput value={form.fees} onChange={(v) => setForm({ ...form, fees: v ?? 0 })} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
    </Modal>
  );
}

export default function InvestmentsPage() {
  const { holdings, securities, investmentTransactions, accounts, repo, refresh, bumpTxn, accountById } = useApp();
  const [tab, setTab] = useState<'holdings' | 'activity' | 'securities'>('holdings');
  const [holdingModal, setHoldingModal] = useState(false);
  const [holdingEdit, setHoldingEdit] = useState<Holding | null>(null);
  const [securityModal, setSecurityModal] = useState(false);
  const [securityEdit, setSecurityEdit] = useState<Security | null>(null);
  const [txModal, setTxModal] = useState(false);
  const [deleting, setDeleting] = useState<Holding | null>(null);

  const portfolio = useMemo(() => portfolioSummary(holdings, securities, accounts), [holdings, securities, accounts]);
  const perf = useMemo(() => investmentPerformance(investmentTransactions), [investmentTransactions]);

  const allocationByType = useMemo(
    () => [...portfolio.bySecurityType.entries()].map(([name, value]) => ({ name, value })),
    [portfolio],
  );
  const allocationByClass = useMemo(
    () => [...portfolio.byAssetClass.entries()].map(([name, value]) => ({ name, value })),
    [portfolio],
  );
  const allocationByAccount = useMemo(
    () => [...portfolio.byAccount.entries()].map(([name, value]) => ({ name, value })),
    [portfolio],
  );

  const deleteHolding = async () => {
    if (!deleting) return;
    await repo.deleteHolding(deleting.id);
    bumpTxn();
    await refresh();
    setDeleting(null);
  };

  const tabs = (
    <div className="mb-4 flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" style={{ width: 'fit-content' }}>
      {(['holdings', 'activity', 'securities'] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === t ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
          }`}
        >
          {t === 'holdings' ? 'Holdings' : t === 'activity' ? 'Activity' : 'Securities'}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Investments"
        description="Track your portfolio without connecting to a brokerage. Prices are updated manually."
        actions={
          <>
            <Button variant="secondary" onClick={() => { setSecurityEdit(null); setSecurityModal(true); }}>Add security</Button>
            <Button variant="secondary" onClick={() => setTxModal(true)}>Record activity</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setHoldingEdit(null); setHoldingModal(true); }}>Add holding</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card><div className="px-4 py-3"><Stat label="Portfolio value" value={formatMoney(portfolio.totalValue)} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Total cost basis" value={formatMoney(portfolio.totalCostBasis)} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Gain / loss" value={`${portfolio.totalGainLoss >= 0 ? '+' : ''}${formatMoney(portfolio.totalGainLoss)}`} tone={portfolio.totalGainLoss >= 0 ? 'pos' : 'neg'} sub={`${portfolio.totalGainLossPct >= 0 ? '+' : ''}${portfolio.totalGainLossPct}%`} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Contributions" value={formatMoney(perf.contributions)} sub={`Income received ${formatMoney(perf.income)}`} /></div></Card>
      </div>

      {tabs}

      {tab === 'holdings' && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">By security type</div>
              <CardBody>
                <DonutChart data={allocationByType} height={160} formatter={(v) => formatMoney(v)} />
                <div className="mt-3">
                  <LegendList items={allocationByType.slice(0, 6).map((s, i) => ({ ...s, color: CHART_COLORS[i] }))} formatter={(v) => formatMoney(v)} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">By asset class</div>
              <CardBody>
                <DonutChart data={allocationByClass} height={160} formatter={(v) => formatMoney(v)} />
                <div className="mt-3">
                  <LegendList items={allocationByClass.slice(0, 6).map((s, i) => ({ ...s, color: CHART_COLORS[i] }))} formatter={(v) => formatMoney(v)} />
                </div>
              </CardBody>
            </Card>
            <Card>
              <div className="border-b border-slate-100 px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">By account</div>
              <CardBody>
                <DonutChart data={allocationByAccount} height={160} formatter={(v) => formatMoney(v)} />
                <div className="mt-3">
                  <LegendList items={allocationByAccount.slice(0, 6).map((s, i) => ({ ...s, color: CHART_COLORS[i] }))} formatter={(v) => formatMoney(v)} />
                </div>
              </CardBody>
            </Card>
          </div>

          <Card className="overflow-hidden">
            {portfolio.holdings.length === 0 ? (
              <EmptyState
                icon={<LineChart className="h-6 w-6" />}
                title="No holdings yet"
                description="Add securities and holdings to track your portfolio."
                action={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setHoldingEdit(null); setHoldingModal(true); }}>Add holding</Button>}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-base min-w-[760px]">
                  <thead>
                    <tr>
                      <th>Security</th>
                      <th className="text-right">Shares</th>
                      <th className="text-right">Price</th>
                      <th className="text-right">Market value</th>
                      <th className="text-right">Cost basis</th>
                      <th className="text-right">Gain / loss</th>
                      <th className="text-right">Allocation</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {portfolio.holdings.map(({ security, holding, marketValue, gainLoss, gainLossPct }) => (
                      <tr key={holding.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{security.symbol}</span>
                            <Badge tone="neutral">{security.type}</Badge>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{security.name}</div>
                        </td>
                        <td className="text-right text-sm tabular-nums">{holding.shares}</td>
                        <td className="text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">{formatMoney(holding.currentPrice)}</td>
                        <td className="text-right text-sm font-semibold tabular-nums">{formatMoney(marketValue)}</td>
                        <td className="text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">{formatMoney(holding.costBasis)}</td>
                        <td className={`text-right text-sm font-semibold tabular-nums ${gainLoss >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {gainLoss >= 0 ? '+' : ''}{formatMoney(gainLoss)} <span className="text-xs font-normal text-slate-400">({gainLossPct >= 0 ? '+' : ''}{gainLossPct}%)</span>
                        </td>
                        <td className="text-right text-xs text-slate-500 dark:text-slate-400">
                          {portfolio.totalValue > 0 ? Math.round((marketValue / portfolio.totalValue) * 100) : 0}%
                        </td>
                        <td>
                          <div className="flex gap-1">
                            <button className="btn-ghost p-1 text-xs" onClick={() => { setHoldingEdit(holding); setHoldingModal(true); }}>Edit</button>
                            <button className="btn-ghost p-1 text-red-500" onClick={() => setDeleting(holding)} aria-label="Delete holding">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      {tab === 'activity' && (
        <Card className="overflow-hidden">
          {investmentTransactions.length === 0 ? (
            <EmptyState title="No investment activity yet" description="Record buys, sells, dividends, and more." action={<Button variant="primary" onClick={() => setTxModal(true)}>Record activity</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-[640px]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Account</th>
                    <th>Security</th>
                    <th className="text-right">Shares</th>
                    <th className="text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {[...investmentTransactions].sort((a, b) => b.date.localeCompare(a.date)).map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-xs text-slate-500">{t.date}</td>
                      <td><Badge tone="blue">{t.type}</Badge></td>
                      <td className="whitespace-nowrap text-xs">{accountById(t.accountId)?.name ?? '—'}</td>
                      <td className="whitespace-nowrap text-xs">{securities.find((s) => s.id === t.securityId)?.symbol ?? '—'}</td>
                      <td className="text-right text-sm tabular-nums">{t.shares || '—'}</td>
                      <td className="text-right text-sm font-semibold tabular-nums">{formatMoney(t.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {tab === 'securities' && (
        <Card className="overflow-hidden">
          {securities.length === 0 ? (
            <EmptyState title="No securities" description="Add securities to start tracking holdings." action={<Button variant="primary" onClick={() => { setSecurityEdit(null); setSecurityModal(true); }}>Add security</Button>} />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base min-w-[560px]">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Asset class</th>
                    <th>Currency</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {securities.map((s) => (
                    <tr key={s.id}>
                      <td className="text-sm font-semibold text-slate-900 dark:text-slate-100">{s.symbol}</td>
                      <td className="text-sm text-slate-700 dark:text-slate-300">{s.name}</td>
                      <td><Badge tone="neutral">{s.type}</Badge></td>
                      <td className="text-xs text-slate-500">{s.assetClass || '—'}</td>
                      <td className="text-xs text-slate-500">{s.currency}</td>
                      <td>
                        <button className="btn-ghost p-1 text-xs" onClick={() => { setSecurityEdit(s); setSecurityModal(true); }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {holdingModal && <HoldingFormModal open={holdingModal} onClose={() => setHoldingModal(false)} holding={holdingEdit} />}
      {securityModal && <SecurityFormModal open={securityModal} onClose={() => setSecurityModal(false)} security={securityEdit} />}
      {txModal && <InvestmentTxForm open={txModal} onClose={() => setTxModal(false)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={deleteHolding}
        danger
        title="Delete holding?"
        confirmLabel="Delete"
        message="This removes the holding from your portfolio. Investment activity records are not affected."
      />
    </div>
  );
}