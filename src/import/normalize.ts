/**
 * Normalization of imported rows (CSV/TSV) and OFX transactions into the
 * internal Transaction model.
 */
import type { Transaction } from '../domain/types';
import { parseDate } from '../lib/dates';
import { parseMoney } from '../lib/money';
import { newId, nowISO } from '../lib/id';
import type { OfxTransaction } from './ofx';

export type MappedField =
  | 'date'
  | 'description'
  | 'amount'
  | 'debit'
  | 'credit'
  | 'category'
  | 'account'
  | 'notes'
  | 'type'
  | 'check-number'
  | 'external-id';

export const MAPPABLE_FIELDS: { value: MappedField; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'description', label: 'Description / Merchant' },
  { value: 'amount', label: 'Amount' },
  { value: 'debit', label: 'Debit (outflow)' },
  { value: 'credit', label: 'Credit (inflow)' },
  { value: 'category', label: 'Category' },
  { value: 'account', label: 'Account' },
  { value: 'notes', label: 'Notes' },
  { value: 'type', label: 'Transaction Type' },
  { value: 'check-number', label: 'Check Number' },
  { value: 'external-id', label: 'External ID (FITID)' },
];

export const AMOUNT_FIELDS: MappedField[] = ['amount', 'debit', 'credit'];

export interface NormalizeCsvOptions {
  accountId: string;
  columnMap: Record<string, MappedField>;
  header: string[];
  rows: string[][];
  /** Category name -> category id lookup (applies imported categories). */
  categoryLookup?: (name: string) => string | null;
}

export interface NormalizedRow {
  /** Row index in the source file (for UI reference). */
  rowIndex: number;
  transaction: Transaction;
  error?: string;
}

/**
 * Normalize CSV rows using the user's column mapping.
 * Produces one candidate Transaction per row; rows that can't be parsed
 * are returned with an `error` instead of silently dropped.
 */
export function normalizeCsvRows(opts: NormalizeCsvOptions): NormalizedRow[] {
  const { accountId, columnMap, header, rows, categoryLookup } = opts;
  const fieldIndex = new Map<string, number>();
  header.forEach((h, i) => fieldIndex.set(h.trim().toLowerCase(), i));

  const out: NormalizedRow[] = [];
  rows.forEach((row, ri) => {
    const get = (field: MappedField): string | undefined => {
      for (const [col, mapped] of Object.entries(columnMap)) {
        if (mapped === field) {
          const idx = fieldIndex.get(col.trim().toLowerCase());
          if (idx !== undefined && idx < row.length) return row[idx]?.trim();
        }
      }
      return undefined;
    };

    const dateStr = get('date');
    const date = parseDate(dateStr);
    if (!date) {
      out.push({
        rowIndex: ri,
        transaction: emptyTransaction(accountId),
        error: dateStr ? `Could not parse date "${dateStr}"` : 'Missing date',
      });
      return;
    }

    const amount = resolveAmount(get);
    if (amount === null) {
      out.push({
        rowIndex: ri,
        transaction: emptyTransaction(accountId),
        error: 'Could not parse amount',
      });
      return;
    }

    const description = get('description') ?? '';
    const categoryName = get('category');
    const categoryId = categoryName && categoryLookup ? categoryLookup(categoryName) : null;
    const notes = get('notes') ?? '';
    const extId = get('external-id');

    const tx: Transaction = {
      id: newId(),
      accountId,
      date,
      amount,
      merchant: description,
      originalDescription: description,
      categoryId,
      tagIds: [],
      notes,
      type: amount < 0 ? 'expense' : 'income',
      cleared: true,
      pending: false,
      reviewed: false,
      transferId: null,
      recurringId: null,
      externalId: extId || null,
      splitParentId: null,
      importSessionId: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    out.push({ rowIndex: ri, transaction: tx });
  });

  return out;
}

function resolveAmount(get: (f: MappedField) => string | undefined): number | null {
  const amount = get('amount');
  if (amount !== undefined && amount !== '') {
    const parsed = parseMoney(amount);
    if (parsed !== null) return parsed;
    return null;
  }
  const debit = get('debit');
  const credit = get('credit');
  if (debit !== undefined && debit !== '') {
    const parsed = parseMoney(debit);
    if (parsed !== null) return -Math.abs(parsed);
    return null;
  }
  if (credit !== undefined && credit !== '') {
    const parsed = parseMoney(credit);
    if (parsed !== null) return Math.abs(parsed);
    return null;
  }
  return null;
}

function emptyTransaction(accountId: string): Transaction {
  return {
    id: newId(),
    accountId,
    date: '',
    amount: 0,
    merchant: '',
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
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/** Convert parsed OFX transactions to internal Transactions. */
export function normalizeOfxTransactions(
  ofx: OfxTransaction[],
  accountId: string,
): Transaction[] {
  return ofx.map((o) => {
    const amount = o.amount;
    const tx: Transaction = {
      id: newId(),
      accountId,
      date: o.date,
      amount,
      merchant: o.name || o.memo || '(unknown)',
      originalDescription: [o.name, o.memo].filter(Boolean).join(' — '),
      categoryId: null,
      tagIds: [],
      notes: o.memo && o.memo !== o.name ? o.memo : '',
      type: amount < 0 ? 'expense' : 'income',
      cleared: true,
      pending: false,
      reviewed: false,
      transferId: null,
      recurringId: null,
      externalId: o.fitid || null,
      splitParentId: null,
      importSessionId: null,
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return tx;
  });
}