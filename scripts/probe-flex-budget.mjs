#!/usr/bin/env node
/**
 * REQ-025 probe: flex budget mode end to end against a preview build.
 *
 * Start a preview server first (serves dist/):
 *   npm run build && npx vite preview --port 4173
 *   node scripts/probe-flex-budget.mjs [url]
 *
 * Verifies, in order:
 *   1. Budget page renders in category mode.
 *   2. Mode switch category → flex shows the flex panel.
 *   3. Entering a flex amount and saving persists { mode: 'flex', flexAmount }
 *      to the budget row in IndexedDB.
 *   4. After a full reload the page restores flex mode, and the summary cards
 *      match independent math recomputed from IndexedDB (spent = all
 *      non-transfer expense spending in the month, honoring account and
 *      system-tag budget exclusions; remaining = flexAmount − spent).
 *   5. Switching back to category mode restores the per-category table with
 *      its budget items intact (mode switch never deletes items).
 *
 * Exit code 0 = all checks passed, 1 = one or more failed.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const CHROME = process.env.CHROME_BIN ?? 'google-chrome-stable';
const PORT = 9445;
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.handlers = []; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = () => reject(new Error('ws fail')); });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) { const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else for (const h of this.handlers) h(msg.method, msg.params);
    };
  }
  on(method, fn) { this.handlers.push((m, p) => { if (m === method) fn(p); }); }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
}

const profileDir = mkdtempSync(join(tmpdir(), 'ledgerly-probe-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

const results = [];
const check = (name, ok, detail = '') => { results.push({ ok }); console.log(`  ${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`); };

async function waitForEndpoint() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return await r.json(); } catch { /* not up yet */ }
    await SLEEP(250);
  }
  throw new Error('CDP endpoint never came up');
}

try {
  await waitForEndpoint();
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: BASE_URL });
  await SLEEP(3500);

  // Onboard with sample data (seeds budgeted categories with real spending).
  const onboarded = await cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /sample|demo/i.test(b.textContent));
    if (btn) { btn.click(); return 'seeded'; }
    return 'already';
  })()`);
  await SLEEP(2500);
  console.log(`onboarding: ${onboarded}`);

  // Expected flex totals, computed independently from IndexedDB with the exact
  // domain semantics (spendingByCategory + isExcludedFromBudget): expenses
  // only, transfers excluded, account includeInBudget=false and the
  // tag-exclude-budget system tag excluded.
  const expected = await cdp.eval(`(async () => {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open('ledgerly');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const getAll = (store) => new Promise((res, rej) => {
      const c = db.transaction(store).objectStore(store).getAll();
      c.onsuccess = () => res(c.result);
      c.onerror = () => rej(c.error);
    });
    const month = new Date().toISOString().slice(0, 7);
    const [txns, accounts] = await Promise.all([getAll('transactions'), getAll('accounts')]);
    const excludedAccts = new Set(accounts.filter((a) => a.includeInBudget === false).map((a) => a.id));
    const EXCLUDE_TAG = 'tag-exclude-budget';
    let spent = 0;
    for (const t of txns) {
      if (t.date.slice(0, 7) !== month) continue;
      if (t.type === 'transfer') continue;
      if (t.amount >= 0) continue;
      if (!t.categoryId) continue; // spendingByCategory only maps categorized spending
      if (excludedAccts.has(t.accountId)) continue;
      if ((t.tagIds ?? []).includes(EXCLUDE_TAG)) continue;
      spent += -t.amount;
    }
    return { month, spent };
  })()`);
  check('Sample data has current-month spending', expected.spent > 0,
    `month ${expected.month}, spent ${(expected.spent / 100).toFixed(2)}`);

  // Pick a flex amount cleanly above the month's spending so Remaining is
  // positive (next clean thousand + $1,000 buffer).
  const flexCents = (Math.floor(expected.spent / 100000) + 2) * 100000;
  const flexDollars = (flexCents / 100).toFixed(2);
  const fmt = (cents) => '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Navigate to Budget.
  await cdp.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href')?.includes('budget')); if (a) a.click(); })()`);
  await SLEEP(1500);
  let text = await cdp.eval(`document.body.innerText`);
  check('Budget page renders in category mode', /Category budget/.test(text) && /rollover/i.test(text));

  // Switch to flex mode via the segmented control.
  const switched = await cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Flex budget');
    if (!btn) return 'missing';
    btn.click();
    return 'clicked';
  })()`);
  await SLEEP(1500);
  text = await cdp.eval(`document.body.innerText`);
  check('Mode switch category → flex works', switched === 'clicked' && /Set one total for flexible spending/.test(text));

  // Enter the flex amount and save.
  const saved = await cdp.eval(`(async () => {
    const label = [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === 'Monthly flex budget');
    const input = label?.parentElement?.querySelector('input');
    if (!input) return 'no-input';
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '${flexDollars}');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const btn = [...document.querySelectorAll('button')].find((b) => /Save flex budget/.test(b.textContent));
    if (!btn) return 'no-save';
    btn.click();
    return 'saved';
  })()`);
  await SLEEP(1800);
  check(`Flex amount entered and saved (${fmt(flexCents)})`, saved === 'saved', `result: ${saved}`);

  // The budget row must be persisted as mode=flex with the entered amount.
  const row = await cdp.eval(`(async () => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('ledgerly'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const budgets = await new Promise((res, rej) => { const c = db.transaction('budgets').objectStore('budgets').getAll(); c.onsuccess = () => res(c.result); c.onerror = () => rej(c.error); });
    const b = budgets.find((x) => x.month === '${expected.month}');
    return b ? { mode: b.mode, flexAmount: b.flexAmount } : null;
  })()`);
  check('Budget row persisted (mode=flex, amount in cents)',
    !!row && row.mode === 'flex' && row.flexAmount === flexCents,
    row ? `mode=${row.mode} flexAmount=${row.flexAmount}` : 'missing row');

  // Full reload: mode and amount must be restored, and the totals must match
  // the independent IndexedDB math.
  await cdp.eval(`location.reload()`);
  await SLEEP(3500);
  await cdp.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href')?.includes('budget')); if (a) a.click(); })()`);
  await SLEEP(1500);
  text = await cdp.eval(`document.body.innerText`);

  check('Flex mode restored after reload', /Set one total for flexible spending/.test(text));
  check(`Flex amount displayed (${fmt(flexCents)})`, text.includes(fmt(flexCents)));
  check(`Spent matches independent math (${fmt(expected.spent)})`, text.includes(fmt(expected.spent)));
  const remainingCents = flexCents - expected.spent;
  check(`Remaining = flex − spent (${fmt(remainingCents)})`, text.includes(fmt(remainingCents)));

  // Round-trip back to category mode; budget items must survive untouched.
  const back = await cdp.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Category budget');
    if (!btn) return 'missing';
    btn.click();
    return 'clicked';
  })()`);
  await SLEEP(1500);
  text = await cdp.eval(`document.body.innerText`);
  check('Mode switch flex → category works', back === 'clicked' && /rollover/i.test(text) && !/Set one total for flexible spending/.test(text),
    back);
  check('Category budget items survived mode round-trip', /Groceries/.test(text) && /Save budget/.test(text));
} catch (e) {
  check('Probe completed', false, e.message);
} finally {
  try { chrome.kill(); } catch {}
  await SLEEP(500);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
