# DECISIONS.md — Architectural Decisions

Record of important decisions. Once made, a decision is not silently reversed;
if it must change, a new decision is added explaining why.

## DEC-001 — Local-first storage with IndexedDB/Dexie
- **Date:** 2026-09-10
- **Decision:** Use IndexedDB via Dexie.js for all financial data.
- **Reason:** The app must run from GitHub Pages with no backend, handle 100k+
  transactions, and keep financial data on-device for privacy.
- **Alternatives considered:** localStorage (too small, synchronous), SQLite WASM
  (heavier, less browser-native), remote PostgreSQL (violates local-first/privacy).
- **Consequence:** All persistence goes through a `DataRepository` interface so a
  future PostgreSQL backend can replace IndexedDB without touching UI code.

## DEC-002 — DataRepository abstraction
- **Date:** 2026-09-10
- **Decision:** Define a `DataRepository` interface with an `IndexedDBRepository`
  implementation; UI depends only on the interface.
- **Reason:** Enables the future server mode (REQ-043/044) without a rewrite, and
  makes the app testable with fake-indexeddb.
- **Alternatives considered:** Direct Dexie usage in components (rejected: couples UI to storage).
- **Consequence:** A `ServerRepository` can be added later; local mode is fully functional now.

## DEC-003 — Integer cents for all money
- **Date:** 2026-09-10
- **Decision:** All monetary amounts are stored and computed as integer cents.
  Prices that need sub-cent precision use micro-units (1/1,000,000) only for
  share-count × price products, rounded at the boundary.
- **Reason:** JavaScript floats produce artifacts (0.1 + 0.2); accounting must be exact.
- **Alternatives considered:** BigNumber/decimal libraries (extra dependency and
  serialization complexity for a local-first app), float with rounding (rejected).
- **Consequence:** Money math is exact; formatting happens only at display/parse boundaries.

## DEC-004 — Sign convention for transactions
- **Date:** 2026-09-10
- **Decision:** A transaction amount is signed relative to its account: negative =
  money left the account (expense), positive = money entered (income). Transfers are
  a linked pair (one negative, one positive) and are excluded from income/expense
  calculations everywhere.
- **Reason:** Matches bank statement data (OFX TRNAMT, most CSV exports) and makes
  transfers naturally net to zero.
- **Alternatives considered:** Always-positive amounts with a direction flag (more
  conversion surface at every calculation).
- **Consequence:** Display flips sign for expense rows in the UI; budget/report
  calculations use absolute values for expenses.

## DEC-005 — HashRouter for GitHub Pages
- **Date:** 2026-09-10
- **Decision:** Use `HashRouter` (hash-based routing) with a relative Vite `base: './'`.
- **Reason:** GitHub Pages project sites serve from `/<repo>/` with no server-side
  rewrite support; hash routing works with zero server configuration.
- **Alternatives considered:** BrowserRouter + 404.html SPA fallback (fragile on Pages).
- **Consequence:** URLs contain `#/`; fully functional; server mode can switch to
  BrowserRouter later.

## DEC-006 — System tags for "exclude from budget/reports" rules
- **Date:** 2026-09-10
- **Decision:** Rule actions "exclude from budget" and "exclude from reports" are
  implemented as reserved tags (`__exclude_from_budget`, `__exclude_from_reports`)
  attached to transactions.
- **Reason:** Avoids adding more boolean columns to the transaction model and keeps
  rule actions composable; tags already support multiple actions per rule.
- **Alternatives considered:** Dedicated boolean columns (more schema surface), a
  per-transaction exclusion table (overkill).
- **Consequence:** System tags are hidden from the tags UI; `parseExclusionTags`
  resolves them.

## DEC-007 — Derived balances recomputed from transactions
- **Date:** 2026-09-10
- **Decision:** Account `balance` is a derived value: `startingBalance + Σ amounts`.
  It is recomputed for affected accounts on every save/delete and fully on restore
  and via "Recompute all balances" in Settings.
- **Reason:** Guarantees correctness over incremental bookkeeping; the cost (a scan
  of the transactions table) is acceptable for typical data sizes.
- **Alternatives considered:** Maintaining running balances transactionally (more
  edge cases with bulk imports and deletes).
- **Consequence:** Balance is always consistent with transaction history.

## DEC-008 — Pages query transactions on demand
- **Date:** 2026-09-10
- **Decision:** The global app context holds only reference data (accounts,
  categories, tags, rules, etc.). Transactions are queried per page with
  pagination and range queries.
- **Reason:** Never load 100k+ transactions into React state (REQ-009).
- **Alternatives considered:** Loading everything into a context store (rejected:
  memory and render cost).
- **Consequence:** Pages use a `dataVersion` counter to refetch after mutations.

## DEC-009 — Sample data never auto-loads
- **Date:** 2026-09-10
- **Decision:** Demo data is offered on first run and via Settings → Data management,
  but never loaded automatically.
- **Reason:** The spec forbids fake data appearing in a production workflow
  without clear labeling and user intent.
- **Alternatives considered:** Auto-loading on first run (rejected).
- **Consequence:** First-run onboarding presents a choice: "Explore sample data" or "Start fresh".

## DEC-010 — Amounts in rule conditions are dollars
- **Date:** 2026-09-10
- **Decision:** Rule condition values for `amount` are entered and interpreted in
  dollars (e.g. "50" means $50), converted to cents inside the engine.
- **Reason:** Users think in dollars; the rest of the system stores cents.
- **Alternatives considered:** Cents in the rule editor (confusing).
- **Consequence:** `conditionMatches` multiplies numeric condition values by 100.