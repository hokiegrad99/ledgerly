import { describe, it, expect } from 'vitest';
import { captureDeletion, restoreDeletion, undoExpired, UNDO_WINDOW_MS } from './undo';
import type { Transaction, TransactionSplit, TransferPair } from './types';

const txn = (id: string, over: Partial<Transaction> = {}): Transaction =>
  ({
    id,
    accountId: 'acct-1',
    date: '2026-01-15',
    amount: -1200,
    merchant: `Merchant ${id}`,
    originalDescription: '',
    categoryId: null,
    tagIds: [],
    notes: '',
    type: 'expense',
    cleared: true,
    pending: false,
    reviewed: false,
    transferId: null,
    recurringId: null,
    externalId: null,
    splitParentId: null,
    importSessionId: null,
    createdAt: '2026-01-15T00:00:00.000Z',
    updatedAt: '2026-01-15T00:00:00.000Z',
    ...over,
  }) as Transaction;

const split = (id: string, transactionId: string): TransactionSplit =>
  ({
    id,
    transactionId,
    categoryId: 'cat-1',
    amount: -600,
    merchant: '',
    notes: '',
    tagIds: [],
    createdAt: '',
    updatedAt: '',
  }) as TransactionSplit;

const transfer = (id: string, from: string, to: string): TransferPair =>
  ({
    id,
    fromTransactionId: from,
    toTransactionId: to,
    amount: 5000,
    date: '2026-01-15',
    createdAt: '',
    updatedAt: '',
  }) as TransferPair;

/** In-memory fake of the repo subset the undo buffer needs. */
function fakeRepo(allTxns: Transaction[], allSplits: TransactionSplit[], allTransfers: TransferPair[]) {
  const saved: { transactions: Transaction[]; splits: TransactionSplit[]; transfers: TransferPair[] } = {
    transactions: [],
    splits: [],
    transfers: [],
  };
  return {
    saved,
    repo: {
      getAllTransactions: async () => allTxns,
      getSplitsForTransactions: async (ids: string[]) => allSplits.filter((s) => ids.includes(s.transactionId)),
      getTransfers: async () => allTransfers,
      saveTransactions: async (txs: Transaction[]) => { saved.transactions.push(...txs); },
      saveSplits: async (splits: TransactionSplit[]) => { saved.splits.push(...splits); },
      saveTransfer: async (t: TransferPair) => { saved.transfers.push(t); },
    },
  };
}

describe('captureDeletion', () => {
  it('captures only the transactions being deleted', async () => {
    const { repo } = fakeRepo([txn('a'), txn('b'), txn('c')], [], []);
    const snap = await captureDeletion(repo, ['a', 'c']);
    expect(snap.transactions.map((t) => t.id).sort()).toEqual(['a', 'c']);
  });

  it('captures the splits belonging to the deleted transactions', async () => {
    const { repo } = fakeRepo(
      [txn('a'), txn('b')],
      [split('s1', 'a'), split('s2', 'b')],
      [],
    );
    const snap = await captureDeletion(repo, ['a']);
    expect(snap.splits.map((s) => s.id)).toEqual(['s1']);
  });

  it('captures the transfer pair referenced by a deleted transaction', async () => {
    const { repo } = fakeRepo(
      [txn('a', { transferId: 'pair-1', type: 'transfer' }), txn('b', { transferId: 'pair-1', type: 'transfer' })],
      [],
      [transfer('pair-1', 'a', 'b'), transfer('pair-2', 'x', 'y')],
    );
    const snap = await captureDeletion(repo, ['a']);
    expect(snap.transfers.map((t) => t.id)).toEqual(['pair-1']);
  });

  it('ignores ids that no longer exist', async () => {
    const { repo } = fakeRepo([txn('a')], [], []);
    const snap = await captureDeletion(repo, ['a', 'missing']);
    expect(snap.transactions.map((t) => t.id)).toEqual(['a']);
  });

  it('returns an empty snapshot for an empty id list', async () => {
    const { repo } = fakeRepo([txn('a')], [split('s1', 'a')], []);
    const snap = await captureDeletion(repo, []);
    expect(snap.transactions).toEqual([]);
    expect(snap.splits).toEqual([]);
    expect(snap.transfers).toEqual([]);
  });
});

describe('restoreDeletion', () => {
  it('re-saves transactions, splits, and transfers', async () => {
    const { saved, repo } = fakeRepo(
      [txn('a', { transferId: 'pair-1' })],
      [split('s1', 'a')],
      [transfer('pair-1', 'a', 'b')],
    );
    const snap = await captureDeletion(repo, ['a']);
    await restoreDeletion(repo, snap);

    expect(saved.transactions.map((t) => t.id)).toEqual(['a']);
    expect(saved.splits.map((s) => s.id)).toEqual(['s1']);
    expect(saved.transfers.map((t) => t.id)).toEqual(['pair-1']);
  });

  it('does not write empty collections', async () => {
    const { saved, repo } = fakeRepo([], [], []);
    const snap = await captureDeletion(repo, []);
    await restoreDeletion(repo, snap);
    expect(saved).toEqual({ transactions: [], splits: [], transfers: [] });
  });
});

describe('undoExpired', () => {
  it('is false within the undo window', () => {
    const snap = { transactions: [], splits: [], transfers: [], deletedAt: 1_000 };
    expect(undoExpired(snap, 1_000 + UNDO_WINDOW_MS - 1)).toBe(false);
  });

  it('is true once the window has elapsed', () => {
    const snap = { transactions: [], splits: [], transfers: [], deletedAt: 1_000 };
    expect(undoExpired(snap, 1_000 + UNDO_WINDOW_MS)).toBe(true);
  });
});
