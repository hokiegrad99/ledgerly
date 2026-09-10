# CHANGELOG

All notable changes to Ledgerly.

## 2026-09-10 — Import history + holdings sync automated in the verification harness (Phases 10–11)

### Added
- `scripts/verify-deployed.mjs` **Phase 10 — import session history (REQ-023)**:
  asserts the Import & Export page shows the "Recent imports" card listing the
  OFX/QFX sessions recorded by the import phases (with imported/duplicate
  counts).
- `scripts/verify-deployed.mjs` **Phase 11 — holdings sync (REQ-031)**: opens the
  "Sync from activity" preview on Investments and asserts the plan proposes
  exactly 2 updates and no adds/removals for the sample data (brokerage VTI
  46.5→40 sh / $6,800→$9,800; 401(k) SPY 160→20 sh / $40,000→$9,960), that the
  preview shows before→after values with manually entered prices preserved,
  then applies and re-reads IndexedDB to confirm the writes and that holdings
  without activity are untouched.

### Verified
- **105/105 checks pass** on the local build (two consecutive runs) and against
  the live deployment at https://hokiegrad99.github.io/ledgerly/ — no console
  errors. REQ-023 and REQ-031 are now verified end to end in production.
- Harness commit `6bafc8a` pushed and deployed by the Pages workflow (run
  completed 2026-09-10 20:28 UTC); the live deployment re-verified at **105/105**
  with the new Phases 10–11 included.

## 2026-09-10 — Import history UI (REQ-023) + holdings auto-derivation (REQ-031)

### Added
- **Import & Export — "Recent imports" card (REQ-023):** the import sessions that
  were already recorded on every CSV/QFX import are now surfaced in the UI —
  file name, type, target account, date, and imported/duplicate counts (five
  most recent). `importSessions` is exposed through `AppContext`.
- **Investments — "Sync from activity" (REQ-031):** new `src/domain/holdings.ts`
  replays recorded investment transactions into per-(account, security)
  positions using average-cost accounting:
  - buy/reinvest: shares and cost basis accumulate (amount, or shares×price+fees
    when amount is 0);
  - sell: shares decrease, cost basis reduces proportionally (average cost);
  - split: `shares` is the multiplier (2 = 2-for-1, 0.5 = reverse);
  - transfer: signed share delta — inflow cost = shares×price, outflow reduces
    proportionally;
  - dividend/interest: cash only, never opens a position;
  - sells beyond the recorded position clamp at zero; replay order is
    date-then-createdAt regardless of input order.
  - `planHoldingSync` diffs derived positions against existing holdings and
    proposes adds/updates/removals; a preview modal shows the exact changes
    before anything is saved. Holdings with no recorded activity are left
    untouched, and manually entered prices survive updates.

### Tests
- New: `src/domain/holdings.test.ts` (16 tests covering buys, average-cost
  sells, over-sell clamping, splits/reverse splits, transfers, income-only
  activity, ordering, per-pair isolation, and all planner outcomes).
  **163 total** (12 files). Typecheck and production build clean.

### Status
- REQ-023 and REQ-031 marked VERIFIED — completion 76% → **80%** (40 of 50).

## 2026-09-10 — §48 checklist verified against the live deployment (90/90)

### Verified
- Phases 8–9 harness commits (`2a0a7d1`, `18d1cbc`) pushed and deployed by the
  Pages workflow (run completed 19:16 UTC).
- `node scripts/verify-deployed.mjs` against **https://hokiegrad99.github.io/ledgerly/**:
  **90 passed, 0 failed**, no console errors — onboarding/sample data, all routes,
  search (merchant/tag/category/account), backup download, PWA offline, responsive
  (375/768/1024/1440), CSV import + dedupe, restore replace/merge, QFX/OFX import +
  FITID dedupe, rule-on-import, split + transfer editing.
- The **entire §48 interactive acceptance checklist now passes in production**.

## 2026-09-10 — Split + transfer editing automated (Phase 9); §48 checklist complete

### Added
- `scripts/verify-deployed.mjs` Phase 9 — **split + transfer editing**, end to end:
  - *Split*: opens the row menu on a real transaction, splits it into two category
    lines via the SplitModal (category selected, saved, Split badge shown, 2 split
    lines persisted to IndexedDB).
  - *Transfer*: opens the TransferModal via "Link transfer…", selects a target
    account, uses "Create & link" to create a counterpart transaction (+1 txn,
    +1 pair record, both sides marked `transfer` — linked 52 → 54), then unlinks
    the pair (record removed).

### Verified
- **90/90 checks pass** on the local build (two consecutive runs), no console
  errors. With Phase 9, the **entire §48 interactive acceptance checklist is
  automated** (Phases 1–9: onboarding, routes, search, backup, PWA offline,
  responsive, CSV import + dedupe, restore replace/merge, QFX import + FITID
  dedupe, rule-on-import, split/transfer editing).

## 2026-09-10 — Rule application on import automated (Phase 8)

### Added
- `scripts/verify-deployed.mjs` Phase 8 — **rule application on import**, end to
  end: creates a real rule in Settings (merchant contains "RULE-IMPORT" → set
  category Groceries), imports an OFX statement whose merchant matches it, and
  asserts the imported row shows the rule-applied category in Transactions.

### Verified
- **77/77 checks pass** on the local build (two consecutive runs), no console
  errors. This closes the last remaining §48 interactive gap except split/transfer
  editing.
- Live deployment re-verified at **70/70** after the `bbc205b` push
  (category/account-name search checks now pass live).

## 2026-09-10 — Search-wiring fix (ISSUE-009 UI half) + live redeploy

### Fixed
- `src/pages/Transactions.tsx`: the search box was sent to `queryTransactions` as
  `q.merchant`, which bypassed the repository's tag/category/account-name matching
  added in the audit commit — so category/account-name search returned 0 rows in
  the UI even though unit tests passed. Now routed through `q.search` (which also
  covers merchant/description/notes).

### Added
- `scripts/verify-deployed.mjs`: three new search checks (category-name and
  account-name search must return rows) so this wiring can't regress silently.

### Verified
- Pushed as `bbc205b`; the Pages workflow succeeded; live deployment re-verified
  at **70/70** (was 68/70), no console errors. The served bundle is byte-identical
  to the local build.

## 2026-09-10 — Requirements audit: six dead/incomplete features fixed

Audited the app against the original 50-requirement spec (no new features — only
fixing things that were mocked, inert, or incomplete). Committed as `ee5f88c` and
pushed; live deployment re-verified.

### Fixed
- ISSUE-006 (High): **account delete was unreachable** — the delete state existed
  but no UI opened it. Added a "Delete account" button to the account edit modal.
- ISSUE-007 (High): **"pending" filter had no UI control** — the repository
  honored `q.pending`, but no dropdown exposed it. Added "Pending: all / Pending
  only" to the Transactions filter bar.
- ISSUE-008 (Medium): **includeInBudget/includeInReports toggles and rule exclude
  actions were never consumed** — persisted but ignored everywhere. New
  `src/domain/exclusions.ts` is the single source of truth; Budget, Dashboard, and
  Reports now exclude those transactions from spending, cash flow, and charts.
  Rule actions apply the exclusion system tags by id.
- ISSUE-009 (Medium): **free-text search ignored category and account names** —
  `queryTransactions` now resolves tag/category/account names → ids and matches
  them; the Transactions page sends the search box through `q.search` (it was
  mis-wired to `q.merchant`, so the UI never ran the new matching — found during
  live verification).
- ISSUE-010 (Low): **saved reports couldn't be renamed** — added a Rename action
  and modal next to duplicate/delete.
- ISSUE-011 (Medium): **currency and date-format settings were persisted but never
  applied** — `formatMoney`/`formatDate` now use app-wide defaults driven by
  `setDefaultCurrency`/`setDefaultDateFormat`, wired through `AppContext`;
  date-displaying pages use `formatDate` instead of raw ISO strings.

### Tests
- New: `src/domain/exclusions.test.ts` (9 tests), exclusion rule-application test,
  category/account-name search repository test. **147 total** (11 files), typecheck
  clean.

### Verified
- **70/70 checks pass** on the local build, no console errors — the harness gained
  three search checks (merchant, category-name, account-name).
- Audit commit `ee5f88c` pushed; live deployment verified at **68/70** — the two
  failures are the new category/account-name search checks, because the
  search-wiring fix (below) landed after the push. It ships with the next push.

## 2026-09-10 — QFX/OFX import wizard automated in the verification harness

### Added
- `scripts/verify-deployed.mjs` Phase 7 — **QFX/OFX import wizard**, end to end:
  uploads a generated OFX 1.x (SGML) statement via `DOM.setFileInputFiles`, asserts the
  parser finds all 3 transactions, selects an account, imports them (351 → 354), then
  re-imports the same statement and confirms **all 3 are skipped by FITID** (0 new
  rows). The imported rows are searchable in Transactions.

### Verified
- **66/66 checks pass** on the local build and against the live deployment, with no
  console errors.

## 2026-09-10 — CSV import + restore wizard automated in the verification harness

### Added
- `scripts/verify-deployed.mjs` Phase 5 — **CSV import wizard**, end to end: uploads a
  real CSV via `DOM.setFileInputFiles`, asserts date/amount auto-mapping, selects an
  account, previews, imports (351 → 355), re-imports the same file to confirm duplicate
  skip (4 flagged, 0 new rows), and confirms the imported rows are searchable.
- `scripts/verify-deployed.mjs` Phase 6 — **restore wizard**: uploads the backup captured
  in Phase 1, validates it, restores in **replace** mode (355 → 351, exactly the backup),
  deletes one record directly, then restores in **merge** mode (350 → 351).

### Verified
- **58/58 checks pass** on the local build (two consecutive runs) and against the live
  deployment, with no console errors.

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