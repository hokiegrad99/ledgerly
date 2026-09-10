# DEPLOYMENT.md

Ledgerly runs in **two modes**:

- **Mode A — Local/static (GitHub Pages)**: fully functional today. Data stays
  in the browser (IndexedDB). No backend required.
- **Mode B — Server (Ubuntu + Docker + PostgreSQL)**: documented target
  architecture. The `DataRepository` abstraction is in place; the server
  implementation is planned, not yet built.

---

## Mode A — GitHub Pages (free, no backend)

### 1. Create the repository

```bash
# Create a new repo on GitHub (empty, no README), then:
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

### 2. Enable GitHub Pages with Actions

1. GitHub → repository → **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab).

The included workflow (`.github/workflows/deploy.yml`) does:

1. `npm ci`
2. `npm test` (119 tests)
3. `npm run typecheck`
4. `npm run build`
5. `actions/upload-pages-artifact` → `actions/deploy-pages`

Your app is live at **`https://<user>.github.io/<repo>/`** within a minute or two.

> ⚠️ **The URL is all-lowercase.** GitHub Pages project URLs are case-sensitive
> and use the repo slug in lowercase: `https://hokiegrad99.github.io/ledgerly/`
> works, `https://hokiegrad99.github.io/Ledgerly/` returns **404** (GitHub
> redirects to lowercase in the repo UI, but not on Pages). If a link 404s,
> check the casing of the repo part first.

### 3. Updating

Push changes to `main` — the workflow rebuilds and redeploys automatically.

### How SPA routing works on Pages

- Vite `base: './'` → all asset URLs are relative.
- The app uses **hash routing** (`#/transactions`), which needs no server-side
  rewrites on GitHub Pages.
- The PWA service worker precaches the built assets for offline use.

---

## Mode B — Ubuntu Server (target architecture, not yet built)

The goal is a straightforward migration: same UI, new persistence. Because all
data access goes through `DataRepository`, a `ServerRepository` implementation
can replace `IndexedDBRepository` without touching pages or business logic.

### Target stack

```
Internet → Nginx (HTTPS, reverse proxy)
                ├── static SPA (or served by the API)
                └── API (REST) ──→ PostgreSQL
                        └── auth (sessions, hashed passwords, optional MFA)
```

### Components (future work)

| Piece | Notes |
|---|---|
| Docker Compose | `api`, `db` (postgres), `nginx`, optional `certbot` |
| PostgreSQL | schema mirrors `src/domain/types.ts`; `jsonb` where flexible (filters, dashboard config) |
| REST API | Node (same codebase) or another language; endpoints mirror `DataRepository` methods |
| Auth | email/password, bcrypt/argon2 hashing, session cookies, logout, password reset, optional TOTP MFA |
| Sync | server is source of truth; client caches in IndexedDB for offline |
| Migration | `exportAll()` produces the same backup format the server can ingest |

### Suggested migration path

1. Add `ServerRepository` behind an environment flag (`VITE_BACKEND_URL`).
2. Port the Dexie schema to PostgreSQL migrations.
3. Implement auth + session management.
4. Nginx config with HTTPS (Let's Encrypt).
5. Sync strategy: full snapshot on login, incremental since `updatedAt`.

Nothing in the current code assumes a backend is absent — the abstraction was
built for exactly this transition.

---

## PWA notes

- Manifest + icons live in `public/` (`manifest` configured in `vite.config.ts`).
- `npm run build` emits `dist/sw.js` (Workbox) with precaching of built assets.
- First deploy should be followed by a manual offline check:
  install the app, go offline, reload — the dashboard and stored data should
  still work.

---

## Environment variables

None are required for Mode A. Planned for Mode B:

| Variable | Purpose |
|---|---|
| `VITE_BACKEND_URL` | API base URL when using ServerRepository |
| `DATABASE_URL` | PostgreSQL connection string (server side) |
| `SESSION_SECRET` | session signing key (server side) |

---

## Troubleshooting

- **Blank page after deploy**: check that `base` is `'./'` in `vite.config.ts`
  and that Pages uses the `dist` artifact from the workflow (not a branch).
- **Service worker caching stale app**: `registerType: 'autoUpdate'` is set; a
  full reload after deploy picks up the new build.
- **IndexedDB data "lost"**: browser storage can be evicted (private mode,
  clearing site data). Always keep a `ledgerly-backup-v1.json` export.