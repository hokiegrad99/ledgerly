import React, { Suspense, lazy, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { useApp } from './store/AppContext';
import { PageLoader, Card } from './components/ui/basic';
import { Landmark, Sparkles, FileDown } from 'lucide-react';

// Route-level code splitting (REQ-009): each page ships as its own chunk so the
// initial download stays small; the heavy chart/report pages load on demand.
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const TransactionsPage = lazy(() => import('./pages/Transactions'));
const BudgetPage = lazy(() => import('./pages/Budget'));
const GoalsPage = lazy(() => import('./pages/Goals'));
const RecurringPage = lazy(() => import('./pages/Recurring'));
const AccountsPage = lazy(() => import('./pages/Accounts'));
const InvestmentsPage = lazy(() => import('./pages/Investments'));
const NetWorthPage = lazy(() => import('./pages/NetWorth'));
const ReportsPage = lazy(() => import('./pages/Reports'));
const PlanningPage = lazy(() => import('./pages/Planning'));
const ImportExportPage = lazy(() => import('./pages/ImportExport'));
const SettingsPage = lazy(() => import('./pages/Settings'));

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { ready, accounts, transactionCount, repo, refresh, settings, updateSettings } = useApp();
  const [loading, setLoading] = useState(false);

  if (!ready) return <PageLoader />;

  // Show onboarding only on a truly empty first run (no accounts, no transactions,
  // and no explicit choice made yet).
  const needsOnboarding = accounts.length === 0 && transactionCount === 0 && !settings.demoDataLoaded;

  if (!needsOnboarding) return <>{children}</>;

  const loadDemo = async () => {
    setLoading(true);
    try {
      // Loaded on demand so the fictional ~300-transaction dataset never sits
      // in the initial bundle.
      const { buildSampleData } = await import('./data/sample-data');
      const demo = buildSampleData();
      await repo.importAll(demo, { replace: false });
      await updateSettings({ demoDataLoaded: true, firstName: 'Alex', householdName: 'The Morgan Household' });
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  const startFresh = async () => {
    setLoading(true);
    try {
      // Record that the onboarding choice was made so it doesn't reappear on every load.
      await updateSettings({ demoDataLoaded: true });
      await refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <Card className="w-full max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white">
          <Landmark className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Welcome to Ledgerly</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          A privacy-first personal finance manager. Your data is stored locally on this device — it never leaves your browser.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button
            disabled={loading}
            onClick={loadDemo}
            className="btn-primary flex h-full flex-col items-center gap-1 py-4"
          >
            <Sparkles className="h-5 w-5" />
            <span className="font-semibold">Explore sample data</span>
            <span className="text-xs font-normal opacity-80">See a fully populated demo (fictional data)</span>
          </button>
          <button
            disabled={loading}
            onClick={startFresh}
            className="btn-secondary flex h-full flex-col items-center gap-1 py-4"
          >
            <FileDown className="h-5 w-5" />
            <span className="font-semibold">Start fresh</span>
            <span className="text-xs font-normal opacity-80">Begin with an empty workspace</span>
          </button>
        </div>
        <p className="mt-4 text-[11px] text-slate-400 dark:text-slate-500">
          Sample data is entirely fictional and clearly labeled. You can delete it at any time in Settings.
        </p>
      </Card>
    </div>
  );
}

export default function App() {
  return (
    <OnboardingGate>
      <AppShell>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/recurring" element={<RecurringPage />} />
            <Route path="/accounts" element={<AccountsPage />} />
            <Route path="/investments" element={<InvestmentsPage />} />
            <Route path="/net-worth" element={<NetWorthPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/import-export" element={<ImportExportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
    </OnboardingGate>
  );
}