# BUILD_STATUS.md — Current Project State

> **This is the most important file for recovering project context after a
> disconnected or restarted session.** Read this first, then REQUIREMENTS.md,
> NEXT_TASKS.md, DECISIONS.md, and KNOWN_ISSUES.md.

## Overall Progress

Completion: **74%** (37 of 50 requirements verified; DEFERRED/NOT_STARTED server-mode items excluded from completion).

### Requirements by status

| Status | Count |
|---|---|
| NOT_STARTED | 5 |
| IN_PROGRESS | 0 |
| IMPLEMENTED | 8 |
| TESTING | 0 |
| VERIFIED | 37 |
| BLOCKED | 0 |
| DEFERRED | 0 |
| **Total** | **50** |

Completion Percentage = VERIFIED / total active requirements × 100 = 37/50 = 74%.
*(Run `npm run project:status` to regenerate live numbers.)*

## Current Development Phase

**Phase 6 — Backup/restore, PWA, GitHub Pages deployment** (spec phases 1–6 are
substantially complete; Phase 7 — server mode — is deferred by design).

**Current Task:** Finish the §48 interactive acceptance remainder (import
wizard, restore wizard, split/transfer/rules flows).

## Last Completed Work

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

**Requirements verified:** REQ-001..006, 008, 010..022, 024, 026, 027..030, 032, 033, 035, 036..042, 048

## Current Work

**§48 acceptance remainder** — Status: IN_PROGRESS.
- Automated acceptance subset + responsive + PWA verified against the live
  deployment (`scripts/verify-deployed.mjs`, 39/39, no console errors).
- Remaining (interactive, browser): CSV/QFX import wizard with a real file,
  duplicate skip on re-import, rule application, split/transfer editing, restore
  wizard (replace + merge).
- Deployed: the REQ-035 (tag search), REQ-006 (Reports flex-wrap), ISSUE-004
  (grouped filter), and ISSUE-005 (undo) fixes are live and verified.

## Next Tasks

1. Complete the §48 interactive acceptance remainder against the deployed app
   (import → dedupe → rules → split → transfers → restore; extend
   `scripts/verify-deployed.mjs` where automatable — e.g. `DOM.setFileInputFiles`
   for the CSV import and restore wizards).
2. Add a server-mode design doc + optional `ServerRepository` stub (REQ-044).
3. Update documentation as the above land.

## SESSION HANDOFF

**Last session:** 2026-09-10 (ISSUE-004 + ISSUE-005 fixed; pushed and live-verified)

**What was accomplished (this session):**
- Fixed ISSUE-005 (short-lived undo buffer for transaction deletes) and ISSUE-004
  (Reports category filter grouped by category group).
- Added `src/domain/undo.ts` + tests; extended `scripts/verify-deployed.mjs` with a
  grouped-filter check; 136 tests passing.
- Committed as `c061f3b`, pushed to `main`; Pages workflow succeeded.
- Re-verified live: 39/39 checks, no console errors; undo confirmed end-to-end
  (351 → 301 → 351). Known issues: 0 open.

**What was accomplished (prior session):**
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
- §48 interactive acceptance remainder (import wizard with a real file, re-import dedupe,
  rule application, split/transfer editing, restore replace/merge).
- Server mode (Phase 7): intentionally NOT_STARTED; abstraction is in place.

**Current implementation state:**
- `npm run typecheck` — PASS
- `npm test` — PASS (136 tests)
- `npm run build` — PASS (dist/ with PWA service worker)
- `npm run project:status` — reports requirements/tests/build/known-issues.

**Known problems:** see KNOWN_ISSUES.md (0 open; ISSUE-001/002 closed, ISSUE-003/004/005 fixed).

**Next recommended task:** Complete the §48 interactive acceptance remainder against the
deployed app (extend `scripts/verify-deployed.mjs` for the CSV import and restore wizards).

**Files changed (last session):** everything under `src/`, `scripts/`, `.github/`, root docs (see CHANGELOG.md).
**Files changed (this session):** `src/pages/Reports.tsx` (filter grouping),
`src/pages/Transactions.tsx` (+ undo toast), `src/domain/undo.ts` +
`src/domain/undo.test.ts` (new), `scripts/verify-deployed.mjs` (+ grouped-filter check),
KNOWN_ISSUES.md, NEXT_TASKS.md.

**Tests run:** `npm test` (136 passing), `npm run typecheck`, `npm run build`,
`node scripts/verify-deployed.mjs` (39/39 against both the local build and the live
deployment), plus a live delete/undo check (351 → 301 → 351).

**Tests passing:** 136/136. **Tests failing:** 0.

**Important decisions:** see DECISIONS.md (DEC-001..DEC-009).