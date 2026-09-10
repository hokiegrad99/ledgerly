# NEXT_TASKS.md — Development Backlog

Prioritized backlog. This list always represents the most useful next work.

> ✅ **Done 2026-09-10:** GitHub Pages deployment live and verified (REQ-041/REQ-042
> VERIFIED, ISSUE-002 closed) via `scripts/verify-deployed.mjs` — onboarding, sample
> data, all 12 routes, search, backup download, PWA offline reload/navigation: 28/28
> checks pass, no console errors.
> ✅ **Done 2026-09-10:** Responsive pass (REQ-006 VERIFIED; Reports 375px overflow
> fixed) and tag-name search (REQ-035 VERIFIED, ISSUE-003 fixed). Fixes pending a
> push/redeploy.
> ✅ **Done 2026-09-10:** Reports category filter grouped by category group (ISSUE-004)
> and short-lived undo for transaction deletes (ISSUE-005). Pending a push/redeploy.

## High

1. **§48 acceptance remainder** — Finish the interactive flows against the deployed app that the automated pass can't cover: CSV/QFX import wizard with a real file, duplicate skip on re-import, rule application on import, split/transfer editing, restore wizard (replace + merge). Extend `scripts/verify-deployed.mjs` where automatable (e.g. `DOM.setFileInputFiles` for imports).
2. **Push + redeploy** — Ship the REQ-035 (tag search) and REQ-006 (Reports flex-wrap) fixes so the live deployment matches the local build.

## Medium

3. **REQ-023** — Surface import session history in the UI (data currently recorded, not displayed).
4. **REQ-031** — Auto-derive holdings from investment transactions (buy/sell/reinvest update shares + cost basis).

## Low

6. **REQ-044** — Add a `ServerRepository` design doc and an optional stub implementation behind a build flag (no backend required to run).
7. **REQ-047** — Document the `FinancialDataProvider` abstraction interface in ARCHITECTURE.md.
8. Dashboard: widget resize support (currently reorder/remove/add only).
9. Category transaction counts in the Settings categories UI (currently a stub).