import { describe, it, expect } from 'vitest';
import { deriveHoldings, planHoldingSync } from './holdings';
import type { Holding, InvestmentTransaction } from './types';
import { newId, nowISO } from '../lib/id';

const now = nowISO();

function txn(partial: Partial<InvestmentTransaction>): InvestmentTransaction {
  return {
    id: newId(),
    accountId: 'acct-1',
    securityId: 'sec-vti',
    date: '2026-01-15',
    type: 'buy',
    shares: 10,
    price: 10000, // $100.00
    amount: 100000, // $1,000.00
    fees: 0,
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

function holding(partial: Partial<Holding>): Holding {
  return {
    id: newId(),
    accountId: 'acct-1',
    securityId: 'sec-vti',
    shares: 0,
    costBasis: 0,
    currentPrice: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

describe('deriveHoldings', () => {
  it('accumulates buys into a position with total cost basis', () => {
    const positions = deriveHoldings([
      txn({ amount: 100000 }),
      txn({ date: '2026-02-15', shares: 5, price: 12000, amount: 60000 }),
    ]);
    const pos = positions.get('acct-1::sec-vti')!;
    expect(pos.shares).toBe(15);
    expect(pos.costBasis).toBe(160000);
  });

  it('falls back to shares × price + fees when amount is 0', () => {
    const positions = deriveHoldings([
      txn({ amount: 0, shares: 3, price: 5000, fees: 100, securityId: 'sec-xyz' }),
    ]);
    const pos = positions.get('acct-1::sec-xyz')!;
    expect(pos.shares).toBe(3);
    expect(pos.costBasis).toBe(15100);
  });

  it('reduces cost basis proportionally on sell (average cost)', () => {
    const positions = deriveHoldings([
      txn({ amount: 100000 }), // 10 sh @ avg $100
      txn({ date: '2026-03-01', type: 'sell', shares: 4, price: 11000, amount: 44000 }),
    ]);
    const pos = positions.get('acct-1::sec-vti')!;
    expect(pos.shares).toBe(6);
    expect(pos.costBasis).toBe(60000);
  });

  it('clamps sells beyond the recorded position at zero', () => {
    const positions = deriveHoldings([
      txn({ type: 'sell', shares: 99, price: 10000, amount: 990000 }),
    ]);
    const pos = positions.get('acct-1::sec-vti')!;
    expect(pos.shares).toBe(0);
    expect(pos.costBasis).toBe(0);
  });

  it('multiplies shares on split; cost basis unchanged', () => {
    const positions = deriveHoldings([
      txn({ amount: 100000 }),
      txn({ date: '2026-04-01', type: 'split', shares: 2 }),
    ]);
    const pos = positions.get('acct-1::sec-vti')!;
    expect(pos.shares).toBe(20);
    expect(pos.costBasis).toBe(100000);
  });

  it('handles reverse splits (multiplier < 1)', () => {
    const positions = deriveHoldings([
      txn({ amount: 100000 }),
      txn({ date: '2026-04-01', type: 'split', shares: 0.5 }),
    ]);
    expect(positions.get('acct-1::sec-vti')!.shares).toBe(5);
  });

  it('ignores dividends and interest (cash only)', () => {
    const positions = deriveHoldings([
      txn({ type: 'dividend', shares: 0, price: 0, amount: 5000 }),
      txn({ type: 'interest', shares: 0, price: 0, amount: 300 }),
    ]);
    expect(positions.size).toBe(0);
  });

  it('handles transfers in and out between accounts', () => {
    const positions = deriveHoldings([
      // Out of acct-1
      txn({ type: 'transfer', shares: -10, price: 10000, amount: 0 }),
      // Into acct-2
      txn({ accountId: 'acct-2', type: 'transfer', shares: 10, price: 10000, amount: 0 }),
    ]);
    expect(positions.get('acct-1::sec-vti')!.shares).toBe(0);
    expect(positions.get('acct-1::sec-vti')!.costBasis).toBe(0);
    expect(positions.get('acct-2::sec-vti')!.shares).toBe(10);
    // Inflow cost = shares × price.
    expect(positions.get('acct-2::sec-vti')!.costBasis).toBe(100000);
  });

  it('applies activity in date order regardless of input order', () => {
    const positions = deriveHoldings([
      txn({ date: '2026-06-01', type: 'sell', shares: 5, price: 12000, amount: 60000 }),
      txn({ date: '2026-01-01', amount: 100000 }), // buy happens first
    ]);
    const pos = positions.get('acct-1::sec-vti')!;
    expect(pos.shares).toBe(5);
    expect(pos.costBasis).toBe(50000);
  });

  it('tracks separate positions per account and per security', () => {
    const positions = deriveHoldings([
      txn({ amount: 100000 }),
      txn({ accountId: 'acct-2', amount: 50000 }),
      txn({ securityId: 'sec-vxus', amount: 25000, shares: 2 }),
    ]);
    expect(positions.size).toBe(3);
    expect(positions.get('acct-1::sec-vti')!.costBasis).toBe(100000);
    expect(positions.get('acct-2::sec-vti')!.costBasis).toBe(50000);
  });

  it('records the latest price seen (for new-holding seeding)', () => {
    const positions = deriveHoldings([
      txn({ price: 10000 }),
      txn({ date: '2026-03-01', price: 11500, shares: 0, amount: 0, type: 'dividend' }),
    ]);
    expect(positions.get('acct-1::sec-vti')!.lastPrice).toBe(11500);
  });
});

describe('planHoldingSync', () => {
  const derived = () =>
    deriveHoldings([
      txn({ amount: 100000 }),
      txn({ date: '2026-02-01', shares: 5, price: 12000, amount: 60000 }),
    ]);

  it('adds a holding for a pair with activity but none existing', () => {
    const plan = planHoldingSync([], derived());
    expect(plan.adds).toHaveLength(1);
    expect(plan.adds[0].shares).toBe(15);
    expect(plan.adds[0].costBasis).toBe(160000);
    expect(plan.adds[0].currentPrice).toBe(12000);
  });

  it('updates an existing holding that drifted from activity', () => {
    const existing = [holding({ shares: 10, costBasis: 100000, currentPrice: 11000 })];
    const plan = planHoldingSync(existing, derived());
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].shares).toBe(15);
    expect(plan.updates[0].costBasis).toBe(160000);
    // Manually-entered price is preserved.
    expect(plan.updates[0].currentPrice).toBe(11000);
  });

  it('leaves existing holdings alone when they already match', () => {
    const existing = [holding({ shares: 15, costBasis: 160000, currentPrice: 11000 })];
    const plan = planHoldingSync(existing, derived());
    expect(plan.adds).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
    expect(plan.removals).toHaveLength(0);
  });

  it('removes a holding closed out by a sell-all', () => {
    const existing = [holding({ shares: 15, costBasis: 160000 })];
    const positions = deriveHoldings([
      txn({ type: 'sell', shares: 15, price: 12000, amount: 180000 }),
    ]);
    const plan = planHoldingSync(existing, positions);
    expect(plan.removals).toHaveLength(1);
    expect(plan.updates).toHaveLength(0);
    expect(plan.adds).toHaveLength(0);
  });

  it('never proposes a holding for activity that nets zero shares', () => {
    const positions = deriveHoldings([
      txn({ type: 'buy', shares: 5, price: 10000, amount: 50000 }),
      txn({ date: '2026-02-01', type: 'sell', shares: 5, price: 10000, amount: 50000 }),
    ]);
    const plan = planHoldingSync([], positions);
    expect(plan.adds).toHaveLength(0);
  });
});
