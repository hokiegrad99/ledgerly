import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';

export const CHART_COLORS = [
  '#3c68ee', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#14b8a6', '#f97316', '#84cc16', '#6366f1', '#06b6d4',
];

export function ChartTooltip({ active, payload, label, formatter }: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; payload?: Record<string, unknown>; color?: string }[];
  label?: string | number;
  formatter?: (v: number | string, name?: string) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-800">
      {label !== undefined && <div className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span>{p.name}:</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {formatter ? formatter(typeof p.value === 'number' ? p.value : Number(p.value ?? 0), p.name) : String(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: { name?: string; value?: number | string; color?: string }[]; label?: string | number }) {
  return <ChartTooltip active={active} payload={payload} label={label} formatter={(v) => `$${(Number(v) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} />;
}

export function TrendAreaChart({ data, dataKey = 'value', color = '#3c68ee', height = 220, money = true }: {
  data: Record<string, unknown>[];
  dataKey?: string;
  color?: string;
  height?: number;
  money?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis
          tick={{ fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => (money ? `$${Math.round(v / 100)}` : String(v))}
          width={60}
        />
        <Tooltip content={<MoneyTooltip />} />
        <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} fill={`url(#grad-${dataKey})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MoneyBarChart({ data, dataKey = 'value', height = 220, color = '#3c68ee' }: {
  data: Record<string, unknown>[];
  dataKey?: string;
  height?: number;
  color?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => `$${Math.round(v / 100)}`} width={60} />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ data, height = 200, formatter }: {
  data: { name: string; value: number }[];
  height?: number;
  formatter?: (v: number) => string;
}) {
  const filtered = data.filter((d) => d.value > 0);
  if (filtered.length === 0) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-slate-400">No data yet</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={filtered} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={2}>
          {filtered.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip formatter={(v) => (formatter ? formatter(Number(v)) : String(v))} />} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SimpleLineChart({ data, dataKey, height = 220, color = '#3c68ee', money = true }: {
  data: Record<string, unknown>[];
  dataKey: string;
  height?: number;
  color?: string;
  money?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
        <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => (money ? `$${Math.round(v / 100)}` : String(v))} width={60} />
        <Tooltip content={<MoneyTooltip />} />
        <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function LegendList({ items, formatter }: { items: { name: string; value: number; color: string }[]; formatter?: (v: number) => string }) {
  const total = items.reduce((a, b) => a + b.value, 0);
  return (
    <div className="space-y-1.5">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: it.color }} />
          <span className="flex-1 truncate text-slate-600 dark:text-slate-300">{it.name}</span>
          <span className="font-medium text-slate-900 dark:text-slate-100">{formatter ? formatter(it.value) : String(it.value)}</span>
          <span className="w-10 text-right text-slate-400">{total > 0 ? Math.round((it.value / total) * 100) : 0}%</span>
        </div>
      ))}
    </div>
  );
}