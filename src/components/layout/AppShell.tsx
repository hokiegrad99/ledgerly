import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import clsx from 'clsx';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PiggyBank,
  Target,
  CalendarClock,
  Wallet,
  LineChart,
  Scale,
  BarChart3,
  ClipboardList,
  Settings,
  Database,
  Menu,
  X,
  Sun,
  Moon,
  Monitor,
  ShieldCheck,
  Landmark,
} from 'lucide-react';
import { useApp } from '../../store/AppContext';
import { Button } from '../ui/basic';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budget', label: 'Budget', icon: PiggyBank },
  { to: '/goals', label: 'Goals', icon: Target },
  { to: '/recurring', label: 'Recurring', icon: CalendarClock },
  { to: '/accounts', label: 'Accounts', icon: Wallet },
  { to: '/investments', label: 'Investments', icon: LineChart },
  { to: '/net-worth', label: 'Net Worth', icon: Scale },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/planning', label: 'Planning', icon: ClipboardList },
  { to: '/import-export', label: 'Import & Export', icon: Database },
  { to: '/settings', label: 'Settings', icon: Settings },
];

const BOTTOM_NAV = ['/', '/transactions', '/budget', '/goals', '/accounts'];

function ThemeToggle() {
  const { settings, updateSettings } = useApp();
  const [open, setOpen] = useState(false);
  const cycle: ('light' | 'dark' | 'system')[] = ['light', 'dark', 'system'];
  const icons = { light: <Sun className="h-4 w-4" />, dark: <Moon className="h-4 w-4" />, system: <Monitor className="h-4 w-4" /> };
  const labels = { light: 'Light mode', dark: 'Dark mode', system: 'System mode' };
  return (
    <div className="relative">
      <Button
        variant="ghost"
        onClick={() => setOpen((o) => !o)}
        aria-label={`Theme: ${labels[settings.theme]}`}
        title={labels[settings.theme]}
      >
        {icons[settings.theme]}
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1 min-w-[150px] rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {cycle.map((t) => (
            <button
              key={t}
              className={clsx(
                'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm',
                settings.theme === t
                  ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700',
              )}
              onClick={() => {
                void updateSettings({ theme: t });
                setOpen(false);
              }}
            >
              {icons[t]} {labels[t].replace(' mode', '')}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { storageMode } = useApp();
  const location = useLocation();

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const SidebarContent = (
    <nav className="flex h-full flex-col" aria-label="Primary">
      <div className={clsx('flex items-center gap-2 px-4 py-4', collapsed && 'justify-center px-2')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white">
          <Landmark className="h-4.5 w-4.5 h-[18px] w-[18px]" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Ledgerly</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-slate-400">Personal Finance</div>
          </div>
        )}
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                collapsed && 'justify-center px-2',
                isActive
                  ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100',
              )
            }
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </div>
      <div className={clsx('border-t border-slate-200 px-4 py-3 dark:border-slate-800', collapsed && 'px-2 text-center')}>
        {!collapsed && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
            <span>{storageMode === 'local' ? 'Data stored locally on this device' : 'Synced to server'}</span>
          </div>
        )}
        {collapsed && <ShieldCheck className="mx-auto h-4 w-4 text-emerald-500" aria-label="Data stored locally" />}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white transition-all dark:border-slate-800 dark:bg-slate-900 lg:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {SidebarContent}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 bg-white shadow-xl dark:bg-slate-900">
            <div className="flex justify-end p-2">
              <button className="btn-ghost p-2" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            {SidebarContent}
          </div>
        </div>
      )}

      {/* Main column */}
      <div className={clsx('transition-all lg:pl-16', collapsed ? 'lg:pl-16' : 'lg:pl-60')}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/90 px-4 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
          <button className="btn-ghost p-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu className="h-5 w-5" />
          </button>
          <button
            className="btn-ghost hidden p-2 lg:inline-flex"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 sm:inline-flex">
            {storageMode === 'local' ? '🔒 Local mode' : 'Server mode'}
          </span>
          <ThemeToggle />
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:pb-10">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:hidden"
        aria-label="Mobile"
      >
        {BOTTOM_NAV.map((to) => {
          const item = NAV_ITEMS.find((n) => n.to === to)!;
          const Icon = item.icon;
          const active = to === '/' ? location.pathname === '/' : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium',
                active ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}