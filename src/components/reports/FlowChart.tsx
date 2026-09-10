/**
 * FlowChart — a dependency-free SVG Sankey for the Monarch-style cash flow.
 *
 * Visualizes money flowing left → right:
 *   income sources → Income → category groups → categories
 * with net income rendered as a "Savings" flow out of Income (REQ-033).
 *
 * Layout is fully custom (no chart library): node columns are evenly spaced,
 * node heights are proportional to value, and links are smooth cubic ribbons
 * whose thickness equals the flow's share of the total. Percentages render
 * relative to a base node (total income), matching Monarch's convention.
 */
import { useId } from 'react';
import { formatMoney } from '../../lib/money';

export interface FlowNode {
  id: string;
  label: string;
  /** Secondary line under the label (e.g. "$1,593.00"). */
  sublabel: string;
  value: number;
  color: string;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  color?: string;
}

interface Positioned extends FlowNode {
  col: number;
  x: number;
  y: number;
  h: number;
}

const NODE_W = 14;
const MIN_NODE_H = 12;
const PAD_Y = 8;

export function FlowChart({
  columns,
  links,
  height = 520,
  percentBaseId,
}: {
  /** Nodes grouped into columns, left → right. Order within a column is preserved. */
  columns: FlowNode[][];
  links: FlowLink[];
  height?: number;
  /** Percentages are computed relative to this node's value (defaults to the first node). */
  percentBaseId?: string;
}) {
  const clipId = useId().replace(/[:]/g, '');
  const colCount = columns.length;
  if (colCount === 0 || links.length === 0) return null;

  // ---- horizontal geometry -------------------------------------------------
  const width = 1040;
  const usableW = width - NODE_W;
  const step = colCount > 1 ? (usableW - NODE_W) / (colCount - 1) : 0;

  // ---- vertical scale ------------------------------------------------------
  const maxColTotal = Math.max(
    ...columns.map((col) => col.reduce((a, n) => a + n.value, 0)),
    1,
  );
  const usableH = height - PAD_Y * 2;
  const scale = Math.min(usableH / maxColTotal, 4); // cap stretch on sparse data
  const gapFor = (col: FlowNode[]) => {
    const gaps = col.length - 1;
    if (gaps <= 0) return 0;
    const used = col.reduce((a, n) => a + Math.max(n.value * scale, MIN_NODE_H), 0);
    return Math.max(6, Math.min(36, (usableH - used) / gaps));
  };

  // ---- position nodes ------------------------------------------------------
  // A node must be tall enough to fit whichever side is larger: its declared
  // value, the total flowing in, or the total flowing out (e.g. the Income
  // node when a month's expenses exceed its income).
  const flowTotals = new Map<string, { in: number; out: number }>();
  for (const l of links) {
    const tin = flowTotals.get(l.target) ?? { in: 0, out: 0 };
    tin.in += l.value;
    flowTotals.set(l.target, tin);
    const tout = flowTotals.get(l.source) ?? { in: 0, out: 0 };
    tout.out += l.value;
    flowTotals.set(l.source, tout);
  }
  const nodeH = (n: FlowNode): number => {
    const ft = flowTotals.get(n.id);
    const fit = Math.max(n.value, ft?.in ?? 0, ft?.out ?? 0);
    return Math.max(fit * scale, MIN_NODE_H);
  };

  const pos = new Map<string, Positioned>();
  columns.forEach((col, ci) => {
    const gap = gapFor(col.map((n) => ({ ...n, value: Math.max(n.value, flowTotals.get(n.id)?.in ?? 0, flowTotals.get(n.id)?.out ?? 0) })));
    const total = col.reduce((a, n) => a + nodeH(n) + gap, 0) - gap;
    let y = Math.max(PAD_Y, (height - total) / 2);
    for (const n of col) {
      const h = nodeH(n);
      pos.set(n.id, { ...n, col: ci, x: ci * step, y, h });
      y += h + gap;
    }
  });

  // ---- lay out links -------------------------------------------------------
  // Link thickness ∝ value; attach points run top→bottom on each node edge,
  // ordered so ribbons cross as little as possible.
  const outOffset = new Map<string, number>();
  const inOffset = new Map<string, number>();
  const drawn = links
    .map((l) => {
      const s = pos.get(l.source);
      const t = pos.get(l.target);
      if (!s || !t) return null;
      const th = Math.max(l.value * scale, 1.5);
      const so = outOffset.get(l.source) ?? 0;
      const to = inOffset.get(l.target) ?? 0;
      outOffset.set(l.source, so + th);
      inOffset.set(l.target, to + th);
      return { l, s, t, th, so, to };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  // Percent base (total income by convention).
  const baseNode = percentBaseId
    ? pos.get(percentBaseId)
    : columns[0]?.[0]
      ? pos.get(columns[0][0].id)
      : undefined;
  const base = baseNode && baseNode.value > 0 ? baseNode.value : 0;
  const pct = (v: number) => (base > 0 ? ` (${((v / base) * 100).toFixed(2)}%)` : '');

  const labelInside = (n: Positioned) => n.h >= 34 && n.col > 0 && n.col < colCount - 1;
  const colTotal = (ci: number) => columns[ci].reduce((a, n) => a + n.value, 0);

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full min-w-[720px]"
        role="img"
        aria-label="Cash flow diagram"
      >
        <defs>
          {drawn.map(({ l, s, t }, i) => (
            <linearGradient key={i} id={`${clipId}-g${i}`} gradientUnits="userSpaceOnUse" x1={s.x + NODE_W} x2={t.x}>
              <stop offset="0%" stopColor={l.color ?? s.color} stopOpacity={0.42} />
              <stop offset="100%" stopColor={l.color ?? t.color} stopOpacity={0.62} />
            </linearGradient>
          ))}
        </defs>

        {/* ribbons */}
        {drawn.map(({ l, s, t, th, so, to }, i) => {
          const x0 = s.x + NODE_W;
          const x1 = t.x;
          const y0 = s.y + so + th / 2;
          const y1 = t.y + to + th / 2;
          const mx = (x0 + x1) / 2;
          const d =
            `M ${x0} ${y0 - th / 2}` +
            ` C ${mx} ${y0 - th / 2}, ${mx} ${y1 - th / 2}, ${x1} ${y1 - th / 2}` +
            ` L ${x1} ${y1 + th / 2}` +
            ` C ${mx} ${y1 + th / 2}, ${mx} ${y0 + th / 2}, ${x0} ${y0 + th / 2} Z`;
          return (
            <path key={i} d={d} fill={`url(#${clipId}-g${i})`}>
              <title>{`${s.label} → ${t.label}: ${formatMoney(l.value)}`}</title>
            </path>
          );
        })}

        {/* nodes + labels */}
        {[...pos.values()].map((n) => {
          const showInside = labelInside(n);
          const isLast = n.col === colCount - 1;
          const labelRight = isLast || !showInside;
          return (
            <g key={n.id}>
              <rect x={n.x} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color}>
                <title>{`${n.label}: ${n.sublabel}${pct(n.value)}`}</title>
              </rect>
              {showInside ? (
                <text x={n.x + NODE_W + 8} y={n.y + n.h / 2 - 3} className="fill-slate-700 dark:fill-slate-200" fontSize={12} fontWeight={600}>
                  {n.label}
                  <tspan className="fill-slate-500 dark:fill-slate-400" fontWeight={400}>
                    {'  '}{n.sublabel}{pct(n.value)}
                  </tspan>
                </text>
              ) : labelRight ? (
                <text x={n.x + NODE_W + 8} y={n.y + n.h / 2 - 3} className="fill-slate-700 dark:fill-slate-200" fontSize={12} fontWeight={600}>
                  {n.label}
                  <tspan className="fill-slate-500 dark:fill-slate-400" fontWeight={400}>
                    {'  '}{n.sublabel}{pct(n.value)}
                  </tspan>
                </text>
              ) : (
                <text x={n.x - 8} y={n.y + n.h / 2 - 3} textAnchor="end" className="fill-slate-700 dark:fill-slate-200" fontSize={12} fontWeight={600}>
                  {n.label}
                  <tspan className="fill-slate-500 dark:fill-slate-400" fontWeight={400}>
                    {'  '}{n.sublabel}{pct(n.value)}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}

        {/* column totals under each column (subtle) */}
        {columns.map((col, ci) => {
          const total = colTotal(ci);
          if (total <= 0) return null;
          return (
            <text
              key={`tot-${ci}`}
              x={ci * step + NODE_W / 2}
              y={height - 2}
              textAnchor="middle"
              fontSize={10}
              className="fill-slate-400 dark:fill-slate-500"
            >
              {ci === 0 ? 'Sources' : ci === colCount - 1 ? 'Categories' : ci === 1 ? 'Income' : 'Groups'} · {col.length}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
