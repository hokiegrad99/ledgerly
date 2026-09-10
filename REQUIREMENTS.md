# Ledgerly — Master Requirements

This is the **authoritative requirements document** for the Ledgerly personal
finance application. Every requirement has a unique ID, a priority, acceptance
criteria, and a current status.

## Status Legend

| Status | Meaning |
|---|---|
| `NOT_STARTED` | No implementation work done |
| `IN_PROGRESS` | Implementation underway |
| `IMPLEMENTED` | Code exists and the workflow works, but verification is incomplete |
| `TESTING` | Automated or manual testing is underway |
| `VERIFIED` | Implemented, tested, acceptance criteria checked, no known critical defects |
| `BLOCKED` | Cannot proceed due to a dependency |
| `DEFERRED` | Deliberately postponed |

A requirement may **only** be marked `VERIFIED` when the actual user workflow
works, automated tests exist where appropriate, and acceptance criteria have
been checked.

---

## Core Application

### REQ-001 — Application shell and navigation
- **Priority:** P0
- **Description:** Polished shell with collapsible left sidebar on desktop, responsive navigation (bottom nav + drawer) on mobile. All primary pages reachable.
- **Dependencies:** none
- **Acceptance criteria:** Sidebar collapses; mobile drawer and bottom nav work; all nav destinations render real pages.
- **Status:** VERIFIED

### REQ-002 — Local-first storage (IndexedDB)
- **Priority:** P0
- **Description:** All financial data stored in IndexedDB via Dexie. No localStorage for financial data.
- **Dependencies:** none
- **Acceptance criteria:** Data survives reload; queries use IndexedDB indexes.
- **Status:** VERIFIED

### REQ-003 — DataRepository abstraction
- **Priority:** P0
- **Description:** `DataRepository` interface with `IndexedDBRepository` implementation. UI never touches IndexedDB directly. Future `ServerRepository` can replace it.
- **Dependencies:** REQ-002
- **Acceptance criteria:** All persistence goes through the repository interface.
- **Status:** VERIFIED

### REQ-004 — Privacy-first design
- **Priority:** P0
- **Description:** No ads, analytics, tracking, or external data transmission. Imports are parsed locally. UI clearly states when data is local.
- **Dependencies:** none
- **Acceptance criteria:** No third-party requests in local mode (verify in network tab); privacy messaging present.
- **Status:** VERIFIED

### REQ-005 — Light / dark / system theming
- **Priority:** P1
- **Description:** Complete dark theme, prominent toggle, persisted preference, system-follow option.
- **Dependencies:** REQ-001
- **Acceptance criteria:** Toggle works; preference persists; charts/tables/forms/modals render correctly in both modes.
- **Status:** VERIFIED

### REQ-006 — Responsive layout (375 / 768 / 1024 / 1440)
- **Priority:** P1
- **Description:** Tables become scrollable or card-like on small screens; charts resize; touch-friendly controls; no forced horizontal scroll where avoidable.
- **Dependencies:** REQ-001
- **Acceptance criteria:** Pages usable at 375px, 768px, 1024px, 1440px+.
- **Status:** IMPLEMENTED

### REQ-007 — Accessibility
- **Priority:** P2
- **Description:** Keyboard navigation, ARIA labels, focus states, contrast, screen-reader-friendly forms, no color-only information.
- **Dependencies:** REQ-001
- **Acceptance criteria:** Tab through pages works; form fields have labels; focus rings visible.
- **Status:** IMPLEMENTED

### REQ-008 — Error handling
- **Priority:** P1
- **Description:** User-friendly error messages; never expose raw JavaScript errors.
- **Dependencies:** none
- **Acceptance criteria:** Import failures show helpful messages with recovery options.
- **Status:** VERIFIED

### REQ-009 — Performance targets
- **Priority:** P1
- **Description:** Handle 100 accounts and 100,000+ transactions. Paginated, indexed queries; no full transaction set in React state.
- **Dependencies:** REQ-002, REQ-003
- **Acceptance criteria:** Transaction list paginates (50/page); queries use Dexie indexes; dashboards query ranges.
- **Status:** IMPLEMENTED

---

## Accounts

### REQ-010 — Account management
- **Priority:** P0
- **Description:** Create, edit, delete accounts. Types: checking, savings, cash, credit card, mortgage, auto/student/personal loan, brokerage, retirement, 401(k), IRA, Roth IRA, HSA, crypto, real estate, other asset/liability.
- **Dependencies:** REQ-001, REQ-002
- **Acceptance criteria:** CRUD works; balances update automatically from transactions.
- **Status:** VERIFIED

### REQ-011 — Account fields and toggles
- **Priority:** P1
- **Description:** Name, institution, type, last four, current/starting balance, currency, notes, active status, include/exclude net worth/budget/reports.
- **Dependencies:** REQ-010
- **Acceptance criteria:** All fields editable; exclusion toggles respected by calculations.
- **Status:** VERIFIED

---

## Transactions

### REQ-012 — Transaction management
- **Priority:** P0
- **Description:** Create, edit, duplicate, delete transactions. Fields: date, merchant, amount, account, category, tags, notes, type, cleared/pending/reviewed, transfer/recurring relationships, original vs edited description.
- **Dependencies:** REQ-001, REQ-002, REQ-010
- **Acceptance criteria:** Full CRUD; edits preserve original description.
- **Status:** VERIFIED

### REQ-013 — Transaction search and filtering
- **Priority:** P0
- **Description:** Search merchant/notes/tags; filter by date range, account, category, type, reviewed, pending, transfers, tags.
- **Dependencies:** REQ-012
- **Acceptance criteria:** Filters combine; pagination works with filters.
- **Status:** VERIFIED

### REQ-014 — Bulk operations
- **Priority:** P1
- **Description:** Bulk categorize, tag, mark reviewed, delete.
- **Dependencies:** REQ-012
- **Acceptance criteria:** Selecting rows enables bulk bar; operations apply to all selected.
- **Status:** VERIFIED

### REQ-015 — Split transactions
- **Priority:** P1
- **Description:** Split one transaction into multiple category lines with notes and tags; parent not double-counted in reports.
- **Dependencies:** REQ-012
- **Acceptance criteria:** Split editor validates totals; reports aggregate split lines.
- **Status:** VERIFIED

### REQ-016 — Transfers
- **Priority:** P1
- **Description:** Link two transactions as a transfer (no income/expense), auto-detect possible pairs, create counterpart transactions, unlink.
- **Dependencies:** REQ-012, REQ-010
- **Acceptance criteria:** Linked transfers excluded from income/expense; detection suggests pairs.
- **Status:** VERIFIED

---

## Categories & Tags

### REQ-017 — Hierarchical categories
- **Priority:** P0
- **Description:** Category groups → categories with sensible defaults seeded on first run (not hard-coded into logic). Create, rename, delete, reorder, move between groups, archive.
- **Dependencies:** REQ-002
- **Acceptance criteria:** All group/category operations work; defaults seeded once.
- **Status:** VERIFIED

### REQ-018 — Tags
- **Priority:** P1
- **Description:** Create, rename, delete tags; multiple tags per transaction; independent from categories; filter reports by tag.
- **Dependencies:** REQ-012, REQ-002
- **Acceptance criteria:** Tag CRUD works; tag filters apply in reports and transactions.
- **Status:** VERIFIED

---

## Rules

### REQ-019 — Transaction rules engine
- **Priority:** P1
- **Description:** IF conditions (merchant/description contains/not/equals/starts/ends, amount gt/lt, account/category/type/tag equals) THEN actions (set category/merchant, add/remove tag, mark reviewed, exclude from budget/reports). Priority ordering.
- **Dependencies:** REQ-012, REQ-017, REQ-018
- **Acceptance criteria:** Rules applied on import and manual add; priorities honored; tests cover matching.
- **Status:** VERIFIED

---

## Imports

### REQ-020 — CSV/TSV import wizard
- **Priority:** P0
- **Description:** Select account, upload, delimiter detection, header detection, preview, column mapping (date, description, amount, debit/credit, category, account, notes, type, external id), normalized preview, duplicate detection, confirm. Remember mappings by header fingerprint.
- **Dependencies:** REQ-002, REQ-010, REQ-017
- **Acceptance criteria:** End-to-end import works; quoted fields; currency symbols; thousands separators; UTF-8; BOM.
- **Status:** VERIFIED

### REQ-021 — QFX/OFX import
- **Priority:** P0
- **Description:** Parse OFX/QFX statements: FITID, date, amount, name, memo, type, account info, institution. Normalize into transactions; preserve FITID for dedupe.
- **Dependencies:** REQ-002, REQ-010
- **Acceptance criteria:** Sample OFX and QFX files import correctly.
- **Status:** VERIFIED

### REQ-022 — Duplicate detection
- **Priority:** P0
- **Description:** Detect duplicates via external ID (FITID), transaction hash (account+date+amount+merchant), and fuzzy match (same account/amount, close date, similar merchant). Show before import; skip duplicates automatically.
- **Dependencies:** REQ-020, REQ-021
- **Acceptance criteria:** Re-importing the same statement skips all duplicates.
- **Status:** VERIFIED

### REQ-023 — Import session and mapping memory
- **Priority:** P2
- **Description:** Record import sessions; remember column mappings per header fingerprint.
- **Dependencies:** REQ-020
- **Acceptance criteria:** Second import of the same bank layout pre-fills the mapping.
- **Status:** IMPLEMENTED

---

## Budgeting

### REQ-024 — Category budget
- **Priority:** P0
- **Description:** Assign monthly amounts per category; show budgeted/actual/remaining/percent used with progress bars.
- **Dependencies:** REQ-017, REQ-012
- **Acceptance criteria:** Editing a category amount persists; actual spending per category is correct (transfers excluded).
- **Status:** VERIFIED

### REQ-025 — Flex budget
- **Priority:** P1
- **Description:** Single flexible spending total instead of per-category amounts; switchable mode.
- **Dependencies:** REQ-024
- **Acceptance criteria:** Mode switch works; flex totals computed correctly.
- **Status:** IMPLEMENTED

### REQ-026 — Budget months, copy, rollover
- **Priority:** P2
- **Description:** Navigate months, copy budget to next month, rollover flag per category.
- **Dependencies:** REQ-024
- **Acceptance criteria:** Month navigation works; copy-to-next-month works; unused budget with
  rollover enabled carries into the next month (surplus adds, deficit subtracts); per-category
  rollover toggle persists.
- **Status:** VERIFIED

---

## Goals

### REQ-027 — Goals
- **Priority:** P1
- **Description:** Goal types (savings, emergency fund, vacation, home purchase, major purchase, debt payoff, investment, retirement, custom); name, target/current amount, target date, monthly contribution, linked accounts, progress %, forecast completion, add/withdraw, delete.
- **Dependencies:** REQ-002, REQ-010
- **Acceptance criteria:** Goal CRUD works; progress and forecast math verified.
- **Status:** VERIFIED

---

## Recurring Transactions

### REQ-028 — Recurring transactions
- **Priority:** P1
- **Description:** Manual recurring items with weekly/biweekly/monthly/quarterly/semiannual/annual intervals; next/previous occurrence computation; list and calendar views; auto-detection from history.
- **Dependencies:** REQ-002, REQ-012
- **Acceptance criteria:** Manual + detected items display; upcoming projections correct; detection finds monthly/biweekly patterns.
- **Status:** VERIFIED

---

## Net Worth

### REQ-029 — Net worth
- **Priority:** P1
- **Description:** Assets − liabilities; current and historical series; range selector (1M–All); account exclusions respected.
- **Dependencies:** REQ-010, REQ-012
- **Acceptance criteria:** Current net worth correct; history series matches transactions; exclusions honored.
- **Status:** VERIFIED

---

## Investments

### REQ-030 — Investment accounts, securities, holdings
- **Priority:** P1
- **Description:** Securities (symbol/name/type/asset class), manual holdings (shares, price, cost basis), portfolio value, gain/loss, allocation by type/class/account.
- **Dependencies:** REQ-002, REQ-010
- **Acceptance criteria:** Holdings CRUD works; portfolio math verified by tests.
- **Status:** VERIFIED

### REQ-031 — Investment activity
- **Priority:** P2
- **Description:** Record buy/sell/dividend/interest/transfer/split/reinvest; contributions, income totals.
- **Dependencies:** REQ-030
- **Acceptance criteria:** Activity log records and summarizes.
- **Status:** IMPLEMENTED

---

## Liabilities / Debt

### REQ-032 — Debt payoff planning
- **Priority:** P2
- **Description:** Liabilities with interest rate, minimum payment, payment day, original balance, strategy (snowball/avalanche/custom); payoff schedule, payoff date, total interest.
- **Dependencies:** REQ-010
- **Acceptance criteria:** Amortization math verified by tests; payoff projections displayed.
- **Status:** VERIFIED

---

## Reports

### REQ-033 — Reports
- **Priority:** P1
- **Description:** Spending by category/merchant/account/time, income by source/time, cash flow, net worth over time, category trends, money flow (income → categories). Filters: date range, account, group, category, merchant, tag, type.
- **Dependencies:** REQ-012, REQ-017, REQ-018
- **Acceptance criteria:** Each report renders real data; filters apply; transfers excluded.
- **Status:** VERIFIED

### REQ-034 — Saved reports and CSV export
- **Priority:** P2
- **Description:** Save, rename, duplicate, delete report definitions; export report data to CSV.
- **Dependencies:** REQ-033
- **Acceptance criteria:** Saved reports restore kind + filters; CSV downloads contain the visible data.
- **Status:** IMPLEMENTED

---

## Search

### REQ-035 — Global transaction search
- **Priority:** P1
- **Description:** Fast search across merchant, description, notes, category, tags, account.
- **Dependencies:** REQ-012, REQ-013
- **Acceptance criteria:** Search returns matches quickly on large datasets.
- **Status:** IMPLEMENTED (searches merchant/description/notes; tag search via tag filter)

---

## Backup / Restore

### REQ-036 — One-click backup
- **Priority:** P0
- **Description:** Download a versioned JSON backup (`ledgerly-backup-v1.json`) containing every collection. No passwords/secrets.
- **Dependencies:** REQ-002, REQ-003
- **Acceptance criteria:** Backup file validates; contains all data; downloads correctly.
- **Status:** VERIFIED

### REQ-037 — Restore wizard
- **Priority:** P0
- **Description:** Select file, validate, show version and record counts, warn about overwrite, replace or merge, confirm, restore, recompute derived values.
- **Dependencies:** REQ-036
- **Acceptance criteria:** Restore round-trips data; merge avoids duplicates; balances recomputed.
- **Status:** VERIFIED

### REQ-038 — Data integrity diagnostics
- **Priority:** P1
- **Description:** Detect duplicate IDs, invalid account/category/goal references, broken transfers, negative asset balances, investment inconsistencies, missing fields.
- **Dependencies:** REQ-002
- **Acceptance criteria:** Integrity check flags known-bad data; tests cover detection.
- **Status:** VERIFIED

---

## Settings

### REQ-039 — Settings
- **Priority:** P1
- **Description:** Appearance (theme, currency, date format, week start), profile, category/tag/rule management, data management (integrity check, sample data, reset, recompute balances).
- **Dependencies:** REQ-005, REQ-017, REQ-018, REQ-019
- **Acceptance criteria:** All settings persist.
- **Status:** VERIFIED

---

## Sample Data

### REQ-040 — Sample/demo dataset
- **Priority:** P2
- **Description:** Fictional but realistic checking/savings/credit card/mortgage/brokerage/retirement, ~300 transactions, categories, budgets, goals, recurring bills, holdings. Clearly labeled.
- **Dependencies:** REQ-002, REQ-017
- **Acceptance criteria:** Loading sample data populates the app; labeled as sample.
- **Status:** VERIFIED

---

## PWA & Deployment

### REQ-041 — PWA support
- **Priority:** P2
- **Description:** Installable, offline-capable, service worker caching, works from GitHub Pages.
- **Dependencies:** none
- **Acceptance criteria:** `vite build` generates service worker + manifest; app installable.
- **Status:** IMPLEMENTED (SW generated; offline behavior to be verified in browser)

### REQ-042 — GitHub Pages deployment
- **Priority:** P1
- **Description:** GitHub Actions workflow (tests + typecheck + build + deploy), SPA routing compatible with Pages (hash router), docs.
- **Dependencies:** none
- **Acceptance criteria:** Workflow file present; build uses relative base; hash routing.
- **Status:** IMPLEMENTED

### REQ-043 — Future Ubuntu/Docker/PostgreSQL deployment
- **Priority:** P3
- **Description:** Architecture documented for a later server mode: Ubuntu, Docker, PostgreSQL, Nginx, HTTPS, REST API, auth. No code dependency on the backend.
- **Dependencies:** REQ-003
- **Acceptance criteria:** DEPLOYMENT.md documents the target architecture; repository abstraction ready.
- **Status:** NOT_STARTED (abstraction in place, server implementation deferred)

---

## Server Mode (deferred by design)

### REQ-044 — ServerRepository (PostgreSQL/REST)
- **Priority:** P3
- **Description:** Implement `DataRepository` backed by a REST API + PostgreSQL.
- **Dependencies:** REQ-003
- **Acceptance criteria:** Server mode supports sync across devices.
- **Status:** NOT_STARTED

### REQ-045 — Authentication (email/password, sessions, reset, MFA-ready)
- **Priority:** P3
- **Description:** Server mode auth with hashed passwords, sessions, logout, password reset, optional MFA.
- **Dependencies:** REQ-044
- **Acceptance criteria:** Passwords never stored in plaintext.
- **Status:** NOT_STARTED

### REQ-046 — Household / multi-user support
- **Priority:** P3
- **Description:** Data model compatible with owner/member households and permissions.
- **Dependencies:** REQ-044
- **Acceptance criteria:** Schema allows per-user household membership.
- **Status:** NOT_STARTED

### REQ-047 — Financial data provider abstraction (Plaid/MX/Finicity)
- **Priority:** P3
- **Description:** `FinancialDataProvider` abstraction for future bank connections. Not required for core use.
- **Dependencies:** none
- **Acceptance criteria:** Interface documented; no provider required to run.
- **Status:** NOT_STARTED

---

## Testing & Documentation

### REQ-048 — Automated tests
- **Priority:** P0
- **Description:** Tests for money, dates, calculations (net worth, budget, cash flow, transfers, recurring, investments, payoff), CSV/OFX import, duplicate detection, rules, backup/restore, repository. Include edge cases: negative amounts, refunds, transfers, splits, duplicate imports, leap years, date formats.
- **Dependencies:** all core modules
- **Acceptance criteria:** `npm test` passes (119 tests).
- **Status:** VERIFIED

### REQ-049 — Documentation
- **Priority:** P1
- **Description:** README.md, ARCHITECTURE.md, DATA_MODEL.md, DEPLOYMENT.md covering architecture, stack, dev setup, GitHub Pages deploy, backup/restore, imports, future server deployment.
- **Dependencies:** none
- **Acceptance criteria:** Docs exist and match the implementation.
- **Status:** IMPLEMENTED

### REQ-050 — Project tracking documents
- **Priority:** P0
- **Description:** REQUIREMENTS.md, BUILD_STATUS.md, DECISIONS.md, KNOWN_ISSUES.md, CHANGELOG.md, NEXT_TASKS.md maintained; `npm run project:status` reports health.
- **Dependencies:** none
- **Acceptance criteria:** Files exist; status script runs.
- **Status:** IMPLEMENTED