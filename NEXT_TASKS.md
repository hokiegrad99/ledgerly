# NEXT_TASKS.md — Development Backlog

Prioritized backlog. This list always represents the most useful next work.

> ✅ **Done 2026-09-10:** GitHub Pages deployment live and verified (REQ-041/REQ-042
> VERIFIED, ISSUE-002 closed) via `scripts/verify-deployed.mjs` — onboarding, sample
> data, all 12 routes, search, backup download, PWA offline reload/navigation: 28/28
> checks pass, no console errors.
> ✅ **Done 2026-09-10:** Responsive pass (REQ-006 VERIFIED; Reports 375px overflow
> fixed) and tag-name search (REQ-035 VERIFIED, ISSUE-003 fixed).
> ✅ **Done 2026-09-10:** Reports category filter grouped by category group (ISSUE-004)
> and short-lived undo for transaction deletes (ISSUE-005).
> ✅ **Done 2026-09-10:** All of the above pushed (`c061f3b`) and verified live — 39/39
> checks, no console errors; undo confirmed end-to-end (351 → 301 → 351).
> ✅ **Done 2026-09-10:** `scripts/verify-deployed.mjs` now automates the **CSV import
> wizard** (real file via `DOM.setFileInputFiles`, auto-mapping, account, preview,
> import, re-import duplicate skip, searchable result), the **restore wizard**
> (validate, replace restores the backup exactly, merge re-adds a removed record), and
> the **QFX/OFX import wizard** (generated OFX statement, FITID-based re-import dedupe,
> searchable result) — 66/66 checks on the local build and against the live deployment.
> ✅ **Done 2026-09-10:** Requirements audit — six inert/incomplete features fixed
> (ISSUE-006..011): account delete now reachable, pending filter control added,
> includeInBudget/includeInReports toggles + rule exclude actions actually consumed,
> search matches category/account names, saved-report rename, currency/dateFormat
> settings applied. 147 tests; 70/70 local harness checks (live 68/70 pending the
> search-wiring push).
> ✅ **Done 2026-09-10:** Search-wiring fix pushed (`bbc205b`) — live deployment
> re-verified at **70/70** (category/account-name search now works in the UI).
> ✅ **Done 2026-09-10:** Rule application on import automated (Phase 8) — creates a
> rule in Settings, imports a matching OFX statement, asserts the rule-applied
> category appears on the imported row. **77/77** local harness checks.
> ✅ **Done 2026-09-10:** Split + transfer editing automated (Phase 9) — splits a
> real transaction into two category lines (badge + persisted splits) and links/
> unlinks a transfer pair via "Create & link" (counterpart txn + pair record,
> both sides marked transfer). **90/90** local harness checks — the **full §48
> interactive acceptance checklist is now automated**.

## High

1. **Push the pending commits** — `bbc205b` (search fix, verified live at 70/70),
   `2a0a7d1` (Phase 8), and the Phase 9 harness work (90/90 local) ship with the
   next push; live then re-verifies at 90/90.

## Medium

3. **REQ-023** — Surface import session history in the UI (data currently recorded, not displayed).
4. **REQ-031** — Auto-derive holdings from investment transactions (buy/sell/reinvest update shares + cost basis).

## Low

5. **REQ-044** — Add a `ServerRepository` design doc and an optional stub implementation behind a build flag (no backend required to run).
6. **REQ-047** — Document the `FinancialDataProvider` abstraction interface in ARCHITECTURE.md.
7. Dashboard: widget resize support (currently reorder/remove/add only).
8. Category transaction counts in the Settings categories UI (currently a stub).