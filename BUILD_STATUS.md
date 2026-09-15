# BUILD_STATUS.md — Current Project State

> **This is the most important file for recovering project context after a
> disconnected or restarted session.** Read this first, then REQUIREMENTS.md,
> NEXT_TASKS.md, DECISIONS.md, and KNOWN_ISSUES.md.

## Overall Progress

Completion: **82%** (41 of 50 requirements verified; DEFERRED/NOT_STARTED server-mode items excluded from completion).

### Requirements by status

| Status | Count |
|---|---|
| NOT_STARTED | 5 |
| IN_PROGRESS | 0 |
| IMPLEMENTED | 4 |
| TESTING | 0 |
| VERIFIED | 41 |
| BLOCKED | 0 |
| DEFERRED | 0 |
| **Total** | **50** |

Completion Percentage = VERIFIED / total active requirements × 100 = 41/50 = 82%.
*(Run `npm run project:status` to regenerate live numbers.)*

## Current Development Phase

**Phase 6 — Backup/restore, PWA, GitHub Pages deployment** (spec phases 1–6 are
substantially complete; Phase 7 — server mode — is deferred by design).

**Current Task:** The §48 acceptance checklist is fully automated **and verified
against the live deployment (105/105, re-confirmed 2026-09-13)**. Latest work:
the Add/Edit transaction amount-field fix (ISSUE-013) and report PDF export
(REQ-034 enhancement — A4 PDF for all report kinds, Monarch-style cash-flow
diagram embedded as an image, lazy-loaded jsPDF). Remaining backlog: the
Medium/Low items in NEXT_TASKS.md (server-mode docs, dashboard niceties) and
the 100k-transaction validation for REQ-009.

## Last Completed Work

### 2026-09-15 — Amount input fix (ISSUE-013) + report PDF export
- **ISSUE-013 (amount field):** `AmountInput` no longer reformats while typing —
  the field keeps raw text while focused and normalizes on blur (2-dp format,
  negatives clamped to 0); `TransactionDraft.amount` is now `number | null` so
  an empty field is representable and the form stays disabled until the amount
  parses; `SplitModal` uses the same fixed component. 8 new component tests.
- **Report PDF export (REQ-034):** *Export PDF* button next to *Export CSV* on
  the Reports page. `src/lib/reportPdf.ts` is a dependency-free A4 layout
  builder (title, applied filters, summary cards, data table with pagination
  and repeated headers) unit-tested via an in-memory harness (`pdf-test-harness.ts`,
  19 tests); jsPDF is imported dynamically at export time. The Monarch-style
  cash-flow report rasterizes its live Sankey SVG at 2× and embeds it as an
  image (graceful table-only fallback if rasterization fails).
- Verified: **191/191 unit tests**, typecheck clean, production build clean;
  jsPDF isolated in an on-demand chunk (initial JS 318.7 kB vs 317.2 kB before).
  Browser probes could not run in this session's sandbox (headless Chrome denies
  the IndexedDB API entirely — pre-existing environment restriction, noted in
  KNOWN_ISSUES.md ISSUE-013); the affected flows are covered by the new
  component tests.

### 2026-09-13 — Cash-flow diagram clipping fix + zoom/pan (ISSUE-012)
- Fixed the Monarch-style cash-flow diagram clipping its right-hand labels (the
  last column's labels were drawn outside the SVG viewBox): `FlowChart` now
  reserves a 280-unit label gutter and lays out node columns inside 760 viewBox
  units, so category/amount/% labels always render fully.
- Added zoom (100–300%) + reset controls with scroll panning: the zoomed canvas
  uses a percentage width so the scroll container is not stretched, and scroll
  re-anchors on zoom change and month navigation (`CashFlowMapView` toolbar).
- `scripts/probe-cashflow-map.mjs` extended 9 → 13 checks (no-clip `getBBox`
  assertion, zoom scrollability, reset/fit-width/scroll-anchor). **13/13 twice**;
  164 unit tests, typecheck, and production build clean.

### 2026-09-13 — Route-level code splitting (REQ-009) + REQ-025 flex budget verified
- **Code splitting:** every page in `src/App.tsx` is now a `React.lazy` route with a
  `Suspense` fallback, and the sample-data module is dynamically imported on demand.
  Initial JS bundle **992.6 kB → 317.2 kB** minified (**276 → 103 kB gzip**); recharts
  is isolated in an on-demand `Charts` chunk (426 kB); each page ships as its own chunk.
  The Vite >500 kB chunk warning is gone. First-load performance directly supports the
  REQ-009 targets.
- **REQ-025 flex budget verified end to end:** new `scripts/probe-flex-budget.mjs`
  (11 checks): Budget page renders in category mode; mode switch category → flex;
  flex amount entered and saved; the budget row is persisted as `mode=flex` with the
  exact cent amount; flex mode + amount restored after a full reload; **spent matches
  independent IndexedDB math** (all categorized non-transfer expense spending in the
  month, honoring account `includeInBudget=false` and the exclude-from-budget system
  tag); remaining = flex − spent; round-trip back to category mode with budget items
  intact. **11/11 checks pass, two consecutive runs.**
- A stale comment in `Budget.tsx` ("sum spending across budgeted categories") was
  corrected — flex spending is the single flexible total, not budgeted-categories-only.
- Re-verified after the splitting change: **163/163 tests**, typecheck clean,
  production build clean (no chunk warning), cash-flow probe **9/9**, and the full
  harness **105/105** on both the local build and the live deployment.
- REQ-025 marked VERIFIED (41 of 50 → 82%). Doc drift fixed: test counts updated to
  163 in README/DEPLOYMENT/REQUIREMENTS; stale BUILD_STATUS sections reconciled.

### 2026-09-10 — Monarch-style cash-flow report (REQ-033 enhancement)
- New report kind **"Cash flow (Monarch-style)"** (`cashflow-map`) in Reports,
  built from the user's Monarch screenshot:
  - Four summary tiles: Total income / Total expenses / Total net income /
    Savings rate.
  - Month navigation (‹ ›) that is independent of the date-range filter — the
    view fetches its own month from the repository (bounded indexed query),
    while account/category/tag filters still apply.
  - A dependency-free SVG Sankey (`src/components/reports/FlowChart.tsx`):
    income sources → Income → category groups → top categories, with net
    income rendered as a green "Savings" flow out of Income; percentages
    relative to total income; node heights fit the larger of inflow vs outflow;
    pastel gradient ribbons colored by target; hover titles on nodes and links.
  - CSV export of the month's income/expense rows.
- New probe `scripts/probe-cashflow-map.mjs` (9 checks): report selectable,
  tiles, month header, Sankey rendering (20 nodes / 19 ribbons), Income node,
  Savings flow when net > 0 (seeds a windfall income into the throwaway
  profile DB since all sample-data months are net-negative by design),
  category groups present, and month navigation moving the header.
- **9/9 probe checks pass (twice)**; full harness still **105/105**; 163 unit
  tests, typecheck, and production build clean.

### 2026-09-10 — Harness Phases 10–11: import history + holdings sync verified
- Extended `scripts/verify-deployed.mjs`:
  - **Phase 10 (REQ-023):** the Import & Export page shows the "Recent imports"
    card listing the OFX/QFX sessions created by Phases 7–8 (Phase 6's
    replace-restore wipes the CSV ones), with imported/duplicate counts.
  - **Phase 11 (REQ-031):** on Investments, opens the "Sync from activity" preview
    modal and asserts the plan proposes **exactly 2 updates, 0 adds/removals**
    (brokerage VTI 46.5→40 sh / $6,800→$9,800; 401(k) SPY 160→20 sh /
    $40,000→$9,960), that before→after values and preserved manual prices are
    shown, then applies and re-reads IndexedDB to confirm the writes and that
    the 5 holdings without activity are untouched.
- **105/105 checks pass** on the local build (two consecutive runs) and against
  the live deployment; no console errors. Phases 1–11 now cover the §48
  checklist plus REQ-023/REQ-031.

### 2026-09-10 — REQ-023 import history UI + REQ-031 holdings auto-derivation
- **REQ-023:** `importSessions` now flows through `AppContext`, and the Import &
  Export page shows a "Recent imports" card (file, type, account, date, imported/
  skipped counts) — the sessions were recorded but never displayed.
- **REQ-031:** new `src/domain/holdings.ts` — pure `deriveHoldings` replays
  share-affecting investment activity (buy/sell/reinvest cost = amount, or
  shares×price+fees; average-cost sells; split multipliers; signed transfers;
  income-only never opens a position) and `planHoldingSync` diffs the result
  against existing holdings into adds/updates/removals. The Investments page
  gains a "Sync from activity" button with a preview modal before applying.
  Manually-maintained holdings without activity are left untouched; manually
  entered prices are preserved on update.
- 16 new tests in `src/domain/holdings.test.ts` — **163 total** (12 files);
  typecheck and production build clean.
- REQ-023 and REQ-031 marked VERIFIED (40 of 50 verified → 80%).

### 2026-09-10 — Split + transfer editing automated (Phase 9)
- Added Phase 9 to `scripts/verify-deployed.mjs`: opens the row menu on a real
  transaction, splits it into two category lines via the SplitModal (category
  selected, saved, Split badge shown, 2 split lines persisted), then links it to
  a counterpart via the TransferModal's "Create & link" (counterpart transaction
  persisted, pair record written, both sides marked transfer — linked 52 → 54),
  then unlinks the pair (record removed). **90/90 checks pass** on the local
  build (two runs), no console errors. This completes the entire §48 interactive
  acceptance checklist.

### 2026-09-10 — Rule application on import automated (Phase 8)
- Added Phase 8 to `scripts/verify-deployed.mjs`: creates a real rule in Settings
  (merchant contains "RULE-IMPORT" → set category Groceries), imports an OFX
  statement matching it, and asserts the imported row shows the rule-applied
  category in Transactions. **77/77 checks pass** on the local build (two runs),
  no console errors.
- Live deployment: verified at **70/70** after the `bbc205b` search-wiring push
  (category/account-name search checks now green live); Phase 8 ships with the
  next push.

### 2026-09-10 — Requirements audit: six dead/incomplete features fixed
- Audited the app against the original 50-requirement spec (no new features).
  Fixed: ISSUE-006 (account delete unreachable — added a Delete button to the
  account edit modal), ISSUE-007 (pending filter had no UI control — added a
  "Pending: all / Pending only" dropdown), ISSUE-008 (includeInBudget/
  includeInReports toggles and rule exclude actions were persisted but never
  consumed — new `src/domain/exclusions.ts`; Budget/Dashboard/Reports now honor
  them), ISSUE-009 (free-text search ignored category/account names — repository
  resolves names → ids; the Transactions page now routes the search box through
  `q.search`, which it wasn't doing), ISSUE-010 (saved reports couldn't be
  renamed — added a Rename action/modal), ISSUE-011 (currency/dateFormat settings
  persisted but never applied — `formatMoney`/`formatDate` now use app-wide
  defaults driven by the settings).
- New tests: `src/domain/exclusions.test.ts` (9), exclusion rule-application,
  category/account-name search. **147 total** (11 files), typecheck clean.
- Audit commit `ee5f88c` pushed; live deployment verified at **68/70** (the two
  failures are the new category/account-name search checks — the search-wiring
  fix landed after that push and ships with the next one). Local build with all
  fixes: **70/70 checks pass**, no console errors.

### 2026-09-10 — QFX/OFX import wizard automated
- Added Phase 7 to `scripts/verify-deployed.mjs`: uploads a generated OFX statement
  (`DOM.setFileInputFiles`), asserts the parser finds all 3 transactions, selects an
  account, imports them (351 → 354), then re-imports the same statement and confirms
  **all 3 are skipped by FITID** (0 new rows). Imported rows are searchable.
- **66/66 checks pass** on the local build and against the live deployment, no console
  errors.

### 2026-09-10 — CSV import + restore wizard automated
- Extended `scripts/verify-deployed.mjs` with two phases:
  - **Phase 5 — CSV import wizard**: uploads a real CSV via `DOM.setFileInputFiles`,
    verifies auto-mapping (date + amount), account selection, preview, import
    (351 → 355), re-import duplicate skip (4 flagged, 0 new rows), and that the
    imported rows are searchable in Transactions.
  - **Phase 6 — restore wizard**: uploads the Phase-1 backup, validates it, restores in
    **replace** mode (355 → 351, exactly the backup), removes one record, then restores
    in **merge** mode (350 → 351).
- **58/58 checks pass** on the local build (twice) and against the live deployment,
  no console errors.

### 2026-09-10 — Fixes pushed; live deployment re-verified
- Fixed ISSUE-005 (short-lived undo buffer for transaction deletes: snapshots
  transactions + splits + transfer pairs before deletion, restores from a toast) and
  ISSUE-004 (Reports category filter grouped by category group, with an "Other"
  bucket so no category is dropped). 136 tests passing.
- Committed everything as `c061f3b` and pushed to `main`; the Pages workflow completed
  successfully.
- Re-verified the live deployment: **39/39 checks pass, no console errors**. The new
  grouped-filter check confirms the new bundle is deployed (28 groups / 147 options),
  and the previously-failing 375px Reports overflow now passes on every route.
- Undo verified live end-to-end: bulk-deleted 50 transactions (351 → 301) and restored
  them from the toast (301 → 351).
- Known issues: 0 open.

### 2026-09-10 — Tag search (REQ-035) + responsive pass (REQ-006)
- Fixed ISSUE-003: free-text transaction search now matches tag names
  (`queryTransactions` resolves tag names → ids; OR'd with merchant/description/notes).
  New repository test; 127 tests passing. REQ-035 marked VERIFIED.
- Added a responsive phase to `scripts/verify-deployed.mjs`: 375/768/1024/1440 × all
  12 routes checks nav mode (bottom nav + hamburger vs sidebar), mobile drawer open,
  desktop sidebar collapse, and page-level horizontal scroll.
- Found and fixed one layout bug: Reports date-range row overflowed 31px at 375px
  (non-wrapping flex of date inputs) — added `flex-wrap`.
- Full verification on the local build: 38/38 checks pass, no console errors.
  Against the live deployment at the time: 37/38 (the one failure was the Reports
  overflow, since fixed and re-verified live). REQ-006 marked VERIFIED.

### 2026-09-10 — Deployed to GitHub Pages; PWA + acceptance verified (REQ-041, REQ-042)
- Deployed via the Actions workflow — app is live at **`https://hokiegrad99.github.io/ledgerly/`**
  (lowercase; the capital-L URL 404s on Pages).
- Added `scripts/verify-deployed.mjs` (headless Chrome via CDP, no new dependencies):
  - Acceptance subset: onboarding → sample data (6 accounts, 351 transactions),
    all 12 routes render, search filters ("Starbucks": 50 → 30 rows), backup
    download captured and validated (`ledgerly-backup` v1, 351 transactions).
  - PWA: manifest served + valid (standalone, 2 icons); service worker registered,
    activated, and controlling the page; **full offline reload renders the app with
    stored data intact**; in-app navigation works offline. No console errors.
  - 28/28 checks pass.
- REQ-041 and REQ-042 marked VERIFIED (70% overall); ISSUE-002 closed.

### 2026-09-10 — Budget rollover carry-forward (REQ-026)
- Added `budgetRolloverCarryover` (pure function: previous month's signed remainder
  per rollover category) and carryover support in `budgetSummary` (surplus adds,
  deficit subtracts; carry-only categories included).
- Budget page: per-category "Rollover" toggle (persisted), carried amounts shown per
  row, previous month's spending fetched for carry computation.
- Dashboard budget widget includes carry-forward.
- 7 new unit tests; ISSUE-001 closed (FIXED); REQ-026 marked VERIFIED.

### 2026-09-10 — Initial full build
- Scaffolded Vite + React + TypeScript + Tailwind project.
- Domain layer: decimal-safe money (integer cents), date parsing, types, calculations
  (net worth, cash flow, budgets, transfers, recurring detection, investments, payoff schedules, integrity checks).
- Data layer: `DataRepository` abstraction + Dexie `IndexedDBRepository` (indexes, pagination, balance recomputation, backup export/import with replace/merge).
- UI: app shell (collapsible sidebar, mobile drawer + bottom nav, theme toggle), 12 pages.
- Imports: CSV/TSV wizard (delimiter/header detection, column mapping, mapping memory, preview, duplicate warnings) and QFX/OFX parser (FITID preservation).
- Rules engine with priority, conditions, actions; applied on import and manual add.
- Backup/restore wizard (versioned `ledgerly-backup-v1.json`, replace/merge, record counts).
- PWA (vite-plugin-pwa, manifest, icons, service worker).
- GitHub Actions Pages deploy workflow.
- Sample dataset (fictional, ~300 transactions).
- 119 automated tests passing; typecheck clean; production build succeeds.

**Requirements verified:** REQ-001..006, 008, 010..022, 024, 026, 027..030, 032, 033, 034, 035, 036..042, 048

**Requirements with automated end-to-end coverage in `scripts/verify-deployed.mjs`:**
onboarding/sample data, all 12 routes, search (merchant + tag + category + account
names), backup download + validation, PWA online/offline, responsive pass
(375/768/1024/1440), CSV import wizard, restore wizard (replace + merge),
QFX/OFX import wizard (FITID dedupe), rule application on import, and
**split + transfer editing**. The full §48 acceptance checklist is automated
(90/90 checks).

## Current Work

**Verification & hardening** — Status: IN_PROGRESS.
- The full §48 acceptance checklist is automated in `scripts/verify-deployed.mjs`
  (Phases 1–11) and passes **105/105** on the local build and against the live
  deployment (re-confirmed 2026-09-13).
- Remaining: REQ-009's 100k-transaction load validation; REQ-007 accessibility audit;
  REQ-049/REQ-050 doc-consistency passes; the Medium/Low backlog in NEXT_TASKS.md.

## Next Tasks

1. ~~§48 interactive acceptance~~ — **done:** fully automated (Phases 1–11) and
   verified live at **105/105** (re-confirmed 2026-09-13).
2. ~~REQ-025 flex budget verification~~ — **done:** `scripts/probe-flex-budget.mjs`
   11/11 twice (2026-09-13); marked VERIFIED.
3. REQ-009: validate app behavior with a 100k-transaction dataset, then mark VERIFIED.
4. REQ-044 — server-mode design doc + optional `ServerRepository` stub.
5. REQ-047 — document the `FinancialDataProvider` abstraction in ARCHITECTURE.md.
6. Low backlog: dashboard widget resize; category transaction counts in Settings.

## SESSION HANDOFF

**Last session:** 2026-09-13 (code splitting + REQ-025 flex-budget verification)

**What was accomplished (this session):**
- Route-level code splitting in `src/App.tsx` (React.lazy per page, Suspense fallback,
  dynamic `import('./data/sample-data')`): initial bundle 992.6 kB → 317.2 kB minified
  (276 → 103 kB gzip); recharts isolated in a lazy `Charts` chunk; Vite chunk warning
  gone. First REQ-009 step, recorded in REQUIREMENTS.md.
- New `scripts/probe-flex-budget.mjs` — REQ-025 verified end to end (mode switch both
  directions, persistence across reload, flex totals vs independent IndexedDB math,
  budget items intact after round-trip): **11/11 checks, two consecutive runs**.
  REQ-025 marked VERIFIED (41/50 → 82%).
- Live deployment re-verified: `node scripts/verify-deployed.mjs` → **105/105**, no
  console errors; the code-split local build also passes the full harness 105/105 and
  the cash-flow probe 9/9.
- Doc drift fixed: test counts updated to 163 (README, DEPLOYMENT, REQUIREMENTS);
  stale "Current Work" / "Next Tasks" / "SESSION HANDOFF" sections in this file
  reconciled with the actual project state.

**What was accomplished (prior sessions, 2026-09-10):**
- Monarch-style cash-flow report (REQ-033 enhancement) with SVG Sankey; probe 9/9.
- Harness Phases 10–11 (import history REQ-023, holdings sync REQ-031) — 105/105 live.
- Requirements audit fixing six dead/incomplete features (ISSUE-006..011).
- CSV/restore/QFX-OFX import wizards automated (Phases 5–7); rule-on-import (Phase 8);
  split + transfer editing (Phase 9) — completing the §48 checklist automation.
- GitHub Pages deployment + PWA offline verification (REQ-041/REQ-042).
- Budget rollover carry-forward (REQ-026); tag search (REQ-035); responsive pass
  (REQ-006); undo for deletes (ISSUE-005).
- Initial full build: complete local-first personal finance app (accounts, transactions,
  categories/tags, rules, imports, budgets, goals, recurring, net worth, investments,
  liabilities, reports, backup/restore, settings, sample data, PWA, Pages workflow) with
  integer-cents math throughout.

**What remains unfinished:**
- REQ-009 100k-transaction load validation (code splitting done; status IMPLEMENTED).
- REQ-007 accessibility audit, REQ-049 doc-consistency pass, REQ-050 tracking review.
- Server mode (REQ-043..047): intentionally NOT_STARTED; abstraction is in place.
- Low backlog: dashboard widget resize; category transaction counts in Settings.

**Current implementation state:**
- `npm run typecheck` — PASS
- `npm test` — PASS (191 tests)
- `npm run build` — PASS (dist/ with PWA service worker; code-split chunks)
- `npm run project:status` — reports requirements/tests/build/known-issues.

**Known problems:** see KNOWN_ISSUES.md (0 open; ISSUE-001..013 all fixed/closed).

**Next recommended task:** REQ-009's 100k-transaction validation (the last big
IMPLEMENTED → VERIFIED gap), then the Medium backlog: REQ-044 (ServerRepository
doc + stub) and REQ-047 (FinancialDataProvider docs).

**Files changed (this session):** `src/components/ui/form.tsx`,
`src/components/ui/form.test.tsx`, `src/components/transactions/TransactionForm.tsx`,
`src/components/transactions/SplitModal.tsx`, `src/pages/Transactions.tsx`,
`src/lib/reportPdf.ts` (new), `src/lib/pdf-test-harness.ts` (new),
`src/lib/reportPdf.test.ts` (new), `src/components/reports/CashFlowMapView.tsx`,
`src/pages/Reports.tsx`, package.json (+jspdf), KNOWN_ISSUES.md,
REQUIREMENTS.md, BUILD_STATUS.md, CHANGELOG.md, NEXT_TASKS.md, README.md,
DEPLOYMENT.md.

**Tests run:** `npm test` (**191 passing**), `npm run typecheck`, `npm run build`.
Browser probes (flex-budget, cashflow-map, verify-deployed) could not run in
this session's sandbox — headless Chrome denies the IndexedDB API entirely
(pre-existing environment restriction; last recorded results: 105/105 live
harness, 13/13 cash-flow, 11/11 flex budget from 2026-09-13).

**Tests passing:** 191/191. **Tests failing:** 0. **Harness checks:** 105/105
(last verified 2026-09-13).

**Important decisions:** see DECISIONS.md (DEC-001..DEC-009).