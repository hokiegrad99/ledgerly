#!/usr/bin/env node
/**
 * verify-deployed.mjs — drives headless Chrome (via the Chrome DevTools
 * Protocol, using only Node built-ins) against the deployed GitHub Pages app.
 *
 * Verifies, in order:
 *   1. Acceptance: onboarding → sample data → IndexedDB seeding → every route
 *      renders → transaction search → backup download (real file validated).
 *   2. PWA: manifest served + valid, service worker registers and controls the
 *      page, precached assets load, and the app reloads + works OFFLINE.
 *
 * Usage:
 *   node scripts/verify-deployed.mjs [url]
 *   CHROME_BIN=/path/to/chrome node scripts/verify-deployed.mjs
 *
 * Exit code 0 = all checks passed, 1 = one or more failed.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.argv[2] ?? 'https://hokiegrad99.github.io/ledgerly/';
const CHROME = process.env.CHROME_BIN ?? 'google-chrome-stable';
const PORT = 9333;
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Minimal CDP client over WebSocket (Node 24 global WebSocket)
// ---------------------------------------------------------------------------
class CDP {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.pending = new Map();
    this.handlers = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = () => reject(new Error('WebSocket connect failed'));
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.data ?? ''})`));
        else p.resolve(msg.result);
      } else {
        for (const h of this.handlers) h(msg.method, msg.params);
      }
    };
  }

  on(method, fn) {
    this.handlers.push((m, p) => {
      if (m === method) fn(p);
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const desc = r.exceptionDetails.exception?.description ?? r.exceptionDetails.text;
      throw new Error(`eval exception: ${desc}`);
    }
    return r.result.value;
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }
}

async function waitFor(cdp, expression, { timeout = 20000, interval = 300 } = {}) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeout) {
    try {
      const v = await cdp.eval(expression);
      if (v) return v;
    } catch (e) {
      lastErr = e;
    }
    await SLEEP(interval);
  }
  throw new Error(`Timed out after ${timeout}ms waiting for: ${expression}${lastErr ? ` (last error: ${lastErr.message})` : ''}`);
}

/** Count transactions currently stored in the app's IndexedDB. */
const DB_TXN_COUNT = `(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('ledgerly');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return new Promise((res, rej) => {
    const c = db.transaction('transactions').objectStore('transactions').count();
    c.onsuccess = () => res(c.result);
    c.onerror = () => rej(c.error);
  });
})()`;

/** Attach a real file to a file input via CDP (fires React's change handler). */
async function setFileInput(cdp, selector, filePath) {
  const { root } = await cdp.send('DOM.getDocument', { depth: 1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  if (!nodeId) throw new Error(`file input not found: ${selector}`);
  await cdp.send('DOM.setFileInputFiles', { files: [filePath], nodeId });
}

/** Click the first button matching the given predicate (evaluated in the page). */
async function clickButton(cdp, predicate) {
  return cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => ${predicate});
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
}

async function waitForEndpoint() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await SLEEP(250);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------
const results = [];
const consoleErrors = [];

function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function gotoRoute(cdp, hash, expectedH1) {
  await cdp.eval(`location.hash = ${JSON.stringify(hash)}`);
  await waitFor(cdp, `document.querySelector('h1')?.textContent.includes(${JSON.stringify(expectedH1)})`, { timeout: 10000 });
  return cdp.eval(`document.querySelector('h1')?.textContent`);
}

async function main() {
  console.log(`\nLedgerly deployed-app verification\nTarget: ${BASE_URL}\n`);

  const profileDir = mkdtempSync(join(tmpdir(), 'ledgerly-verify-'));
  const dlDir = mkdtempSync(join(tmpdir(), 'ledgerly-downloads-'));
  const fixtureDir = mkdtempSync(join(tmpdir(), 'ledgerly-fixtures-'));
  let chrome;

  try {
    chrome = spawn(CHROME, [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profileDir}`,
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-dev-shm-usage',
      '--window-size=1440,900',
      'about:blank',
    ], { stdio: 'ignore' });
    chrome.on('error', (e) => { throw new Error(`Failed to launch Chrome: ${e.message}`); });

    await waitForEndpoint();
    const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
    const page = new CDP(target.webSocketDebuggerUrl);
    await page.connect();

    // Browser-level connection for download control.
    const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    const browser = new CDP(version.webSocketDebuggerUrl);
    await browser.connect();
    await browser.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dlDir, eventsEnabled: true });

    // Enable domains + collect console errors.
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    await page.send('Network.enable');
    await page.send('Log.enable');
    await page.send('DOM.enable');
    page.on('Runtime.exceptionThrown', (p) => {
      const d = p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? 'unknown';
      consoleErrors.push(`exception: ${d}`);
    });
    page.on('Runtime.consoleAPICalled', (p) => {
      if (p.type === 'error') {
        const args = (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
        consoleErrors.push(`console.error: ${args}`);
      }
    });
    page.on('Log.entryAdded', (p) => {
      if (p.entry?.level === 'error') consoleErrors.push(`log: ${p.entry.text}`);
    });

    const loadPage = async (url) => {
      await page.send('Page.navigate', { url });
      await waitFor(page, `document.readyState === 'complete'`, { timeout: 20000 });
      await waitFor(page, `document.querySelector('#root')?.childElementCount > 0`, { timeout: 15000 });
    };

    // Captured in Phase 1 and reused by the restore-wizard phase.
    let backupFilePath = null;
    let backupTxnCount = null;

    // ========================================================================
    // PHASE 1 — Acceptance
    // ========================================================================
    console.log('── Phase 1: Acceptance ────────────────────────────────────────');

    await loadPage(BASE_URL);

    const title = await page.eval(`document.title`);
    check('Page loads, title correct', title === 'Ledgerly — Personal Finance', title);

    // Onboarding renders after the first paint — wait for it rather than racing it.
    await waitFor(page, `document.body.innerText.includes('Welcome to Ledgerly')`, { timeout: 15000 });

    const onboarding = await page.eval(`({
      welcome: document.body.innerText.includes('Welcome to Ledgerly'),
      sampleBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Explore sample data')),
      freshBtn: [...document.querySelectorAll('button')].some((b) => b.textContent.includes('Start fresh')),
    })`);
    check('First run shows onboarding (privacy copy + choice)', onboarding.welcome && onboarding.sampleBtn && onboarding.freshBtn,
      onboarding.welcome && onboarding.sampleBtn && onboarding.freshBtn ? 'welcome + both buttons' : JSON.stringify(onboarding));

    // Load the sample dataset.
    const clicked = await page.eval(`(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Explore sample data'));
      if (!btn) return false;
      btn.click();
      return true;
    })()`);
    check('Onboarding → click "Explore sample data"', clicked);
    await waitFor(page, `document.querySelector('h1')?.textContent.includes('Welcome, Alex')`, { timeout: 20000 });
    check('Dashboard renders after seeding', true, 'h1 = "Welcome, Alex"');

    // IndexedDB is seeded (local-first storage works in the deployed build).
    const dbCounts = await page.eval(`(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('ledgerly');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const counts = {};
      for (const name of db.objectStoreNames) {
        counts[name] = await new Promise((res, rej) => {
          const c = db.transaction(name).objectStore(name).count();
          c.onsuccess = () => res(c.result);
          c.onerror = () => rej(c.error);
        });
      }
      return counts;
    })()`);
    const txnCount = dbCounts.transactions ?? 0;
    const accountCount = dbCounts.accounts ?? 0;
    check('IndexedDB seeded with sample data', txnCount > 100 && accountCount >= 5,
      `${accountCount} accounts, ${txnCount} transactions`);

    // Every route renders its page header.
    console.log('  routes:');
    const ROUTES = [
      ['/', 'Welcome'],
      ['#/transactions', 'Transactions'],
      ['#/budget', 'Budget'],
      ['#/goals', 'Goals'],
      ['#/recurring', 'Recurring transactions'],
      ['#/accounts', 'Accounts'],
      ['#/investments', 'Investments'],
      ['#/net-worth', 'Net worth'],
      ['#/reports', 'Reports'],
      ['#/planning', 'Planning'],
      ['#/import-export', 'Import & Export'],
      ['#/settings', 'Settings'],
    ];
    for (const [hash, expected] of ROUTES) {
      try {
        const h1 = await gotoRoute(page, hash, expected);
        check(`${hash === '/' ? '/' : hash} → ${expected}`, true, `h1 = "${h1}"`);
      } catch (e) {
        check(`${hash} → ${expected}`, false, e.message);
      }
    }

    // Transaction search filters the list.
    try {
      await gotoRoute(page, '#/transactions', 'Transactions');
      // The list paginates from IndexedDB asynchronously — wait for rows before counting.
      await waitFor(page, `document.querySelectorAll('table tbody tr').length > 0`, { timeout: 10000 });
      const before = await page.eval(`document.querySelectorAll('table tbody tr').length`);
      const typed = await page.eval(`(() => {
        const input = document.querySelector('input[placeholder="Search transactions…"]');
        if (!input) return false;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Starbucks');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      })()`);
      check('Search input found + typed "Starbucks"', typed);
      await SLEEP(1000);
      const after = await page.eval(`document.querySelectorAll('table tbody tr').length`);
      check('Search filters rows', after > 0 && after < before, `rows ${before} → ${after}`);
      // Clear search for subsequent checks.
      await page.eval(`(() => {
        const input = document.querySelector('input[placeholder="Search transactions…"]');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await SLEEP(500);
    } catch (e) {
      check('Transaction search', false, e.message);
    }

    // Reports category filter is grouped by category group (ISSUE-004).
    try {
      await gotoRoute(page, '#/reports', 'Reports');
      const catFilter = await page.eval(`(() => {
        const sel = document.querySelector('select[aria-label="Filter by category"]');
        if (!sel) return null;
        return {
          optgroups: sel.querySelectorAll('optgroup').length,
          options: sel.querySelectorAll('option').length,
        };
      })()`);
      check('Reports category filter grouped by category group', !!catFilter && catFilter.optgroups > 0,
        catFilter ? `${catFilter.optgroups} groups, ${catFilter.options} options` : 'select not found');
    } catch (e) {
      check('Reports category filter grouped by category group', false, e.message);
    }

    // Backup download produces a valid, versioned JSON file.
    try {
      await gotoRoute(page, '#/import-export', 'Import & Export');
      const tabClicked = await page.eval(`(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Backup & restore');
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
      check('Backup tab opens', tabClicked);
      await waitFor(page, `document.body.innerText.includes('Back up my data')`, { timeout: 8000 });
      await page.eval(`(() => {
        const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Backup my data'));
        if (!btn) return false;
        btn.click();
        return true;
      })()`);
      let file = null;
      for (let i = 0; i < 40 && !file; i++) {
        await SLEEP(500);
        const files = readdirSync(dlDir);
        if (files.length) file = files[0];
      }
      check('Backup download captured', !!file, file ?? 'no file in download dir');
      if (file) {
        backupFilePath = join(dlDir, file);
        const raw = readFileSync(backupFilePath, 'utf8');
        const payload = JSON.parse(raw);
        const ok = payload?.format === 'ledgerly-backup' && payload?.version === 1 && payload?.data?.transactions?.length > 100;
        backupTxnCount = payload?.data?.transactions?.length ?? null;
        check('Backup file validates (format v1 + data)', ok,
          `${payload.format} v${payload.version}, ${payload.data?.transactions?.length} transactions`);
      }
    } catch (e) {
      check('Backup download', false, e.message);
    }

    // ========================================================================
    // PHASE 2 — PWA online
    // ========================================================================
    console.log('── Phase 2: PWA (online) ─────────────────────────────────────');

    // Manifest.
    const manifest = await page.eval(`fetch('./manifest.webmanifest').then((r) => r.json())`);
    check('Manifest served + valid', !!manifest && manifest.name === 'Ledgerly — Personal Finance'
      && manifest.display === 'standalone' && (manifest.icons?.length ?? 0) >= 2,
      `name="${manifest?.name}", display=${manifest?.display}, ${manifest?.icons?.length ?? 0} icons`);

    // Service worker registration.
    const sw = await page.eval(`navigator.serviceWorker.ready.then((reg) => ({
      scope: reg.scope,
      active: reg.active?.state ?? null,
      scriptURL: reg.active?.scriptURL ?? null,
    }))`);
    check('Service worker registered + active', !!sw?.active && sw?.active === 'activated' && sw?.scriptURL?.includes('sw.js'),
      `scope=${sw?.scope}, state=${sw?.active}`);

    // Reload once online so the SW controls the page before going offline.
    await page.send('Page.reload');
    await waitFor(page, `document.readyState === 'complete'`, { timeout: 20000 });
    await waitFor(page, `document.querySelector('#root')?.childElementCount > 0`, { timeout: 15000 });
    const controller = await waitFor(page, `navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null`, { timeout: 15000 });
    check('Service worker controls page', !!controller && controller.includes('sw.js'), controller);

    // ========================================================================
    // PHASE 3 — PWA offline
    // ========================================================================
    console.log('── Phase 3: PWA (offline) ────────────────────────────────────');

    await page.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await page.send('Page.reload');
    await waitFor(page, `document.readyState === 'complete'`, { timeout: 20000 });
    await waitFor(page, `document.querySelector('#root')?.childElementCount > 0`, { timeout: 15000 });

    const offline = await page.eval(`({
      onLine: navigator.onLine,
      title: document.title,
      h1: document.querySelector('h1')?.textContent,
      rootChildren: document.querySelector('#root')?.childElementCount,
      bodyLen: document.body.innerText.length,
    })`);
    check('App loads fully offline', !offline.onLine && offline.title === 'Ledgerly — Personal Finance'
      && offline.rootChildren > 0 && offline.bodyLen > 100,
      `onLine=${offline.onLine}, h1="${offline.h1}", body ${offline.bodyLen} chars`);

    // IndexedDB data survives offline reload.
    const offlineTxns = await page.eval(`(async () => {
      const db = await new Promise((res, rej) => {
        const r = indexedDB.open('ledgerly');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return new Promise((res, rej) => {
        const c = db.transaction('transactions').objectStore('transactions').count();
        c.onsuccess = () => res(c.result);
        c.onerror = () => rej(c.error);
      });
    })()`);
    check('Stored data available offline', offlineTxns === txnCount, `${offlineTxns} transactions (same as online)`);

    // SPA navigation works while offline (no network needed).
    try {
      await gotoRoute(page, '#/transactions', 'Transactions');
      check('In-app navigation works offline', true, '#/transactions rendered');
    } catch (e) {
      check('In-app navigation works offline', false, e.message);
    }

    // Back online for cleanliness.
    await page.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });

    // ========================================================================
    // PHASE 4 — Responsive (REQ-006)
    // ========================================================================
    console.log('── Phase 4: Responsive (375 / 768 / 1024 / 1440) ────────────────');

    const VIEWPORTS = [
      { width: 375, height: 812, label: '375px' },
      { width: 768, height: 1024, label: '768px' },
      { width: 1024, height: 768, label: '1024px' },
      { width: 1440, height: 900, label: '1440px' },
    ];

    for (const vp of VIEWPORTS) {
      await page.send('Emulation.setDeviceMetricsOverride', { width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: false });
      await SLEEP(400);

      // Navigation mode: below lg → bottom nav + hamburger; lg+ → sidebar.
      // Note: fixed-position elements have offsetParent === null, so use
      // computed display + geometry instead of offsetParent.
      const nav = await page.eval(`(() => {
        const visible = (el) => {
          if (!el) return false;
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        return {
          bottomNav: visible(document.querySelector('nav[aria-label="Mobile"]')),
          hamburger: visible(document.querySelector('button[aria-label="Open navigation"]')),
          sidebar: visible(document.querySelector('aside')),
          clientWidth: document.documentElement.clientWidth,
        };
      })()`);
      const mobile = vp.width < 1024;
      const navOk = mobile
        ? (nav.bottomNav && nav.hamburger && !nav.sidebar)
        : (!nav.bottomNav && !nav.hamburger && nav.sidebar);
      // clientWidth can be up to a scrollbar's width (~15px) less than the
      // emulated width — that is normal browser behavior, not a layout bug.
      const widthOk = Math.abs(nav.clientWidth - vp.width) <= 20;
      check(`${vp.label} navigation mode`, navOk && widthOk,
        navOk ? (mobile ? 'bottom nav + hamburger, sidebar hidden' : 'sidebar visible, bottom nav hidden') : JSON.stringify(nav));

      // Mobile drawer opens/closes (375 only).
      if (vp.width === 375) {
        const opened = await page.eval(`(() => {
          document.querySelector('button[aria-label="Open navigation"]')?.click();
          return true;
        })()`);
        await SLEEP(400);
        const drawer = await page.eval(`document.querySelector('[role="dialog"][aria-label="Navigation"]') !== null`);
        check('375px mobile drawer opens', opened && drawer);
        await page.eval(`document.querySelector('button[aria-label="Close navigation"]')?.click()`);
        await SLEEP(300);
      }

      // Desktop sidebar collapses (1440 only).
      if (vp.width === 1440) {
        await page.eval(`document.querySelector('button[aria-label="Collapse sidebar"]')?.click()`);
        await SLEEP(300);
        const collapsed = await page.eval(`document.querySelector('aside')?.classList.contains('w-16')`);
        check('1440px sidebar collapses', !!collapsed);
        await page.eval(`document.querySelector('button[aria-label="Expand sidebar"]')?.click()`);
        await SLEEP(300);
      }

      // Horizontal overflow across every route.
      const overflowRoutes = [];
      for (const [hash, expected] of ROUTES) {
        try {
          await gotoRoute(page, hash, expected);
          await SLEEP(400);
          const m = await page.eval(`(() => {
            const de = document.documentElement;
            const overflowX = de.scrollWidth - de.clientWidth;
            if (overflowX <= 0) return { ok: true, overflowX: 0 };
            let worst = null, worstRight = -Infinity;
            for (const el of document.querySelectorAll('body *')) {
              const r = el.getBoundingClientRect();
              if (r.right > worstRight) { worstRight = r.right; worst = el; }
            }
            return { ok: false, overflowX, culprit: worst
              ? \`\${worst.tagName.toLowerCase()}.\${String(worst.className).slice(0, 90)} right=\${Math.round(worstRight)}\`
              : '?' };
          })()`);
          if (!m.ok) overflowRoutes.push(`${hash} (+${m.overflowX}px @ ${m.culprit})`);
        } catch (e) {
          overflowRoutes.push(`${hash} (render error: ${e.message.slice(0, 80)})`);
        }
      }
      check(`${vp.label} no horizontal scroll on any route`, overflowRoutes.length === 0,
        overflowRoutes.length === 0 ? 'all routes clean' : overflowRoutes.join('; '));
    }

    await page.send('Emulation.clearDeviceMetricsOverride');

    // ========================================================================
    // PHASE 5 — CSV import wizard (end-to-end)
    // ========================================================================
    console.log('── Phase 5: CSV import wizard ─────────────────────────────────');

    // Two identically-shaped files: the second proves re-import dedupe (its
    // filename differs so the file input definitely fires a change event).
    const csvText = [
      'Date,Description,Amount,Category',
      '2026-08-01,Verify Import Alpha,-12.34,Shopping',
      '2026-08-02,Verify Import Bravo,-56.78,Groceries',
      '2026-08-03,Verify Import Charlie,-9.99,Dining',
      '2026-08-04,Verify Import Delta,150.00,Income',
    ].join('\n');
    const csvPath1 = join(fixtureDir, 'ledgerly-verify-import.csv');
    const csvPath2 = join(fixtureDir, 'ledgerly-verify-import-repeat.csv');
    writeFileSync(csvPath1, csvText);
    writeFileSync(csvPath2, csvText);
    const CSV_FILE_INPUT = 'input[type="file"][accept*=".csv"]';

    const validCountOf = () => page.eval(`(() => {
      const m = document.body.innerText.match(/(\\d+) valid/);
      return m ? Number(m[1]) : null;
    })()`);

    /** Walk the CSV wizard: upload → map → preview → import. */
    const importCsv = async (path, { expectDuplicates }) => {
      await waitFor(page, `document.body.innerText.includes('Upload a CSV or TSV statement')`, { timeout: 10000 });
      await setFileInput(page, CSV_FILE_INPUT, path);

      await waitFor(page, `document.body.innerText.includes('Map columns —')`, { timeout: 10000 });
      const mapped = await page.eval(`({
        date: document.body.innerText.includes('✓ Date mapped'),
        amount: document.body.innerText.includes('✓ Amount mapped'),
      })`);
      check('CSV columns auto-mapped (date + amount)', mapped.date && mapped.amount, JSON.stringify(mapped));

      const account = await page.eval(`(() => {
        const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim() === 'Select an account…'));
        if (!sel) return null;
        const opt = [...sel.options].find((o) => o.value !== '');
        if (!opt) return null;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { name: opt.textContent.trim() };
      })()`);
      check('CSV mapping step offers accounts', !!account, account ? account.name : 'no account option');
      await SLEEP(400);

      await clickButton(page, `b.textContent.trim() === 'Preview import'`);
      await waitFor(page, `document.body.innerText.includes('Preview normalized transactions')`, { timeout: 10000 });
      const valid = await validCountOf();

      // Duplicate analysis resolves asynchronously inside the preview.
      await waitFor(page, `document.body.innerText.includes('No duplicates found') || document.body.innerText.includes('possible duplicate(s) detected')`, { timeout: 10000 });
      const dupes = await page.eval(`(() => {
        const m = document.body.innerText.match(/(\\d+) possible duplicate\\(s\\) detected/);
        return m ? Number(m[1]) : 0;
      })()`);
      check(expectDuplicates ? 'Re-import flags every row as a duplicate' : 'First import finds no duplicates',
        expectDuplicates ? dupes === valid && valid > 0 : dupes === 0,
        `${dupes} duplicates of ${valid} rows`);

      await clickButton(page, `/^Import \\d+ transactions$/.test(b.textContent.trim())`);
      await waitFor(page, `document.body.innerText.includes('Import complete')`, { timeout: 15000 });
      const text = await page.eval(`document.body.innerText`);
      const message = (text.match(/Imported \d+ transactions[^\n]*/) ?? [''])[0];
      return { valid, message };
    };

    try {
      await gotoRoute(page, '#/import-export', 'Import & Export');
      await clickButton(page, `b.textContent.trim() === 'CSV / TSV'`);
      const baseline = await page.eval(DB_TXN_COUNT);
      check('CSV import: baseline transaction count', baseline > 100, `${baseline} transactions`);

      const first = await importCsv(csvPath1, { expectDuplicates: false });
      check('CSV preview shows all rows valid', first.valid === 4, `${first.valid} valid rows`);
      const afterFirst = await page.eval(DB_TXN_COUNT);
      check('CSV import persisted the new transactions', afterFirst === baseline + first.valid,
        `${baseline} → ${afterFirst} (+${afterFirst - baseline})`);
      check('CSV import reports success', first.message.includes(`Imported ${first.valid} transactions`), first.message);

      // Re-import the identical file — everything should be skipped as a duplicate.
      await clickButton(page, `b.textContent.trim() === 'Import another file'`);
      await SLEEP(500);
      const second = await importCsv(csvPath2, { expectDuplicates: true });
      const afterSecond = await page.eval(DB_TXN_COUNT);
      check('Re-import added no new rows', afterSecond === afterFirst, `${afterFirst} → ${afterSecond}`);
      check('Re-import reports 0 imported', second.message.includes('Imported 0 transactions'), second.message);

      // The imported rows show up in Transactions.
      await gotoRoute(page, '#/transactions', 'Transactions');
      await waitFor(page, `document.querySelectorAll('table tbody tr').length > 0`, { timeout: 10000 });
      await page.eval(`(() => {
        const input = document.querySelector('input[placeholder="Search transactions…"]');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Verify Import');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(page, `document.querySelectorAll('table tbody tr').length === 4`, { timeout: 10000 });
      check('Imported transactions are searchable', true, '4 rows for "Verify Import"');
    } catch (e) {
      check('CSV import wizard', false, e.message);
    }

    // ========================================================================
    // PHASE 6 — Restore wizard (end-to-end)
    // ========================================================================
    console.log('── Phase 6: Restore wizard ────────────────────────────────────');

    const confirmRestore = async () => {
      await clickButton(page, `b.textContent.trim() === 'Restore backup'`);
      await waitFor(page, `document.querySelector('[role="dialog"]') !== null`, { timeout: 8000 });
      const title = await page.eval(`document.querySelector('[role="dialog"]')?.getAttribute('aria-label') ?? ''`);
      await page.eval(`(() => {
        const dlg = document.querySelector('[role="dialog"]');
        [...dlg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Restore')?.click();
      })()`);
      return title;
    };

    try {
      if (!backupFilePath || !backupTxnCount) throw new Error('no backup file captured in Phase 1');
      await gotoRoute(page, '#/import-export', 'Import & Export');
      await clickButton(page, `b.textContent.trim() === 'Backup & restore'`);
      await waitFor(page, `document.body.innerText.includes('Back up my data')`, { timeout: 10000 });

      const beforeRestore = await page.eval(DB_TXN_COUNT);
      check('Restore: extra data present before restore', beforeRestore > backupTxnCount,
        `${beforeRestore} transactions (backup has ${backupTxnCount})`);

      // Upload the backup produced in Phase 1.
      await setFileInput(page, 'input[type="file"][accept*=".json"]', backupFilePath);
      await waitFor(page, `document.body.innerText.includes('Valid backup')`, { timeout: 10000 });
      check('Restore: backup validated in the wizard', true, `v1, ${backupTxnCount} transactions`);

      // Replace mode (the default) — the dataset must return to exactly the backup.
      const replaceTitle = await confirmRestore();
      check('Restore: confirmation dialog appears', replaceTitle.includes('Restore this backup?'), replaceTitle);
      await waitFor(page, `document.body.innerText.includes('Restore complete')`, { timeout: 15000 });
      const afterReplace = await page.eval(DB_TXN_COUNT);
      check('Restore (replace) restored the backup exactly', afterReplace === backupTxnCount,
        `${beforeRestore} → ${afterReplace} (backup ${backupTxnCount})`);

      // Merge mode — remove one record first so there is something to re-add.
      const removedKey = await page.eval(`(async () => {
        const db = await new Promise((res, rej) => {
          const r = indexedDB.open('ledgerly');
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        const tx = db.transaction('transactions', 'readwrite');
        const store = tx.objectStore('transactions');
        const key = await new Promise((res, rej) => {
          const req = store.openCursor();
          req.onsuccess = () => res(req.result ? req.result.primaryKey : null);
          req.onerror = () => rej(req.error);
        });
        if (key !== null) {
          await new Promise((res, rej) => {
            const req = store.delete(key);
            req.onsuccess = () => res();
            req.onerror = () => rej(req.error);
          });
        }
        await new Promise((res) => { tx.oncomplete = res; });
        return key;
      })()`);
      const beforeMerge = await page.eval(DB_TXN_COUNT);
      check('Restore: one record removed for the merge test', removedKey != null && beforeMerge === backupTxnCount - 1,
        `${backupTxnCount} → ${beforeMerge}`);

      await page.eval(`(() => {
        const label = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('Merge with current data'));
        label?.querySelector('input[type="radio"]')?.click();
      })()`);
      await SLEEP(300);
      await confirmRestore();
      // `restoreDone` is already true from the replace pass, so poll the data
      // rather than the banner to know the merge finished.
      let afterMerge = beforeMerge;
      for (let i = 0; i < 40 && afterMerge !== backupTxnCount; i++) {
        await SLEEP(300);
        afterMerge = await page.eval(DB_TXN_COUNT);
      }
      check('Restore (merge) re-added the missing record', afterMerge === backupTxnCount,
        `${beforeMerge} → ${afterMerge}`);
    } catch (e) {
      check('Restore wizard', false, e.message);
    }

    // ========================================================================
    // PHASE 7 — QFX/OFX import wizard (end-to-end)
    // ========================================================================
    console.log('── Phase 7: QFX/OFX import wizard ─────────────────────────────');

    // A minimal OFX 1.x (SGML) statement with distinctive FITIDs, so re-import
    // dedupe is exercised through the external-id path.
    const ofxText = [
      '<OFX>',
      '  <SIGNONMSGSRSV1><SONRS><FI><ORG>Verify Financial</ORG><FID>9999</FID></FI></SONRS></SIGNONMSGSRSV1>',
      '  <BANKMSGSRSV1><STMTTRNRS><STMTRS>',
      '    <CURDEF>USD</CURDEF>',
      '    <BANKACCTFROM><BANKID>999888777</BANKID><ACCTID>999900001111</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>',
      '    <BANKTRANLIST>',
      '      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260801</DTPOSTED><TRNAMT>-21.50</TRNAMT><FITID>VERIFY-OFX-0001</FITID><NAME>Verify OFX Alpha</NAME><MEMO>ofx memo alpha</MEMO></STMTTRN>',
      '      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20260802</DTPOSTED><TRNAMT>-77.25</TRNAMT><FITID>VERIFY-OFX-0002</FITID><NAME>Verify OFX Bravo</NAME><MEMO>ofx memo bravo</MEMO></STMTTRN>',
      '      <STMTTRN><TRNTYPE>CREDIT</TRNTYPE><DTPOSTED>20260803</DTPOSTED><TRNAMT>310.00</TRNAMT><FITID>VERIFY-OFX-0003</FITID><NAME>Verify OFX Charlie</NAME><MEMO>ofx memo charlie</MEMO></STMTTRN>',
      '    </BANKTRANLIST>',
      '    <LEDGERBAL><BALAMT>2500.00</BALAMT><DTASOF>20260803</DTASOF></LEDGERBAL>',
      '  </STMTRS></STMTTRNRS></BANKMSGSRSV1>',
      '</OFX>',
    ].join('\n');
    const ofxPath1 = join(fixtureDir, 'ledgerly-verify.ofx');
    const ofxPath2 = join(fixtureDir, 'ledgerly-verify-repeat.qfx');
    writeFileSync(ofxPath1, ofxText);
    writeFileSync(ofxPath2, ofxText);
    const OFX_FILE_INPUT = 'input[type="file"][accept*=".ofx"]';
    const numFrom = (message, re) => { const m = message.match(re); return m ? Number(m[1]) : null; };

    /** Walk the QFX/OFX wizard: upload → account → import. */
    const importOfx = async (path) => {
      await waitFor(page, `document.body.innerText.includes('Upload a QFX or OFX statement')`, { timeout: 10000 });
      await setFileInput(page, OFX_FILE_INPUT, path);
      await waitFor(page, `document.body.innerText.includes('transactions found')`, { timeout: 10000 });
      const found = await page.eval(`(() => { const m = document.body.innerText.match(/(\\d+) transactions found/); return m ? Number(m[1]) : null; })()`);

      const account = await page.eval(`(() => {
        const sel = [...document.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.textContent.trim() === 'Select an account…'));
        if (!sel) return null;
        const opt = [...sel.options].find((o) => o.value !== '');
        if (!opt) return null;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
        setter.call(sel, opt.value);
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return { name: opt.textContent.trim() };
      })()`);
      check('OFX wizard offers accounts', !!account, account ? account.name : 'no account option');
      await SLEEP(400);

      await clickButton(page, `/^Import \\d+ transactions$/.test(b.textContent.trim())`);
      await waitFor(page, `document.body.innerText.includes('Import complete')`, { timeout: 15000 });
      const text = await page.eval(`document.body.innerText`);
      const message = (text.match(/Imported \d+ transactions[^\n]*/) ?? [''])[0];
      return { found, message };
    };

    try {
      await gotoRoute(page, '#/import-export', 'Import & Export');
      await clickButton(page, `b.textContent.trim() === 'QFX / OFX'`);

      const beforeOfx = await page.eval(DB_TXN_COUNT);
      const first = await importOfx(ofxPath1);
      const importedFirst = numFrom(first.message, /Imported (\d+) transactions/);
      const skippedFirst = numFrom(first.message, /Skipped (\d+) duplicates/);
      check('OFX import parsed all statement transactions', first.found === 3, `${first.found} transactions found`);
      check('OFX import added every transaction (no false duplicates)',
        importedFirst === first.found && skippedFirst === 0, first.message);
      const afterFirstOfx = await page.eval(DB_TXN_COUNT);
      check('OFX import persisted the new transactions', afterFirstOfx === beforeOfx + (importedFirst ?? 0),
        `${beforeOfx} → ${afterFirstOfx}`);

      // Re-import the same statement — FITIDs must all be recognized as duplicates.
      await clickButton(page, `b.textContent.trim() === 'Import another file'`);
      await SLEEP(500);
      const second = await importOfx(ofxPath2);
      const importedSecond = numFrom(second.message, /Imported (\d+) transactions/);
      const skippedSecond = numFrom(second.message, /Skipped (\d+) duplicates/);
      check('OFX re-import skipped every transaction by FITID',
        importedSecond === 0 && skippedSecond === second.found, second.message);
      const afterSecondOfx = await page.eval(DB_TXN_COUNT);
      check('OFX re-import added no new rows', afterSecondOfx === afterFirstOfx,
        `${afterFirstOfx} → ${afterSecondOfx}`);

      // Imported rows are visible in Transactions.
      await gotoRoute(page, '#/transactions', 'Transactions');
      await waitFor(page, `document.querySelectorAll('table tbody tr').length > 0`, { timeout: 10000 });
      await page.eval(`(() => {
        const input = document.querySelector('input[placeholder="Search transactions…"]');
        if (!input) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'Verify OFX');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await waitFor(page, `document.querySelectorAll('table tbody tr').length === 3`, { timeout: 10000 });
      check('OFX transactions are searchable', true, '3 rows for "Verify OFX"');
    } catch (e) {
      check('QFX/OFX import wizard', false, e.message);
    }

    // ========================================================================
    // Summary
    // ========================================================================
    const failed = results.filter((r) => !r.ok);
    const passed = results.filter((r) => r.ok);
    console.log('\n── Summary ───────────────────────────────────────────────────');
    console.log(`  ${passed.length} passed, ${failed.length} failed`);
    if (consoleErrors.length) {
      console.log(`\n  Console errors observed (${consoleErrors.length}):`);
      for (const e of consoleErrors.slice(0, 10)) console.log(`    ⚠ ${e.slice(0, 220)}`);
    } else {
      console.log('\n  No console errors observed.');
    }
    console.log('');
    browser.close();
    page.close();
    return failed.length === 0 ? 0 : 1;
  } finally {
    try { chrome?.kill(); } catch { /* ignore */ }
    // Give Chrome a moment to release the profile before removing it.
    await SLEEP(800);
    for (const dir of [profileDir, dlDir, fixtureDir]) {
      for (let i = 0; i < 5; i++) {
        try { rmSync(dir, { recursive: true, force: true }); break; } catch { await SLEEP(300); }
      }
    }
  }
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(`\nVerification aborted: ${e.message}`);
  process.exit(1);
});