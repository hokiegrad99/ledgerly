import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardBody, EmptyState, Stat } from '../components/ui/basic';
import { Scale } from 'lucide-react';
import { netWorthFromAccounts, netWorthHistory } from '../domain/calculations';
import { formatMoney } from '../lib/money';
import { TrendAreaChart, MoneyBarChart } from '../components/ui/Charts';
import type { Account } from '../domain/types';
import { isLiabilityType } from '../domain/types';

const RANGES = [
  { months: 1, label: '1M' },
  { months: 3, label: '3M' },
  { months: 6, label: '6M' },
  { months: 12, label: '1Y' },
  { months: 36, label: '3Y' },
  { months: 60, label: '5Y' },
  { months: 120, label: 'All' },
];

export default function NetWorthPage() {
  const { accounts, repo, dataVersion } = useApp();
  const [range, setRange] = useState(12);
  const [historyTxns, setHistoryTxns] = useState<Awaited<ReturnType<typeof repo.getAllTransactions>>>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await repo.getAllTransactions();
      if (!cancelled) setHistoryTxns(all);
    })();
    return () => {
      cancelled = true;
    };
  }, [repo, dataVersion.txn]);

  const summary = useMemo(() => netWorthFromAccounts(accounts), [accounts]);

  const history = useMemo(() => netWorthHistory(accounts, historyTxns, range), [accounts, historyTxns, range]);

  const change = history.length >= 2 ? history[history.length - 1].netWorth - history[0].netWorth : 0;

  const included = accounts.filter((a) => a.includeInNetWorth);

  return (
    <div>
      <PageHeader
        title="Net worth"
        description="Assets minus liabilities over time. Accounts can be excluded from these calculations."
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card><div className="px-4 py-3"><Stat label="Net worth" value={formatMoney(summary.netWorth)} sub={`${change >= 0 ? '+' : ''}${formatMoney(change)} over this period`} tone={summary.netWorth >= 0 ? 'pos' : 'neg'} /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Assets" value={formatMoney(summary.assets)} tone="pos" /></div></Card>
        <Card><div className="px-4 py-3"><Stat label="Liabilities" value={formatMoney(summary.liabilities)} tone="neg" /></div></Card>
      </div>

      <Card className="mb-4">
        <CardBody>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Net worth over time</h3>
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
              {RANGES.map((r) => (
                <button
                  key={r.months}
                  onClick={() => setRange(r.months)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    range === r.months ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {history.length > 1 ? (
            <>
              <TrendAreaChart data={history.map((h) => ({ label: h.month, value: h.netWorth }))} dataKey="value" height={280} />
              <div className="mt-4">
                <MoneyBarChart
                  data={history.map((h) => ({ label: h.month, value: h.assets, assets: h.assets, liabilities: -h.liabilities }))}
                  dataKey="assets"
                  height={200}
                />
              </div>
            </>
          ) : (
            <EmptyState title="Not enough history" description="Add accounts and transactions to see your net worth trend." />
          )}
        </CardBody>
      </Card>

      <Card>
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 dark:border-slate-800 dark:text-slate-100">
          Included accounts ({included.length} of {accounts.length})
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800/70">
          {included.map((a) => (
            <AccountRow key={a.id} a={a} />
          ))}
          {included.length === 0 && <EmptyState icon={<Scale className="h-6 w-6" />} title="No accounts included" description="Add accounts, or check that some aren't excluded." />}
        </div>
        {accounts.length > included.length && (
          <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
            {accounts.length - included.length} account(s) are excluded from net worth (configure in Accounts).
          </div>
        )}
      </Card>
    </div>
  );
}

function AccountRow({ a }: { a: Account }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.name}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{a.institution || a.type}</div>
      </div>
      <span className={isLiabilityType(a.type) ? 'text-sm font-semibold text-red-600 dark:text-red-400' : 'text-sm font-semibold text-emerald-600 dark:text-emerald-400'}>
        {isLiabilityType(a.type) ? formatMoney(a.balance) : formatMoney(a.balance)}
      </span>
    </div>
  );
}