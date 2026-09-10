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
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
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
        const raw = readFileSync(join(dlDir, file), 'utf8');
        const payload = JSON.parse(raw);
        const ok = payload?.format === 'ledgerly-backup' && payload?.version === 1 && payload?.data?.transactions?.length > 100;
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
    for (const dir of [profileDir, dlDir]) {
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