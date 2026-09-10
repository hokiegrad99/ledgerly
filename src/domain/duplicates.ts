/**
 * Duplicate transaction detection.
 *
 * Signals used, in order of strength:
 *   1. External ID (OFX FITID) + account — strongest, exact.
 *   2. Transaction hash: account + date + amount + merchant fingerprint.
 *   3. Fuzzy match: same account, same amount, date within N days, similar merchant.
 */
import type { Transaction } from './types';
import { diffDays } from '../lib/dates';
import { fnv1a } from '../lib/id';

export function transactionHash(t: Pick<Transaction, 'accountId' | 'date' | 'amount' | 'merchant'>): string {
  const merchant = (t.merchant || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return fnv1a(`${t.accountId}|${t.date}|${t.amount}|${merchant}`);
}

export function externalIdKey(t: Pick<Transaction, 'accountId' | 'externalId'>): string | null {
  if (!t.externalId) return null;
  return `${t.accountId}|${t.externalId.trim()}`;
}

export interface DuplicateMatch {
  /** The incoming (candidate) transaction. */
  candidate: Transaction;
  /** The existing transaction it matches. */
  existing: Transaction;
  reason: 'external-id' | 'hash' | 'fuzzy';
  score: number;
}

export interface DuplicateCheckResult {
  matches: DuplicateMatch[];
  /** How many candidates are clean (no match). */
  cleanCount: number;
}

/**
 * Check a batch of incoming transactions against existing transactions.
 * Returns per-candidate duplicate matches. A candidate can match multiple
 * existing transactions (e.g. repeated import of the same statement).
 */
export function findDuplicates(
  incoming: Transaction[],
  existing: Transaction[],
  opts: { fuzzyWindowDays?: number } = {},
): DuplicateCheckResult {
  const window = opts.fuzzyWindowDays ?? 5;

  const existingByExt = new Map<string, Transaction>();
  const existingByHash = new Map<string, Transaction[]>();
  for (const e of existing) {
    const ext = externalIdKey(e);
    if (ext) existingByExt.set(ext, e);
    const h = transactionHash(e);
    const arr = existingByHash.get(h) ?? [];
    arr.push(e);
    existingByHash.set(h, arr);
  }

  // For fuzzy matching, bucket existing by account + amount rounded to cents.
  const fuzzyBuckets = new Map<string, Transaction[]>();
  for (const e of existing) {
    const key = `${e.accountId}|${e.amount}`;
    const arr = fuzzyBuckets.get(key) ?? [];
    arr.push(e);
    fuzzyBuckets.set(key, arr);
  }

  const matches: DuplicateMatch[] = [];
  let cleanCount = 0;

  for (const cand of incoming) {
    let matched = false;

    // 1. External ID
    const ext = externalIdKey(cand);
    if (ext) {
      const ex = existingByExt.get(ext);
      if (ex) {
        matches.push({ candidate: cand, existing: ex, reason: 'external-id', score: 1.0 });
        matched = true;
      }
    }

    // 2. Exact hash
    if (!matched) {
      const h = transactionHash(cand);
      const same = existingByHash.get(h);
      if (same && same.length > 0) {
        matches.push({ candidate: cand, existing: same[0], reason: 'hash', score: 0.95 });
        matched = true;
      }
    }

    // 3. Fuzzy: same account, same amount, close date, similar merchant
    if (!matched) {
      const bucket = fuzzyBuckets.get(`${cand.accountId}|${cand.amount}`);
      if (bucket) {
        const candMerchant = (cand.merchant || '').trim().toLowerCase();
        for (const ex of bucket) {
          if (ex.id === cand.id) continue;
          const d = Math.abs(diffDays(ex.date, cand.date));
          if (d > window) continue;
          const exMerchant = (ex.merchant || '').trim().toLowerCase();
          const sim = similarity(candMerchant, exMerchant);
          if (sim > 0.8) {
            matches.push({ candidate: cand, existing: ex, reason: 'fuzzy', score: 0.7 + sim * 0.2 });
            matched = true;
            break;
          }
        }
      }
    }

    if (!matched) cleanCount++;
  }

  return { matches, cleanCount };
}

/** Simple token-based Jaccard similarity for merchant names. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const tokensA = new Set(a.split(/[^a-z0-9]+/).filter(Boolean));
  const tokensB = new Set(b.split(/[^a-z0-9]+/).filter(Boolean));
  if (tokensA.size === 0 || tokensB.size === 0) return 0;
  let inter = 0;
  for (const t of tokensA) if (tokensB.has(t)) inter++;
  const union = tokensA.size + tokensB.size - inter;
  return union === 0 ? 0 : inter / union;
}