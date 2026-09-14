#!/usr/bin/env node
/** Short diagnostic: navigate to Transactions with 100k rows, dump console + errors + text. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = 'http://127.0.0.1:4173/';
const CHROME = process.env.CHROME_BIN ?? 'google-chrome-stable';
const PORT = 9448;
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); this.log = []; }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = () => rej(new Error('ws fail')); });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id) { const p = this.pending.get(msg.id); if (!p) return; this.pending.delete(msg.id); msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result); }
      else if (msg.method === 'Runtime.consoleAPICalled') {
        const args = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
        this.log.push(`[console.${msg.params.type}] ${args}`);
      } else if (msg.method === 'Runtime.exceptionThrown') {
        this.log.push(`[EXCEPTION] ${msg.params.exceptionDetails?.exception?.description ?? msg.params.exceptionDetails?.text}`);
      }
    };
  }
  on(method, fn) { /* unused in diag */ }
  send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { resolve: res, reject: rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __evalError: r.exceptionDetails.exception?.description ?? r.exceptionDetails.text };
    return r.result.value;
  }
}

const profileDir = mkdtempSync(join(tmpdir(), 'ledgerly-diag2-'));
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, '--window-size=1440,1000', 'about:blank',
], { stdio: 'ignore' });

try {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {} await SLEEP(250); }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Page.navigate', { url: BASE_URL });
  await SLEEP(1500);
  const seedMs = await cdp.eval(`(async () => {
    const openDb = () => new Promise((res, rej) => { const r = indexedDB.open('ledgerly'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const db = await openDb();
    if (!db.objectStoreNames.contains('transactions')) { db.close(); return 'NO_SCHEMA'; }
    const now = new Date().toISOString();
    const mkTxn = (i) => ({ id: 'perf-' + i, accountId: 'perf-acc-0',
      date: '2026-0' + (1 + (i % 9)) + '-' + String(1 + (i % 28)).padStart(2, '0'),
      amount: -((i % 20000) + 100), merchant: (i % 100 === 0 ? 'PerfSearchneedle ' : 'Perf Merchant ') + (i % 500),
      originalDescription: 'Perf txn ' + i, categoryId: 'cat-' + (i % 10), tagIds: [], notes: '', type: 'expense',
      cleared: true, pending: false, reviewed: i % 2 === 0, transferId: null, recurringId: null,
      externalId: null, splitParentId: null, importSessionId: null, createdAt: now, updatedAt: now });
    for (let start = 0; start < 100000; start += 10000) {
      await new Promise((res, rej) => { const tx = db.transaction('transactions', 'readwrite'); const st = tx.objectStore('transactions');
        tx.onerror = () => rej(tx.error); tx.oncomplete = () => res();
        for (let i = start; i < start + 10000; i++) st.put(mkTxn(i)); });
    }
    await new Promise((res, rej) => { const tx = db.transaction('accounts', 'readwrite');
      tx.objectStore('accounts').put({ id: 'perf-acc-0', name: 'Perf Checking', institution: 'Perf Bank', type: 'checking',
        lastFour: '0000', balance: 0, startingBalance: 10000000, currency: 'USD', notes: '', active: true,
        includeInNetWorth: true, includeInBudget: true, includeInReports: true, createdAt: now, updatedAt: now });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close(); return 'seeded';
  })()`);
  console.log('seed:', seedMs);

  await cdp.eval(`location.reload()`);
  await SLEEP(5000);
  console.log('== after reload, hash:', await cdp.eval(`location.hash`));
  await cdp.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href')?.includes('transactions')); if (a) a.click(); })()`);
  await SLEEP(4000);
  console.log('== after txn click, hash:', await cdp.eval(`location.hash`));
  const t = await cdp.eval(`document.body.innerText`);
  console.log('body has filter bar:', /All accounts/.test(t), '| has tbody:', await cdp.eval(`!!document.querySelector('tbody')`));
  console.log('body text (400):', JSON.stringify(t.slice(0, 400)));
  console.log('---- console/exceptions ----');
  for (const line of cdp.log.slice(-12)) console.log(line);
} finally {
  try { chrome.kill(); } catch {}
  await SLEEP(300);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
}
