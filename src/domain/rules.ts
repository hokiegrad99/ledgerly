/**
 * Transaction rules engine.
 *
 * A rule is a set of conditions (all must match) and actions (all applied).
 * Rules are evaluated in priority order; by default every matching rule applies
 * (later rules can override earlier category assignments). Rules never throw —
 * malformed conditions simply don't match.
 */
import type { Category, RuleCondition, Transaction, TransactionRule } from './types';

const CONTAINS_OPS = new Set(['contains', 'not-contains', 'equals', 'starts-with', 'ends-with']);
const NUMERIC_OPS = new Set(['gt', 'lt']);

function matchText(actual: string, op: RuleCondition['op'], value: string): boolean {
  const a = actual.toLowerCase();
  const v = value.toLowerCase();
  switch (op) {
    case 'contains':
      return a.includes(v);
    case 'not-contains':
      return !a.includes(v);
    case 'equals':
      return a === v;
    case 'starts-with':
      return a.startsWith(v);
    case 'ends-with':
      return a.endsWith(v);
    default:
      return false;
  }
}

export function conditionMatches(cond: RuleCondition, txn: Transaction, categoryOf: (id: string | null) => Category | null | undefined): boolean {
  switch (cond.field) {
    case 'merchant':
      if (!CONTAINS_OPS.has(cond.op)) return false;
      return matchText(txn.merchant, cond.op, cond.value);
    case 'description':
      if (!CONTAINS_OPS.has(cond.op)) return false;
      return matchText(txn.originalDescription || txn.merchant, cond.op, cond.value);
    case 'amount': {
      if (!NUMERIC_OPS.has(cond.op)) return false;
      // Values are entered in dollars (e.g. "50" means $50); compare against cents.
      const parsed = Number(cond.value) * 100;
      const target = Number.isFinite(parsed) ? parsed : Number.NaN;
      if (!Number.isFinite(target)) return false;
      const abs = Math.abs(txn.amount);
      return cond.op === 'gt' ? abs > Math.abs(target) : abs < Math.abs(target);
    }
    case 'account':
      return cond.op === 'is' && cond.value === txn.accountId;
    case 'category': {
      const cat = categoryOf(txn.categoryId);
      if (!cat) return cond.op === 'is' && cond.value === '';
      return cond.op === 'is' && (cat.id === cond.value || cat.name.toLowerCase() === cond.value.toLowerCase());
    }
    case 'type':
      return cond.op === 'is' && cond.value === txn.type;
    case 'tag':
      return cond.op === 'is' ? txn.tagIds.includes(cond.value) : !txn.tagIds.includes(cond.value);
    default:
      return false;
  }
}

export function ruleMatches(rule: TransactionRule, txn: Transaction, categoryOf: (id: string | null) => Category | null | undefined): boolean {
  if (!rule.enabled) return false;
  return rule.conditions.every((c) => conditionMatches(c, txn, categoryOf));
}

export interface RuleApplicationResult {
  applied: TransactionRule[];
  changes: {
    categoryId?: string | null;
    merchant?: string;
    addTagIds: string[];
    removeTagIds: string[];
    reviewed?: boolean;
  };
}

/**
 * Apply a rule to a transaction. Returns the changes the rule prescribes
 * (does not mutate the transaction itself).
 */
export function applyRuleActions(rule: TransactionRule): RuleApplicationResult['changes'] {
  const changes: RuleApplicationResult['changes'] = { addTagIds: [], removeTagIds: [] };
  for (const action of rule.actions) {
    switch (action.kind) {
      case 'set-category':
        changes.categoryId = action.categoryId;
        break;
      case 'set-merchant':
        changes.merchant = action.value;
        break;
      case 'add-tag':
        if (!changes.addTagIds.includes(action.tagId)) changes.addTagIds.push(action.tagId);
        break;
      case 'remove-tag':
        if (!changes.removeTagIds.includes(action.tagId)) changes.removeTagIds.push(action.tagId);
        break;
      case 'mark-reviewed':
        changes.reviewed = true;
        break;
      case 'exclude-from-budget':
      case 'exclude-from-reports':
        // These are expressed via a special system tag so they survive round-trips.
        const tagName = action.kind === 'exclude-from-budget' ? '__exclude_from_budget' : '__exclude_from_reports';
        changes.addTagIds.push(tagName);
        break;
    }
  }
  return changes;
}

/**
 * Evaluate a list of rules (in priority order) against a transaction and
 * return the resulting mutations to apply.
 */
export function evaluateRules(
  rules: TransactionRule[],
  txn: Transaction,
  categoryOf: (id: string | null) => Category | null | undefined,
): { applied: TransactionRule[]; mutations: Partial<Transaction> } {
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);
  const applied: TransactionRule[] = [];
  const addTagIds: string[] = [];
  const removeTagIds: string[] = [];
  const result: Partial<Transaction> = {};

  for (const rule of sorted) {
    if (!ruleMatches(rule, txn, categoryOf)) continue;
    applied.push(rule);
    const changes = applyRuleActions(rule);
    if (changes.categoryId !== undefined) result.categoryId = changes.categoryId;
    if (changes.merchant !== undefined) result.merchant = changes.merchant;
    if (changes.reviewed) result.reviewed = true;
    addTagIds.push(...changes.addTagIds);
    removeTagIds.push(...changes.removeTagIds);
  }

  // Tag actions: apply add-tags (skipping system tags — those are handled via tag lookup elsewhere),
  // and remove-tags. System exclusion tags are kept out of this layer: they're resolved by callers
  // that know the actual tag table.
  const realAdds = addTagIds.filter((t) => !t.startsWith('__'));
  const realRemoves = removeTagIds.filter((t) => !t.startsWith('__'));
  if (realAdds.length > 0 || realRemoves.length > 0) {
    const tags = new Set(txn.tagIds);
    for (const t of realRemoves) tags.delete(t);
    for (const t of realAdds) tags.add(t);
    result.tagIds = [...tags];
  }
  return { applied, mutations: result };
}

/** Build a transaction after applying rules (mutates a copy). */
export function applyRulesToTransaction(
  rules: TransactionRule[],
  txn: Transaction,
  categoryOf: (id: string | null) => Category | null | undefined,
): { txn: Transaction; applied: TransactionRule[] } {
  const { applied, mutations } = evaluateRules(rules, txn, categoryOf);
  if (applied.length === 0) return { txn, applied };
  const updated: Transaction = {
    ...txn,
    categoryId: mutations.categoryId !== undefined ? mutations.categoryId : txn.categoryId,
    merchant: mutations.merchant !== undefined ? mutations.merchant : txn.merchant,
    reviewed: mutations.reviewed !== undefined ? mutations.reviewed : txn.reviewed,
    tagIds: mutations.tagIds !== undefined ? mutations.tagIds : txn.tagIds,
  };
  return { txn: updated, applied };
}

/** Resolve an exclusion system tag into its meaning. */
export function parseExclusionTags(tagNames: string[]): { excludeFromBudget: boolean; excludeFromReports: boolean } {
  return {
    excludeFromBudget: tagNames.includes('__exclude_from_budget'),
    excludeFromReports: tagNames.includes('__exclude_from_reports'),
  };
}

export const EXCLUSION_TAG_NAMES = ['__exclude_from_budget', '__exclude_from_reports'] as const;