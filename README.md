# Ledgerly — Personal Finance

A **privacy-first, local-first personal finance manager** built as a modern
single-page application. Ledgerly gives you the major functionality of a
commercial finance platform (Monarch Money is used as a functional reference)
while keeping **all of your financial data in your browser** — no accounts, no
subscriptions, no data transmitted anywhere.

> ⚠️ **Sample data note:** the app offers a clearly-labeled fictional demo
> dataset. It never loads automatically.

---

## Highlights

- **Local-first**: data lives in your browser's IndexedDB. Works fully offline.
- **No tracking, no ads, no analytics**: the app makes zero network requests in
  local mode.
- **Real functionality**: accounts, transactions, budgets, goals, recurring
  bills, net worth, investments, reports, rules, imports, backups — all working,
  not mockups.
- **Decimal-safe accounting**: every monetary value is stored as integer cents.
  No `0.1 + 0.2` bugs.
- **Powerful imports**: CSV/TSV wizard with column mapping (remembered per bank)
  and QFX/OFX parsing with FITID-based duplicate detection.
- **Backup & restore**: one-click versioned JSON backup that captures everything;
  restore with replace or merge.
- **PWA**: installable and offline-capable.
- **Future-proof**: a `DataRepository` abstraction means a PostgreSQL/REST server
  mode can be added later without rewriting the UI (see `DEPLOYMENT.md`).

---

## Tech Stack

| Layer | Choice |
|---|---|
| UI | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 (dark mode via class) |
| Charts | Recharts |
| Storage | IndexedDB via Dexie.js |
| Routing | React Router (hash-based for GitHub Pages) |
| PWA | vite-plugin-pwa (Workbox) |
| Tests | Vitest + fake-indexeddb + jsdom |

---

## Quick Start (local development)

```bash
# 1. Install dependencies
npm install

# 2. Start the dev server
npm run dev
# open http://localhost:5173

# 3. Typecheck + tests + build
npm run typecheck
npm test
npm run build
```

On first run you'll be offered a choice: **Explore sample data** (fictional demo
dataset) or **Start fresh**.

---

## Deploying to GitHub Pages

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the full guide. Short version:

1. Push this repository to GitHub.
2. In the repo settings: **Settings → Pages → Source → GitHub Actions**.
3. Push to `main` (or run the workflow manually) — the included
   `.github/workflows/deploy.yml` runs tests, typecheck, build, and deploys.
4. Your app is live at `https://<user>.github.io/<repo>/`.

> ⚠️ **URLs are lowercase:** GitHub Pages serves project sites with a
> case-sensitive, all-lowercase repo slug, so `https://<user>.github.io/<repo>/`
> only works when `<repo>` is typed in lowercase. For this project the live URL
> is **`https://hokiegrad99.github.io/ledgerly/`** — a capital "L" in `Ledgerly`
> returns 404.

No paid infrastructure required.

---

## Data Storage & Privacy

- **Where is my data?** In your browser's IndexedDB database (`ledgerly`).
- **Is anything sent to a server?** No. There is no backend in local mode.
  Imported files are parsed entirely on-device. The only network requests are
  the app's own static assets (and Google Fonts, which is optional).
- **Uninstalling / clearing browser data** erases your data — use **Backup My
  Data** in *Import & Export* first, and restore it later on any device/browser.

---

## Backup & Restore

- **Backup**: *Import & Export → Backup & restore → Backup my data* downloads
  `ledgerly-backup-v1.json` — a versioned JSON file containing accounts,
  transactions, splits, transfers, categories, tags, rules, budgets, goals,
  recurring items, securities, holdings, investment activity, liabilities,
  dashboard layout, import mappings, and settings. No passwords (there are none
  in local mode).
- **Restore**: choose the file; the app validates it, shows version + record
  counts, warns about overwrites, and offers **replace** or **merge**.
- Backups are forward-migratable: the format is versioned so future app versions
  can upgrade old backups.

---

## CSV Import (quick guide)

1. *Import & Export → CSV/TSV → upload* your bank's CSV/TSV file.
2. Pick the destination **account**.
3. **Map columns**: date, description, amount (or debit/credit), category,
   notes, external ID. Ledgerly auto-guesses the mapping and remembers it for
   that bank's layout.
4. **Preview** normalized transactions; any rows that can't be parsed are listed
   with the reason (e.g. "Could not parse date").
5. **Duplicates** are detected automatically (external ID → exact hash → fuzzy)
   and skipped; you see exactly what will be skipped.
6. Confirm — transactions are saved, and transaction **rules** are applied.

Supported: CSV, TSV, quoted fields, embedded newlines, UTF-8 (with BOM), most
date formats, currency symbols, thousands separators, positive/negative amounts,
and separate debit/credit columns.

## QFX / OFX Import

Upload a `.qfx`/`.ofx` statement. FITIDs are preserved, so re-importing the same
statement never creates duplicates. Account info from the file is used to
pre-select the matching account.

---

## Project Structure

```
src/
├── lib/            # money (integer cents), dates, ids — pure utilities
├── domain/         # types, calculations, rules engine, duplicates, backup
├── data/           # DataRepository interface + IndexedDB impl + sample data
├── import/         # CSV/TSV and OFX/QFX parsers + normalization
├── store/          # AppContext (global reference data + theme + versioning)
├── components/
│   ├── layout/     # AppShell, sidebar, mobile nav
│   ├── transactions/  # transaction form, split editor, transfer linker
│   └── ui/         # buttons, cards, modals, forms, charts
└── pages/          # one file per route (Dashboard … Settings)
```

See [ARCHITECTURE.md](./ARCHITECTURE.md), [DATA_MODEL.md](./DATA_MODEL.md), and
[DEPLOYMENT.md](./DEPLOYMENT.md) for details.

---

## Testing

```bash
npm test            # 119 tests
npm run typecheck
npm run project:status   # health report (requirements, tests, build, issues)
```

Coverage includes: money parsing/formatting, date parsing (incl. leap years),
net worth, budgets, cash flow, transfers, split handling, recurring detection,
investment math, payoff schedules, CSV/OFX parsing, duplicate detection, the
rules engine, backup round-trips, and the IndexedDB repository.

---

## Roadmap / Status

See [BUILD_STATUS.md](./BUILD_STATUS.md) (current state), [REQUIREMENTS.md](./REQUIREMENTS.md)
(50 tracked requirements with statuses), and [NEXT_TASKS.md](./NEXT_TASKS.md) (backlog).

**Planned (not yet built):** server mode (Ubuntu + Docker + PostgreSQL + REST +
auth), household/multi-user support, and financial data provider integrations
(Plaid/MX/Finicity). The architecture is ready for these — nothing is
hard-wired to the browser.

---

## Contributing

1. Read `REQUIREMENTS.md` and `BUILD_STATUS.md` first.
2. Pick the highest-priority task from `NEXT_TASKS.md`.
3. Follow existing conventions: integer-cents money, repository abstraction,
   tests alongside logic (`*.test.ts`).
4. Update `REQUIREMENTS.md` status, `CHANGELOG.md`, and `BUILD_STATUS.md` with
   every significant change.

---

## License

MIT — see `LICENSE`. (Add a LICENSE file before publishing if you intend to
distribute.)