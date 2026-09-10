#!/usr/bin/env node
/**
 * Project health check: reads REQUIREMENTS.md, counts KNOWN_ISSUES.md,
 * and (optionally) runs the test suite to report status.
 *
 * Usage: npm run project:status
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'IMPLEMENTED', 'TESTING', 'VERIFIED', 'BLOCKED', 'DEFERRED'];

function countRequirements() {
  const path = 'REQUIREMENTS.md';
  if (!existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let total = 0;
  for (const line of lines) {
    const m = line.match(/\*\*Status:\*\*\s*(NOT_STARTED|IN_PROGRESS|IMPLEMENTED|TESTING|VERIFIED|BLOCKED|DEFERRED)/);
    if (m) {
      counts[m[1]]++;
      total++;
    }
  }
  return { total, counts };
}

function countIssues() {
  const path = 'KNOWN_ISSUES.md';
  if (!existsSync(path)) return { total: 0, openTotal: 0, bySeverity: {} };
  const text = readFileSync(path, 'utf8');
  // Split into per-issue blocks so each severity can be paired with its status;
  // only OPEN/IN_PROGRESS issues count as "known issues".
  const blocks = text.split(/^## /m).slice(1);
  const sev = {};
  let total = 0;
  let openTotal = 0;
  for (const block of blocks) {
    const status = block.match(/\*\*Status:\*\*\s*(\w+)/)?.[1];
    const severity = block.match(/\*\*Severity:\*\*\s*(Critical|High|Medium|Low)/)?.[1];
    if (!status) continue;
    total++;
    if ((status === 'OPEN' || status === 'IN_PROGRESS') && severity) {
      sev[severity] = (sev[severity] ?? 0) + 1;
      openTotal++;
    }
  }
  return { total, openTotal, bySeverity: sev };
}

const req = countRequirements();
const issues = countIssues();

console.log('========================================');
console.log('PERSONAL FINANCE PROJECT STATUS');
console.log('========================================\n');

if (req) {
  console.log('Requirements');
  console.log('------------');
  console.log(`Total:        ${req.total}`);
  for (const s of STATUSES) {
    console.log(`${s.padEnd(12)} ${req.counts[s]}`);
  }
  const active = req.total - req.counts.DEFERRED;
  const pct = active > 0 ? Math.round((req.counts.VERIFIED / active) * 100) : 0;
  console.log(`\nCompletion: ${pct}%\n`);
} else {
  console.log('REQUIREMENTS.md not found.\n');
}

// Tests
console.log('Tests');
console.log('-----');
try {
  const out = execSync('npx vitest run --reporter=basic 2>&1', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  const match = out.match(/Tests\s+(\d+) passed.*?(\d+) failed/);
  if (match) {
    console.log(`Passed: ${match[1]}`);
    console.log(`Failed: ${match[2]}`);
  } else {
    const ok = /Test Files\s+\d+ passed/.test(out);
    console.log(ok ? 'All tests passed.' : 'Test output not parsed; run `npm test` manually.');
  }
} catch (e) {
  const msg = String(e.stdout ?? e.message ?? '');
  const fail = msg.match(/(\d+) failed/);
  console.log(`Failed: ${fail ? fail[1] : 'see npm test'}`);
}
console.log('');

// Build
console.log('Build');
console.log('-----');
try {
  execSync('npx tsc --noEmit && npx vite build > /dev/null 2>&1', { stdio: 'ignore' });
  console.log('Status: PASS');
} catch {
  console.log('Status: FAIL');
}
console.log('');

console.log('Known Issues');
console.log('------------');
console.log(`Logged:  ${issues.total}`);
console.log(`Open:    ${issues.openTotal}`);
for (const [sev, n] of Object.entries(issues.bySeverity)) {
  console.log(`${sev.padEnd(8)} ${n}`);
}
console.log('');
console.log('Current Task');
console.log('------------');
console.log('See BUILD_STATUS.md (Current Task section).');
console.log('');
console.log('Next Task');
console.log('---------');
console.log('See NEXT_TASKS.md.');
console.log('========================================');