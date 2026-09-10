# ARCHITECTURE.md

Ledgerly is architected as a **local-first single-page application** that can
later grow a server backend without a rewrite. This document explains the
layers, the key abstractions, and the data flow.

---

## 1. Layer Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Presentation (src/pages, src/components)                    │
│   React components — never touch storage directly           │
└──────────────────────────┬──────────────────────────────────┘
                           │ hooks + context (src/store)
┌──────────────────────────▼──────────────────────────────────┐
│ Application / business logic (src/domain)                   │
│   calculations, rules engine, duplicate detection,          │
│   backup format, integrity checks — all pure & testable     │
└──────────────────────────┬──────────────────────────────────┘
                           │ DataRepository interface
┌──────────────────────────▼──────────────────────────────────┐
│ Persistence (src/data)                                      │
│   IndexedDBRepository (Dexie)   ←─ today                    │
│   ServerRepository (PostgreSQL/REST)  ←─ future (REQ-044)   │
└─────────────────────────────────────────────────────────────┘
                           ▲
              src/import (CSV/OFX parsers) feed the
              business layer with normalized transactions
```

**Rules of the architecture:**

1. **UI never imports Dexie.** Every page talks to `DataRepository`.
2. **Business logic is pure.** `domain/calculations.ts` functions take plain
   data and return results; they are unit-tested without any storage.
3. **Money is integer cents everywhere.** Parsing and formatting happen only at
   the edges (input fields, CSV/OFX parsers, display).
4. **Transactions are queried on demand.** Global context holds only reference
   data; pages fetch transaction ranges with pagination.

---

## 2. Data Access Abstraction (`DataRepository`)

Defined in `src/data/repository.ts`. It covers every collection:

- Accounts, category groups, categories, tags
- Transactions (with a rich `TransactionQuery`: date ranges, account, category,
  type, reviewed/pending, transfer-only, free-text search, pagination, sorting)
- Splits, transfers, rules
- Budgets + budget items, goals, recurring items
- Securities, holdings, investment transactions, liabilities
- Dashboard widgets, saved reports, import mappings/sessions, settings
- Bulk: `exportAll()` / `importAll(data, { replace })` / `clear()` /
  `recomputeBalances()` / `stats()`

**Current implementation:** `IndexedDBRepository` (`src/data/indexeddb-repository.ts`)
on Dexie with indexes for the hot query paths:

- `transactions`: `[accountId+date]`, `date`, `accountId`, `categoryId`,
  `transferId`, `externalId`, `splitParentId`
- Splits by `transactionId`; holdings by `accountId`/`securityId`

**Future implementation:** `ServerRepository` talks to a REST API backed by
PostgreSQL. The UI will not change (see `DEPLOYMENT.md` §Server mode).

---

## 3. State Management

`src/store/AppContext.tsx` provides:

- **Reference data** (accounts, groups, categories, tags, rules, recurring,
  goals, securities, holdings, investment transactions, liabilities, budgets +
  items, dashboard, saved reports, import mappings, settings) loaded once and
  kept in React state.
- **`dataVersion`** — `{ ref, txn }` counters bumped after reference-data or
  transaction mutations. Transaction-heavy pages subscribe to `txn` and refetch.
- **Theme handling** (light/dark/system with `matchMedia` listener) and
  persistence via `repo.saveSettings`.
- **First-run seeding** — default category groups/categories and default
  dashboard widgets are created only when the database is empty.

---

## 4. Money & Dates

### Money (`src/lib/money.ts`)

- Stored as **integer cents** (signed).
- `parseMoney` handles `$1,234.56`, `1.234,56 €`, negatives, parentheses,
  thousands separators; `formatMoney` renders via `Intl.NumberFormat`.
- All arithmetic is integer: `add`, `sub`, `scale` (rounded ratio), `sum`.
- Per-unit prices (shares × price) multiply in Number space and round at the
  boundary — never accumulate fractional drift.
- Decision: **DEC-003**.

### Dates (`src/lib/dates.ts`)

- Transaction dates are `YYYY-MM-DD` strings (local); month keys are `YYYY-MM`.
- `parseDate` accepts ISO, `YYYYMMDD`, US `MM/DD/YYYY`, `M/D/YY`, month-name
  formats, Excel serials (UTC), and ISO-with-time.
- Leap-year-safe helpers: `dayInMonth`, `monthEnd`, `addMonths`.

---

## 5. Financial Calculations (`src/domain/calculations.ts`)

All pure functions, all integer math:

| Function | Purpose |
|---|---|
| `netWorthFromAccounts` | assets / liabilities / net worth, honoring exclusions |
| `cashFlow` | income / expenses / net for a set of transactions (transfers excluded by default) |
| `budgetSummary` | budgeted / spent / remaining / percent per category + totals |
| `spendingByCategory` / `spendingByMerchant` | aggregations handling split lines |
| `detectTransferPairs` | same-amount opposite-sign pairs within a date window |
| `detectRecurring` | interval + day-of-month detection from history |
| `nextOccurrence` / `upcomingRecurring` | schedule projections |
| `portfolioSummary` | market value, cost basis, gain/loss, allocation maps |
| `investmentPerformance` | contributions / withdrawals / income |
| `payoffSchedule` | month-by-month amortization |
| `netWorthHistory` / `monthlyCashFlow` | time series |
| `integrityCheck` | dataset diagnostics |

## 6. Rules Engine (`src/domain/rules.ts`)

- Conditions: merchant/description text ops, amount gt/lt (dollars),
  account/category/type/tag equality.
- Actions: set category/merchant, add/remove tag, mark reviewed,
  exclude from budget/reports (via reserved system tags, **DEC-006**).
- Rules are evaluated in priority order on import and on manual transaction
  creation; later rules can override earlier category assignments.

## 7. Duplicate Detection (`src/domain/duplicates.ts`)

Three signals, strongest first:

1. **External ID**: `accountId | FITID` exact match.
2. **Transaction hash**: FNV-1a of `accountId | date | amount | normalized merchant`.
3. **Fuzzy**: same account + amount, date within N days, Jaccard merchant
   similarity > 0.8.

## 8. Import Pipeline

```
File (CSV/TSV/OFX/QFX)
  → parser (src/import/csv.ts | ofx.ts)      → raw rows / OFX transactions
  → normalization (src/import/normalize.ts)   → internal Transaction[]
  → rules application                         → categorized transactions
  → duplicate detection (src/domain/duplicates.ts)
  → save via repository (recomputes balances)
  → import session + column mapping recorded
```

- CSV: delimiter auto-detection (`,`, `\t`, `;`, `|`), quoted fields incl.
  embedded newlines, BOM stripping, header heuristics, column mapping
  remembered per header fingerprint.
- OFX/QFX: SGML parsing of `<STMTTRN>` blocks, OFX date parsing
  (`YYYYMMDDHHMMSS[tz]`), FITID extraction, account/institution info.

## 9. Backup Format

Versioned JSON (`ledgerly-backup` v1, `src/domain/backup.ts`). Contains every
collection; `parseBackup` validates format, version, and required arrays;
`countRecords` summarizes for the restore wizard. Restore supports **replace**
(all cleared first) or **merge** (records added only when their IDs are new).
Balances are recomputed after every restore.

## 10. UI

- `components/ui/*` — design-system primitives (buttons, cards, modals, forms,
  charts) with dark-mode variants.
- `components/layout/AppShell.tsx` — collapsible sidebar (desktop), drawer +
  bottom nav (mobile), theme toggle, storage-mode badge.
- `pages/*` — one route per page. See `src/App.tsx` for the route table.

## 11. Performance Notes

- Dexie indexes cover date/account/category lookups; lists paginate (50/page).
- Reference data is memoized; pages refetch only on version bumps.
- The 100k-transaction target is met by never materializing the full
  transactions table into React state.
- Known trade-off: summary queries (e.g. filtered income/expense totals) scan
  the filtered range in memory — acceptable today, an aggregate index can be
  added later if needed.

## 12. Testing Strategy

- Pure logic tests (calculations, rules, duplicates, backups) run headless.
- Repository tests use `fake-indexeddb` for real IndexedDB semantics.
- Parser tests cover fixtures (sample OFX, tricky CSVs).
- See `src/**/*.test.ts` and the test plan in `REQUIREMENTS.md` (REQ-048).