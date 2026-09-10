# BUILD_STATUS.md — Current Project State

> **This is the most important file for recovering project context after a
> disconnected or restarted session.** Read this first, then REQUIREMENTS.md,
> NEXT_TASKS.md, DECISIONS.md, and KNOWN_ISSUES.md.

## Overall Progress

Completion: **76%** (38 of 50 requirements verified; DEFERRED/NOT_STARTED server-mode items excluded from completion).

### Requirements by status

| Status | Count |
|---|---|
| NOT_STARTED | 5 |
| IN_PROGRESS | 0 |
| IMPLEMENTED | 7 |
| TESTING | 0 |
| VERIFIED | 38 |
| BLOCKED | 0 |
| DEFERRED | 0 |
| **Total** | **50** |

Completion Percentage = VERIFIED / total active requirements × 100 = 38/50 = 76%.
*(Run `npm run project:status` to regenerate live numbers.)*

## Current Development Phase

**Phase 6 — Backup/restore, PWA, GitHub Pages deployment** (spec phases 1–6 are
substantially complete; Phase 7 — server mode — is deferred by design).

**Current Task:** The §48 acceptance checklist is now fully automated (90/90).
Remaining backlog: the Medium/Low items in NEXT_TASKS.md.

## Last Completed Work

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

**§48 acceptance remainder** — Status: IN_PROGRESS.
- Automated acceptance subset + responsive + PWA + CSV import + QFX/OFX import +
  restore wizard verified against the live deployment (`scripts/verify-deployed.mjs`,
  **66/66**, no console errors).
- Remaining (interactive, browser): rule application on import, split/transfer editing.
- Deployed: the REQ-035 (tag search), REQ-006 (Reports flex-wrap), ISSUE-004
  (grouped filter), and ISSUE-005 (undo) fixes are live and verified.

## Next Tasks

1. **Push the search-wiring fix** (`src/pages/Transactions.tsx`: search box →
   `q.search`) so the category/account-name search checks pass on the live site
   (currently 68/70 live, 70/70 local).
2. Complete the §48 interactive acceptance remainder against the deployed app
   (rule application on import → split/transfer editing; extend
   `scripts/verify-deployed.mjs` where automatable — the CSV and QFX/OFX import and
   restore wizards are already covered).
3. Add a server-mode design doc + optional `ServerRepository` stub (REQ-044).
4. Update documentation as the above land.

## SESSION HANDOFF

**Last session:** 2026-09-10 (QFX/OFX import wizard automated in the harness)

**What was accomplished (this session):**
- Extended `scripts/verify-deployed.mjs` with Phase 5 (CSV import wizard: real file,
  auto-mapping, account selection, preview, import, re-import duplicate skip, and the
  imported rows are searchable), Phase 6 (restore wizard: validate, replace restores the
  backup exactly, merge re-adds a removed record), and Phase 7 (QFX/OFX import wizard:
  generated OFX statement, FITID-based re-import dedupe, searchable result).
- **66/66 checks pass** on the local build and against the live deployment; no console
  errors.

**What was accomplished (prior session):**
- Fixed ISSUE-005 (short-lived undo buffer for transaction deletes) and ISSUE-004
  (Reports category filter grouped by category group); 136 tests passing.
- Committed `c061f3b`, pushed to `main`; Pages workflow succeeded; live re-verified at
  39/39; undo confirmed live (351 → 301 → 351); docs commit `6ab99e6`.

**What was accomplished (earlier session):**
- Confirmed the build green (typecheck, 126 tests, production build) and the Pages
  workflow deploying successfully.
- Documented the lowercase live URL (`https://hokiegrad99.github.io/ledgerly/`; the
  capital-L variant 404s) in README.md and DEPLOYMENT.md.
- Wrote `scripts/verify-deployed.mjs` (acceptance subset + PWA online/offline, 28/28).
- REQ-041/REQ-042 VERIFIED; then fixed ISSUE-003 (tag-name search, REQ-035) and the
  Reports 375px overflow (REQ-006) and added a responsive phase (38/38 local).

**What was accomplished (initial build):**
- Complete local-first personal finance app: accounts, transactions (search/filter/
  bulk/split/transfers/duplicate), categories/tags, rules, CSV + QFX/OFX imports with
  duplicate detection, budgets (category + flex), goals, recurring (auto-detect + calendar),
  net worth, investments, liabilities/payoff planning, reports (9 report kinds + saved reports
  + CSV export), backup/restore, settings, sample data, PWA, GitHub Pages workflow.
- All financial math uses integer cents (no float accounting).
- 119 vitest tests across money, dates, calculations, CSV/OFX import, duplicates, rules,
  backup round-trip, and the IndexedDB repository.

**What remains unfinished:**
- §48 interactive acceptance — fully automated (90/90 checks, Phases 1–9).
- Server mode (Phase 7): intentionally NOT_STARTED; abstraction is in place.

**Current implementation state:**
- `npm run typecheck` — PASS
- `npm test` — PASS (147 tests)
- `npm run build` — PASS (dist/ with PWA service worker)
- `npm run project:status` — reports requirements/tests/build/known-issues.

**Known problems:** see KNOWN_ISSUES.md (0 open; ISSUE-001..011 all fixed/closed).

**Next recommended task:** Push `bbc205b`, `2a0a7d1` (Phase 8), and the Phase 9
work; the live site is at 70/70 and will reach 90/90 with the harness update
(harness-only, no app code).

**Files changed (last session):** everything under `src/`, `scripts/`, `.github/`, root docs (see CHANGELOG.md).
**Files changed (this session):** `bbc205b` (search-wiring fix + harness search
checks + audit docs); Phase 8 (rule application on import) in
`scripts/verify-deployed.mjs`; BUILD_STATUS.md, CHANGELOG.md, NEXT_TASKS.md.

**Tests run:** `npm test` (147 passing), `npm run typecheck`, `npm run build`,
`node scripts/verify-deployed.mjs` (**90/90** on the local build, two consecutive
runs; **70/70** against the live deployment after the `bbc205b` push — Phases
8–9 ship with the next push), plus a live delete/undo check (351 → 301 → 351)
in a prior session.

**Tests passing:** 147/147. **Tests failing:** 0.

**Important decisions:** see DECISIONS.md (DEC-001..DEC-009).