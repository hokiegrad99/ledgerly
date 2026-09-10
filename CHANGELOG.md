# CHANGELOG

All notable changes to Ledgerly.

## 2026-09-10 — Delete undo (ISSUE-005), grouped Reports filter (ISSUE-004), live redeploy

### Fixed
- ISSUE-005: transaction deletes are now undoable for a short window.
  `src/domain/undo.ts` snapshots the removed transactions, their splits, and any
  referenced transfer pairs *before* deletion; the Transactions page restores them
  from an "Undo" toast (10s). Covers bulk deletes and single-row deletes.
- ISSUE-004: the Reports category filter renders `<optgroup>`s per non-archived
  category group (with an "Other" bucket for categories whose group is archived or
  missing, so none are dropped). Empty groups are omitted.

### Added
- `src/domain/undo.ts` + `src/domain/undo.test.ts` (9 tests).
- `scripts/verify-deployed.mjs`: check that the Reports category filter is grouped.

### Verified (against the live deployment)
- Committed as `c061f3b`; the GitHub Actions Pages workflow completed successfully.
- **39/39 checks pass, no console errors.** The grouped-filter check confirms the new
  bundle is deployed (28 groups / 147 options), and the 375px Reports overflow that
  previously failed now passes on every route.
- Undo confirmed live end-to-end: bulk-deleted 50 transactions (351 → 301) and
  restored them from the toast (301 → 351).

### Tests
- 136 total (10 files). Typecheck and production build clean.

## 2026-09-10 — Tag search (REQ-035) + responsive fixes (REQ-006)

### Fixed
- ISSUE-003: free-text transaction search now matches **tag names** too.
  `queryTransactions` resolves tag names → ids (case-insensitive) and includes
  transactions whose tags match, OR'd with merchant/description/notes. REQ-035
  marked VERIFIED.
- Reports date-range row overflowed 31px at 375px (date inputs can't shrink below
  intrinsic width inside a non-wrapping flex) — added `flex-wrap`.

### Tests
- 1 new repository test (tag-name search incl. case-insensitivity and merchant
  search still working). 127 total.

### Verified
- Responsive pass added to `scripts/verify-deployed.mjs` (375/768/1024/1440 × all
  routes: nav mode, drawer, sidebar collapse, no horizontal scroll). 38/38 checks
  pass on the local build; REQ-006 marked VERIFIED. Against the live deployment
  37/38 pass — the only failure is the (already fixed) Reports overflow, which
  clears on the next deploy.

## 2026-09-10 — GitHub Pages deployment verified (REQ-041, REQ-042)

### Added
- `scripts/verify-deployed.mjs`: headless-Chrome (CDP) verification script for the
  deployed app — onboarding, sample-data seeding, IndexedDB counts, all 12 routes,
  transaction search, backup download validation, PWA manifest + service worker,
  and full offline reload + offline navigation.

### Verified (against the live deployment)
- GitHub Pages deployment live at `https://hokiegrad99.github.io/ledgerly/`
  (note: lowercase — the capital-L URL 404s). REQ-042 marked VERIFIED.
- PWA: manifest served, service worker registers/activates/controls the page,
  the app reloads and works fully offline with stored data intact, and in-app
  navigation works offline. REQ-041 marked VERIFIED; ISSUE-002 closed.
- Acceptance subset: onboarding → sample data (6 accounts, 351 transactions) →
  every route renders → search filters ("Starbucks": 50 → 30 rows) → backup
  download produces a valid `ledgerly-backup` v1 file. 28/28 checks pass,
  no console errors.

## 2026-09-10 — Budget rollover carry-forward (REQ-026)

### Added
- `budgetRolloverCarryover` pure function: previous month's signed remainder
  (amount − spent) per rollover category.
- `budgetSummary` accepts an optional carryover map — carried surplus adds to a
  category's budget, deficits subtract, and carry-only categories (not budgeted
  this month) appear in the summary.
- Budget page: per-category "Rollover" toggle (persisted), carried-over amounts
  shown under each row's Budgeted input, previous month's spending fetched to
  compute carry.
- Dashboard budget widget includes rollover carry-forward.

### Fixed
- ISSUE-001: unused rollover budget now carries into the next month (surplus
  adds, deficit subtracts).

### Tests
- 7 new unit tests: carry-forward math (surplus/deficit/zero), summary
  integration, and carry-only categories. Total 126 passing.

## 2026-09-10

### Added
- Project scaffolding: Vite + React 18 + TypeScript + Tailwind CSS + Dexie + Recharts
- Domain layer: decimal-safe money (integer cents), date parsing, full data model
- Financial calculations: net worth, cash flow, budgets (category + flex), transfer
  detection, recurring detection, investment portfolio math, payoff schedules,
  net-worth history, integrity checks
- Data layer: `DataRepository` abstraction + `IndexedDBRepository` (Dexie), with
  balance recomputation and backup export/import (replace/merge)
- Application shell: collapsible sidebar, mobile drawer + bottom navigation, light/
  dark/system theme toggle, storage-mode indicator
- Pages: Dashboard (customizable widgets), Transactions (search/filter/pagination/
  bulk/split/transfers/duplicate), Budget, Goals, Recurring (list + calendar +
  auto-detect), Accounts, Investments, Net Worth, Reports (9 report kinds, saved
  reports, CSV export), Planning (debt payoff + forecast), Import & Export,
  Settings (appearance/categories/tags/rules/data management)
- CSV/TSV import wizard: delimiter & header detection, column mapping with mapping
  memory, normalized preview, duplicate warnings
- QFX/OFX import: full statement parser with FITID preservation
- Duplicate detection: external-ID, hash, and fuzzy matching
- Transaction rules engine: conditions + actions with priority ordering
- Backup/restore: versioned `ledgerly-backup-v1.json`, validation, record counts,
  replace/merge restore
- Sample dataset (fictional) with onboarding choice
- PWA: manifest, icons, service worker via vite-plugin-pwa
- GitHub Actions Pages deployment workflow
- Project tracking: REQUIREMENTS.md (50 requirements), BUILD_STATUS.md,
  DECISIONS.md (10 decisions), KNOWN_ISSUES.md (5 issues), NEXT_TASKS.md,
  CHANGELOG.md, `scripts/project-status.mjs` (`npm run project:status`)
- 119 automated tests (money, dates, calculations, imports, duplicates, rules,
  backup, repository)

### Changed
- All monetary math moved to integer cents (no float accounting)

### Fixed
- CSV multiline quoted-field parsing
- Date parsing: YYYYMMDD, M/D/YY, Excel serial dates (UTC), MM/DD/YYYY convention
- Rule amount conditions now interpret values in dollars

### Tests
- 119 tests passing across 9 test files