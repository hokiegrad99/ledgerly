# BUILD_STATUS.md — Current Project State

> **This is the most important file for recovering project context after a
> disconnected or restarted session.** Read this first, then REQUIREMENTS.md,
> NEXT_TASKS.md, DECISIONS.md, and KNOWN_ISSUES.md.

## Overall Progress

Completion: **64%** (32 of 50 requirements verified; DEFERRED/NOT_STARTED server-mode items excluded from completion).

### Requirements by status

| Status | Count |
|---|---|
| NOT_STARTED | 5 |
| IN_PROGRESS | 0 |
| IMPLEMENTED | 13 |
| TESTING | 0 |
| VERIFIED | 32 |
| BLOCKED | 0 |
| DEFERRED | 0 |
| **Total** | **50** |

Completion Percentage = VERIFIED / total active requirements × 100 = 32/50 = 64%.
*(Run `npm run project:status` to regenerate live numbers.)*

## Current Development Phase

**Phase 6 — Backup/restore, PWA, GitHub Pages deployment** (spec phases 1–6 are
substantially complete; Phase 7 — server mode — is deferred by design).

**Current Task:** VERIFY the deployed app end-to-end in a browser (manual
acceptance pass per section 48 of the specification) and close the
PWA/offline verification gap.

## Last Completed Work

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

**Requirements verified:** REQ-001..005, 008, 010..022, 024, 027..030, 032, 033, 036..040, 048

## Current Work

**PWA offline verification (REQ-041)** — Status: IMPLEMENTED, not yet VERIFIED.
- Completed: manifest, icons, service worker generation via `vite-plugin-pwa`, `registerSW`.
- Remaining: manual browser verification that the app loads offline and is installable
  from a GitHub Pages deployment.

## Next Tasks

1. Deploy to GitHub Pages and run the section-48 acceptance checklist in a real browser.
2. Verify PWA install/offline (REQ-041) and mark VERIFIED.
3. Verify responsive layouts at 375/768/1024/1440 (REQ-006) and mark VERIFIED.
4. Implement REQ-026 rollover carry-forward computation (currently flag-only).
5. Add a server-mode design doc + optional `ServerRepository` stub (REQ-044).
6. Update documentation as the above land.

## SESSION HANDOFF

**Last session:** 2026-09-10 (initial build)

**What was accomplished:**
- Complete local-first personal finance app: accounts, transactions (search/filter/
  bulk/split/transfers/duplicate), categories/tags, rules, CSV + QFX/OFX imports with
  duplicate detection, budgets (category + flex), goals, recurring (auto-detect + calendar),
  net worth, investments, liabilities/payoff planning, reports (9 report kinds + saved reports
  + CSV export), backup/restore, settings, sample data, PWA, GitHub Pages workflow.
- All financial math uses integer cents (no float accounting).
- 119 vitest tests across money, dates, calculations, CSV/OFX import, duplicates, rules,
  backup round-trip, and the IndexedDB repository.

**What remains unfinished:**
- PWA offline behavior verified only at build level, not in a live browser.
- Manual acceptance pass (spec §48) not yet executed against a deployed instance.
- REQ-026 rollover carry-forward: flag stored, carry-forward math not implemented.
- Server mode (Phase 7): intentionally NOT_STARTED; abstraction is in place.

**Current implementation state:**
- `npm run typecheck` — PASS
- `npm test` — PASS (119 tests)
- `npm run build` — PASS (dist/ with PWA service worker)
- `npm run project:status` — reports requirements/tests/build/known-issues.

**Known problems:** see KNOWN_ISSUES.md (5 open, none critical).

**Next recommended task:** Deploy to GitHub Pages and execute the acceptance checklist;
verify PWA offline; mark REQ-041/REQ-006 VERIFIED.

**Files changed:** everything under `src/`, `scripts/`, `.github/`, root docs (see CHANGELOG.md).

**Tests run:** `npm test` (119 passing), `npm run typecheck`, `npm run build`.

**Tests passing:** 119/119. **Tests failing:** 0.

**Important decisions:** see DECISIONS.md (DEC-001..DEC-009).