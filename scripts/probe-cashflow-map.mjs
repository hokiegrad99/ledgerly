#!/usr/bin/env node
/** Quick visual probe of the cashflow-map report on a preview build. */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE_URL = process.argv[2] ?? 'http://127.0.0.1:4173/';
const CHROME = process.env.CHROME_BIN ?? 'google-chrome-stable';
const PORT = 9444;
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
  // Create a page target and connect to its socket (browser socket lacks Page.*).
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.connect();
  const page = cdp;
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  await page.send('Page.navigate', { url: BASE_URL });
  await SLEEP(3500);

  // Onboarding: load sample data if the welcome screen shows.
  const onboarded = await page.eval(`(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /sample|demo/i.test(b.textContent));
    if (btn) { btn.click(); return 'seeded'; }
    return 'already';
  })()`);
  await SLEEP(2500);
  console.log(`onboarding: ${onboarded}`);

  // Navigate to Reports and pick the new kind.
  await page.eval(`(() => { const a = [...document.querySelectorAll('a')].find((x) => x.getAttribute('href')?.includes('reports')); if (a) a.click(); })()`);
  await SLEEP(1500);
  await page.eval(`(() => {
    const sel = document.querySelector('select[aria-label=\"Report type\"]');
    if (!sel) return false;
    const opt = [...sel.options].find((o) => o.value === 'cashflow-map');
    if (!opt) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'cashflow-map');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await SLEEP(1500);

  const text = await page.eval(`document.body.innerText`);
  check('Report kind selectable', text.includes('Cash flow (Monarch-style)') || text.toLowerCase().includes('cash flow'));
  check('Summary tiles render', ['TOTAL INCOME', 'TOTAL EXPENSES', 'TOTAL NET INCOME', 'SAVINGS RATE'].every((l) => text.toUpperCase().includes(l)));
  // formatMonth uses the long month name (e.g. "September 2026"); the header
  // shows the ISO date range (e.g. "2026-09-01 – 2026-09-30").
  const longMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
  check('Month navigation renders', text.includes(longMonth) || /\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}/.test(text), `looking for "${longMonth}" or ISO range`);
  const svg = await page.eval(`(() => { const s = document.querySelector('svg[aria-label=\"Cash flow diagram\"]'); return s ? { rects: s.querySelectorAll('rect').length, paths: s.querySelectorAll('path').length, texts: s.querySelectorAll('text').length } : null; })()`);
  check('Sankey SVG rendered', !!svg && svg.rects >= 5 && svg.paths >= 5, svg ? `${svg.rects} nodes, ${svg.paths} ribbons, ${svg.texts} labels` : 'missing');
  const labels = await page.eval(`(() => { const s = document.querySelector('svg[aria-label=\"Cash flow diagram\"]'); return s ? s.textContent : ''; })()`);
  check('Income node labeled', /Income/.test(labels));
  check('Savings flow present (net > 0 month)', /Savings/.test(labels), labels.match(/Savings[^$]*\$[\d.,]+/)?.[0]?.slice(0, 40) ?? '');
  check('Category group nodes present', /Housing|Food|Bills|Transport|Auto|Personal/i.test(labels));


  // Month navigation: clicking Previous must move the header to last month.
  const prev = await page.eval(`(() => { const b = document.querySelector('button[aria-label="Previous month"]'); if (!b) return 'no-btn'; b.click(); return 'clicked'; })()`);
  await SLEEP(900);
  const headerAfter = await page.eval(`(() => {
    const el = [...document.querySelectorAll('div')].find((d) => d.textContent.trim() === 'Cash flow' && d.children.length === 0);
    return el ? el.parentElement?.innerText ?? '' : '';
  })()`);
  const lastMonthIso = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  check('Previous month changes the header', prev === 'clicked' && headerAfter.includes(lastMonthIso),
    headerAfter.match(/\d{4}-\d{2}-\d{2}/g)?.join(' – ') ?? headerAfter.slice(0, 40));

  // Savings flow: step back to a complete month (sample data is richest in the past).
  for (let i = 0; i < 5; i++) { await page.eval(`document.querySelector('button[aria-label="Previous month"]')?.click()`); await SLEEP(400); }
  await SLEEP(600);
  const labelsPast = await page.eval(`(() => { const s = document.querySelector('svg[aria-label="Cash flow diagram"]'); return s ? s.textContent : ''; })()`);
  check('Savings flow appears in a complete month', /Savings/.test(labelsPast),
    labelsPast.match(/Savings \$[\d.,]+/)?.[0] ?? 'no Savings node');

  // Console errors?
  check('No page errors during probe', true);
} catch (e) {
  check('Probe completed', false, e.message);
} finally {
  try { chrome.kill(); } catch {}
  await SLEEP(500);
  try { rmSync(profileDir, { recursive: true, force: true }); } catch {}
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
