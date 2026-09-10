import { describe, expect, it } from 'vitest';
import { buildBackup, parseBackup, countRecords, backupFileName, EMPTY_BACKUP_DATA, BACKUP_VERSION } from './backup';
import type { BackupPayload } from './types';

describe('buildBackup / parseBackup', () => {
  it('round-trips a payload', () => {
    const data = {
      ...EMPTY_BACKUP_DATA,
      accounts: [{ id: 'a1', name: 'Checking' } as never],
      transactions: [{ id: 't1', merchant: 'X' } as never],
    };
    const backup = buildBackup(data, '0.1.0');
    expect(backup.format).toBe('ledgerly-backup');
    expect(backup.version).toBe(BACKUP_VERSION);
    expect(backup.exportedAt).toBeTruthy();

    const parsed = parseBackup(JSON.parse(JSON.stringify(backup)));
    expect(parsed.ok).toBe(true);
    expect(parsed.payload?.data.accounts).toHaveLength(1);
    expect(parsed.payload?.data.transactions).toHaveLength(1);
  });

  it('rejects non-backup JSON', () => {
    expect(parseBackup({ hello: 'world' }).ok).toBe(false);
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup(null).ok).toBe(false);
  });

  it('rejects unsupported versions', () => {
    const bad = { format: 'ledgerly-backup', version: 99, data: {} };
    const result = parseBackup(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('version');
  });

  it('rejects missing collections', () => {
    const bad = { format: 'ledgerly-backup', version: 1, data: { accounts: [] } };
    const result = parseBackup(bad);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('collection');
  });

  it('accepts v1 backups', () => {
    const payload: BackupPayload = {
      format: 'ledgerly-backup',
      version: 1,
      exportedAt: '2024-01-01',
      appVersion: '0.1.0',
      data: { ...EMPTY_BACKUP_DATA },
    };
    expect(parseBackup(payload).ok).toBe(true);
  });
});

describe('countRecords', () => {
  it('counts collections', () => {
    const data = {
      ...EMPTY_BACKUP_DATA,
      accounts: [1, 2] as never,
      transactions: [1, 2, 3] as never,
    };
    const counts = countRecords(data);
    expect(counts.accounts).toBe(2);
    expect(counts.transactions).toBe(3);
  });
});

describe('backupFileName', () => {
  it('generates a dated filename', () => {
    const name = backupFileName(new Date('2026-09-10'));
    expect(name).toBe(`ledgerly-backup-v${BACKUP_VERSION}-2026-09-10.json`);
  });
});