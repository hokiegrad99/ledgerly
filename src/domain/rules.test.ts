import { describe, expect, it } from 'vitest';
import { applyRulesToTransaction, evaluateRules, ruleMatches } from './rules';
import type { Category, Transaction, TransactionRule } from './types';
import { newId } from '../lib/id';

function txn(partial: Partial<Transaction>): Transaction {
  return {
    id: newId(),
    accountId: 'acc1',
    date: '2024-09-10',
    amount: -4500,
    merchant: 'Amazon.com',
    originalDescription: 'AMAZON MKTPLACE PMTS',
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
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
    ...partial,
  };
}

const cat = (id: string, name: string): Category => ({ id, groupId: 'g1', name, sortOrder: 1, archived: false, createdAt: '', updatedAt: '' });
const catOf = (id: string | null | undefined): Category | null | undefined => (id ? cat(id, id) : null);

describe('ruleMatches', () => {
  it('matches contains', () => {
    const rule: TransactionRule = {
      id: 'r1', name: '', enabled: true, priority: 1,
      conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }],
      actions: [{ kind: 'mark-reviewed' }],
      createdAt: '', updatedAt: '',
    };
    expect(ruleMatches(rule, txn({}), catOf)).toBe(true);
    expect(ruleMatches(rule, txn({ merchant: 'Whole Foods' }), catOf)).toBe(false);
  });

  it('matches not-contains, starts-with, ends-with, equals', () => {
    const t = txn({ merchant: 'NJ Natural Gas' });
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'merchant', op: 'not-contains', value: 'amazon' }], actions: [], createdAt: '', updatedAt: '' }, t, catOf)).toBe(true);
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'merchant', op: 'starts-with', value: 'NJ' }], actions: [], createdAt: '', updatedAt: '' }, t, catOf)).toBe(true);
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'merchant', op: 'ends-with', value: 'Gas' }], actions: [], createdAt: '', updatedAt: '' }, t, catOf)).toBe(true);
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'merchant', op: 'equals', value: 'nj natural gas' }], actions: [], createdAt: '', updatedAt: '' }, t, catOf)).toBe(true);
  });

  it('matches amount comparisons on absolute value', () => {
    const big = txn({ amount: -15000 });
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'amount', op: 'gt', value: '100' }], actions: [], createdAt: '', updatedAt: '' }, big, catOf)).toBe(true);
    expect(ruleMatches({ id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'amount', op: 'lt', value: '100' }], actions: [], createdAt: '', updatedAt: '' }, big, catOf)).toBe(false);
  });

  it('matches account and type equality', () => {
    const r1: TransactionRule = { id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'account', op: 'is', value: 'acc1' }], actions: [], createdAt: '', updatedAt: '' };
    expect(ruleMatches(r1, txn({}), catOf)).toBe(true);
    const r2: TransactionRule = { id: '', name: '', enabled: true, priority: 0, conditions: [{ field: 'type', op: 'is', value: 'income' }], actions: [], createdAt: '', updatedAt: '' };
    expect(ruleMatches(r2, txn({}), catOf)).toBe(false);
    expect(ruleMatches(r2, txn({ type: 'income' }), catOf)).toBe(true);
  });

  it('requires ALL conditions to match', () => {
    const rule: TransactionRule = {
      id: '', name: '', enabled: true, priority: 0,
      conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }, { field: 'amount', op: 'gt', value: '50' }],
      actions: [], createdAt: '', updatedAt: '',
    };
    expect(ruleMatches(rule, txn({ amount: -10000 }), catOf)).toBe(true);
    expect(ruleMatches(rule, txn({ amount: -1000 }), catOf)).toBe(false);
  });

  it('ignores disabled rules', () => {
    const rule: TransactionRule = { id: '', name: '', enabled: false, priority: 0, conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }], actions: [], createdAt: '', updatedAt: '' };
    expect(ruleMatches(rule, txn({}), catOf)).toBe(false);
  });
});

describe('applyRulesToTransaction', () => {
  it('sets category and tags', () => {
    const rules: TransactionRule[] = [{
      id: 'r1', name: 'Amazon', enabled: true, priority: 1,
      conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }],
      actions: [{ kind: 'set-category', categoryId: 'cat-shopping' }, { kind: 'add-tag', tagId: 'tag-hh' }],
      createdAt: '', updatedAt: '',
    }];
    const { txn: out, applied } = applyRulesToTransaction(rules, txn({}), catOf);
    expect(applied).toHaveLength(1);
    expect(out.categoryId).toBe('cat-shopping');
    expect(out.tagIds).toContain('tag-hh');
  });

  it('applies higher-priority rules last (later overrides)', () => {
    const rules: TransactionRule[] = [
      { id: 'r1', name: '', enabled: true, priority: 1, conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }], actions: [{ kind: 'set-category', categoryId: 'cat-1' }], createdAt: '', updatedAt: '' },
      { id: 'r2', name: '', enabled: true, priority: 0, conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }], actions: [{ kind: 'set-category', categoryId: 'cat-2' }], createdAt: '', updatedAt: '' },
    ];
    const { txn: out } = applyRulesToTransaction(rules, txn({}), catOf);
    expect(out.categoryId).toBe('cat-1'); // priority 1 (higher number) applied last
  });

  it('marks reviewed and renames merchant', () => {
    const rules: TransactionRule[] = [{
      id: 'r1', name: '', enabled: true, priority: 0,
      conditions: [{ field: 'description', op: 'contains', value: 'AMAZON' }],
      actions: [{ kind: 'mark-reviewed' }, { kind: 'set-merchant', value: 'Amazon' }],
      createdAt: '', updatedAt: '',
    }];
    const { txn: out } = applyRulesToTransaction(rules, txn({}), catOf);
    expect(out.reviewed).toBe(true);
    expect(out.merchant).toBe('Amazon');
  });

  it('does not mutate the original transaction', () => {
    const rules: TransactionRule[] = [{
      id: 'r1', name: '', enabled: true, priority: 0,
      conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }],
      actions: [{ kind: 'set-category', categoryId: 'cat-1' }],
      createdAt: '', updatedAt: '',
    }];
    const original = txn({});
    applyRulesToTransaction(rules, original, catOf);
    expect(original.categoryId).toBeNull();
  });

  it('returns unchanged transaction when no rule matches', () => {
    const rules: TransactionRule[] = [{
      id: 'r1', name: '', enabled: true, priority: 0,
      conditions: [{ field: 'merchant', op: 'contains', value: 'netflix' }],
      actions: [{ kind: 'set-category', categoryId: 'cat-1' }],
      createdAt: '', updatedAt: '',
    }];
    const original = txn({});
    const { txn: out, applied } = applyRulesToTransaction(rules, original, catOf);
    expect(applied).toHaveLength(0);
    expect(out).toBe(original);
  });
});

describe('evaluateRules', () => {
  it('returns add/remove tag mutations', () => {
    const rules: TransactionRule[] = [{
      id: 'r1', name: '', enabled: true, priority: 0,
      conditions: [{ field: 'merchant', op: 'contains', value: 'amazon' }],
      actions: [{ kind: 'add-tag', tagId: 'tag-a' }, { kind: 'remove-tag', tagId: 'tag-b' }],
      createdAt: '', updatedAt: '',
    }];
    const { mutations } = evaluateRules(rules, txn({ tagIds: ['tag-b', 'tag-c'] }), catOf);
    expect(mutations.tagIds).toContain('tag-a');
    expect(mutations.tagIds).not.toContain('tag-b');
    expect(mutations.tagIds).toContain('tag-c');
  });
});