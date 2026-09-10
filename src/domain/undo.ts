/**
 * Undo buffer for transaction deletes (ISSUE-005).
 *
 * Deleting transactions permanently removes their splits from the database, so
 * a snapshot of everything that was removed must be taken *before* the delete
 * runs. The snapshot is kept in memory only and expires after a short window —
 * this is an escape hatch for the "oops, wrong selection" case, not a full
 * version history.
 */
import type { DataRepository } from '../data/repository';
import type { Transaction, TransactionSplit, TransferPair } from './types';

/** The subset of the repository the undo buffer needs (easy to fake in tests). */
export type UndoDeleteRepo = Pick<
  DataRepository,
  | 'getAllTransactions'
  | 'getSplitsForTransactions'
  | 'getTransfers'
  | 'saveTransactions'
  | 'saveSplits'
  | 'saveTransfer'
>;

/** Everything removed by one delete, kept so it can be restored. */
export interface DeleteSnapshot {
  transactions: Transaction[];
  splits: TransactionSplit[];
  transfers: TransferPair[];
  /** Epoch ms when the delete happened — used to expire the undo window. */
  deletedAt: number;
}

/** How long a delete stays undoable after it happens. */
export const UNDO_WINDOW_MS = 10_000;

/** True once the snapshot is older than the undo window. */
export function undoExpired(snapshot: DeleteSnapshot, now: number = Date.now()): boolean {
  return now - snapshot.deletedAt >= UNDO_WINDOW_MS;
}

/**
 * Capture the transactions (and their splits and transfer pairs) about to be
 * deleted. Call this immediately before `repo.deleteTransactions(ids)`.
 */
export async function captureDeletion(repo: UndoDeleteRepo, ids: string[]): Promise<DeleteSnapshot> {
  const idSet = new Set(ids);
  const [all, splits] = await Promise.all([
    repo.getAllTransactions(),
    repo.getSplitsForTransactions(ids),
  ]);
  const transactions = all.filter((t) => idSet.has(t.id));

  // Capture transfer pairs referenced by the deleted transactions so undo can
  // restore the link, not just the rows.
  const transferIds = new Set(
    transactions.map((t) => t.transferId).filter((id): id is string => !!id),
  );
  const transfers =
    transferIds.size > 0
      ? (await repo.getTransfers()).filter((p) => transferIds.has(p.id))
      : [];

  return { transactions, splits, transfers, deletedAt: Date.now() };
}

/** Put a captured delete back: transactions first, then splits and transfers. */
export async function restoreDeletion(repo: UndoDeleteRepo, snapshot: DeleteSnapshot): Promise<void> {
  if (snapshot.transactions.length > 0) await repo.saveTransactions(snapshot.transactions);
  if (snapshot.splits.length > 0) await repo.saveSplits(snapshot.splits);
  for (const transfer of snapshot.transfers) await repo.saveTransfer(transfer);
}
