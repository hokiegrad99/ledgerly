/**
 * Derive holdings from recorded investment activity (REQ-031).
 *
 * Rebuilds share counts and cost basis for every (account, security) pair that
 * has share-affecting activity, using the average-cost method:
 *   - buy / reinvest: shares += t.shares; cost += t.amount (or shares*price + fees when amount is 0)
 *   - sell:           shares -= t.shares; cost reduced proportionally (average cost)
 *   - split:          t.shares is the multiplier (2 = 2-for-1, 0.5 = reverse 1-for-2); cost unchanged
 *   - transfer:       signed share delta; cost += shares*price on inflow, proportional reduction on outflow
 *   - dividend / interest: cash only — no share or cost impact
 *
 * Pure and deterministic: transactions are sorted by date (then createdAt)
 * before replay, so input order never matters. Sells without a recorded
 * position clamp at zero shares rather than going negative.
 */
import type { Holding, InvestmentTransaction } from './types';
import { newId, nowISO } from '../lib/id';

export interface DerivedPosition {
  accountId: string;
  securityId: string;
  /** Share count after replaying all activity (never negative). */
  shares: number;
  /** Remaining cost basis in cents (average-cost method). */
  costBasis: number;
  /** Latest recorded price per share in cents — seeds new holdings. */
  lastPrice: number;
}

export interface HoldingSyncPlan {
  /** Pairs with activity but no holding yet. */
  adds: Holding[];
  /** Existing holdings whose shares/cost differ from the derived values. */
  updates: Holding[];
  /** Existing holdings whose position was fully closed by activity. */
  removals: Holding[];
}

const EPSILON = 1e-6;
const pairKey = (accountId: string, securityId: string) => `${accountId}::${securityId}`;

const round6 = (n: number): number => Math.round(n * 1e6) / 1e6;

/** Reduce a position by `sold` shares, removing cost basis proportionally. */
function reducePosition(pos: DerivedPosition, sold: number): void {
  const actual = Math.min(sold, Math.max(pos.shares, 0));
  const portion = pos.shares > 0 ? actual / pos.shares : 0;
  pos.costBasis -= Math.round(pos.costBasis * portion);
  pos.shares = round6(Math.max(0, pos.shares - sold));
  if (pos.shares <= EPSILON) pos.shares = 0;
}

/** Replay all investment transactions into per-(account, security) positions. */
export function deriveHoldings(txns: InvestmentTransaction[]): Map<string, DerivedPosition> {
  const positions = new Map<string, DerivedPosition>();
  const sorted = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
  );
  for (const t of sorted) {
    if (!t.securityId) continue;
    const key = pairKey(t.accountId, t.securityId);
    const incomeOnly = t.type === 'dividend' || t.type === 'interest';
    if (incomeOnly && !positions.has(key)) continue; // cash income never opens a position
    const pos = positions.get(key) ?? {
      accountId: t.accountId,
      securityId: t.securityId,
      shares: 0,
      costBasis: 0,
      lastPrice: 0,
    };
    if (t.price > 0) pos.lastPrice = t.price;

    switch (t.type) {
      case 'buy':
      case 'reinvest': {
        pos.shares = round6(pos.shares + t.shares);
        pos.costBasis += t.amount > 0 ? t.amount : Math.round(t.shares * t.price) + t.fees;
        break;
      }
      case 'sell': {
        reducePosition(pos, t.shares);
        break;
      }
      case 'split': {
        // Multiplier convention: shares = 2 for a 2-for-1 split, 0.5 for a reverse.
        if (t.shares > 0) pos.shares = round6(pos.shares * t.shares);
        break;
      }
      case 'transfer': {
        if (t.shares >= 0) {
          pos.shares = round6(pos.shares + t.shares);
          pos.costBasis += t.amount > 0 ? t.amount : Math.round(t.shares * t.price);
        } else {
          reducePosition(pos, -t.shares);
        }
        break;
      }
      case 'dividend':
      case 'interest':
        // Cash income only — no share or cost impact.
        break;
    }
    positions.set(key, pos);
  }
  return positions;
}

/**
 * Compare derived positions against existing holdings.
 *
 * Existing holdings with no recorded activity are left untouched (they may be
 * manually maintained). Updates keep the holding's manually-entered price when
 * one exists; new holdings seed their price from the latest transaction.
 */
export function planHoldingSync(existing: Holding[], derived: Map<string, DerivedPosition>): HoldingSyncPlan {
  const plan: HoldingSyncPlan = { adds: [], updates: [], removals: [] };
  const byPair = new Map(existing.map((h) => [pairKey(h.accountId, h.securityId), h]));

  for (const pos of derived.values()) {
    const current = byPair.get(pairKey(pos.accountId, pos.securityId));
    if (!current) {
      if (pos.shares > EPSILON) {
        plan.adds.push({
          id: newId(),
          accountId: pos.accountId,
          securityId: pos.securityId,
          shares: round6(pos.shares),
          costBasis: pos.costBasis,
          currentPrice: pos.lastPrice,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      }
      continue;
    }
    if (pos.shares <= EPSILON) {
      plan.removals.push(current);
    } else if (
      Math.abs(pos.shares - current.shares) > EPSILON ||
      Math.abs(pos.costBasis - current.costBasis) > 0.5
    ) {
      plan.updates.push({
        ...current,
        shares: round6(pos.shares),
        costBasis: pos.costBasis,
        currentPrice: current.currentPrice > 0 ? current.currentPrice : pos.lastPrice,
        updatedAt: nowISO(),
      });
    }
  }
  return plan;
}
