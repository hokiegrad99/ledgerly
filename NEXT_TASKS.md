# NEXT_TASKS.md — Development Backlog

Prioritized backlog. This list always represents the most useful next work.

## High

1. **REQ-041** — Verify PWA install + offline behavior on a real GitHub Pages deployment (deploy, install, go offline, reload). Mark VERIFIED when it works.
2. **REQ-006** — Run the responsive checklist at 375 / 768 / 1024 / 1440px across all pages; fix issues; mark VERIFIED.
3. **§48 acceptance pass** — Execute the end-to-end acceptance checklist from the specification against the deployed app (import → dedupe → categorize → rules → split → transfers → budget → goals → recurring → net worth → investments → reports → search → export → backup → restore).
4. **ISSUE-002** — Close the PWA offline verification gap.

## Medium

5. **REQ-026** — Implement budget rollover carry-forward (ISSUE-001) with tests.
6. **REQ-035** — Add tag-name search to the transaction search path (ISSUE-003).
7. **REQ-023** — Surface import session history in the UI (data currently recorded, not displayed).
8. **REQ-031** — Auto-derive holdings from investment transactions (buy/sell/reinvest update shares + cost basis).

## Low

9. **REQ-044** — Add a `ServerRepository` design doc and an optional stub implementation behind a build flag (no backend required to run).
10. **REQ-047** — Document the `FinancialDataProvider` abstraction interface in ARCHITECTURE.md.
11. **ISSUE-004** — Group the Reports category filter.
12. **ISSUE-005** — Add an undo buffer for transaction deletes.
13. Dashboard: widget resize support (currently reorder/remove/add only).
14. Category transaction counts in the Settings categories UI (currently a stub).