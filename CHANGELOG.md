# CHANGELOG

All notable changes to Ledgerly.

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