/**
 * Budget / report exclusion rules.
 *
 * A transaction is left out of budgeting or reporting when either:
 *  - its account is flagged `includeInBudget` / `includeInReports` = false, or
 *  - a rule applied the matching system tag (`exclude-from-budget` /
 *    `exclude-from-reports` rule actions).
 *
 * Keeping this in one place means the toggles and the rule actions are honoured
 * consistently by every consumer (Budget, Dashboard, Reports).
 */
import type { Transaction } from './types';

/** Fixed IDs of the system tags created by `systemTags()` in `defaults.ts`. */
export const EXCLUDE_FROM_BUDGET_TAG_ID = 'tag-exclude-budget';
export const EXCLUDE_FROM_REPORTS_TAG_ID = 'tag-exclude-reports';

/** True when the transaction must not count toward budgets. */
export function isExcludedFromBudget(txn: Transaction, excludedAccountIds?: ReadonlySet<string>): boolean {
  if (excludedAccountIds?.has(txn.accountId)) return true;
  return (txn.tagIds ?? []).includes(EXCLUDE_FROM_BUDGET_TAG_ID);
}

/** True when the transaction must not count toward reports. */
export function isExcludedFromReports(txn: Transaction, excludedAccountIds?: ReadonlySet<string>): boolean {
  if (excludedAccountIds?.has(txn.accountId)) return true;
  return (txn.tagIds ?? []).includes(EXCLUDE_FROM_REPORTS_TAG_ID);
}

/** Account ids flagged out of budgets. */
export function budgetExcludedAccountIds(accounts: { id: string; includeInBudget: boolean }[]): Set<string> {
  return new Set(accounts.filter((a) => !a.includeInBudget).map((a) => a.id));
}

/** Account ids flagged out of reports. */
export function reportExcludedAccountIds(accounts: { id: string; includeInReports: boolean }[]): Set<string> {
  return new Set(accounts.filter((a) => !a.includeInReports).map((a) => a.id));
}
