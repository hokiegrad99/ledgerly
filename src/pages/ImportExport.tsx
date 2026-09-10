import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import { PageHeader } from '../components/ui/PageHeader';
import { Button, Card, CardBody, Badge, Spinner } from '../components/ui/basic';
import { Field, Select } from '../components/ui/form';
import { ConfirmDialog } from '../components/ui/Modal';
import { FileUp, Database, Download, ShieldCheck, AlertTriangle, Upload } from 'lucide-react';
import { parseCsv, detectDelimiter, headerFingerprint } from '../import/csv';
import { parseOfx, looksLikeOfx } from '../import/ofx';
import { normalizeCsvRows, normalizeOfxTransactions, MAPPABLE_FIELDS, AMOUNT_FIELDS, type MappedField } from '../import/normalize';
import { findDuplicates } from '../domain/duplicates';
import { buildBackup, parseBackup, countRecords, backupFileName, type BackupData } from '../domain/backup';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/dates';
import { newId, nowISO } from '../lib/id';
import type { ImportMapping, Transaction } from '../domain/types';
import { applyRulesToTransaction } from '../domain/rules';

type Tab = 'csv' | 'qfx' | 'backup';

interface ImportOutcome {
  imported: number;
  skipped: number;
  message: string;
}

export default function ImportExportPage() {
  const [tab, setTab] = useState<Tab>('csv');

  return (
    <div>
      <PageHeader
        title="Import & Export"
        description="Bring in transactions from CSV, TSV, QFX, and OFX files — or back up and restore everything."
      />
      <div className="mb-4 flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" style={{ width: 'fit-content' }}>
        {([['csv', 'CSV / TSV'], ['qfx', 'QFX / OFX'], ['backup', 'Backup & restore']] as [Tab, string][]).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setTab(v)}
            className={`rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
              tab === v ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'csv' && <CsvWizard />}
      {tab === 'qfx' && <OfxWizard />}
      {tab === 'backup' && <BackupSection />}
    </div>
  );
}

// ------------------------------------------------------------------ CSV wizard

type Step = 'upload' | 'map' | 'preview' | 'done';

function CsvWizard() {
  const navigate = useNavigate();
  const { repo, accounts, categories, refresh, bumpTxn, categoryById } = useApp();
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [delimiter, setDelimiter] = useState(',');
  const [columnMap, setColumnMap] = useState<Record<string, MappedField>>({});
  const [dateFormat, setDateFormat] = useState('auto');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [mappingFp, setMappingFp] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const { importMappings } = useApp();

  const autoMap = useCallback((h: string[]) => {
    const map: Record<string, MappedField> = {};
    const lower = h.map((x) => x.toLowerCase().trim());
    const findCol = (patterns: string[]): string | undefined => {
      for (const p of patterns) {
        const idx = lower.findIndex((c) => c.includes(p));
        if (idx >= 0) return h[idx];
      }
      return undefined;
    };
    const date = findCol(['date', 'posted', 'transaction date', 'time']);
    const desc = findCol(['description', 'merchant', 'payee', 'name', 'memo', 'narrative', 'details']);
    const amount = findCol(['amount', 'value', 'sum']);
    const debit = findCol(['debit', 'withdrawal', 'outflow', 'payment', 'money out', 'charges']);
    const credit = findCol(['credit', 'deposit', 'inflow', 'money in']);
    const category = findCol(['category']);
    const account = findCol(['account']);
    const notes = findCol(['notes', 'comment']);
    const type = findCol(['type']);
    const ext = findCol(['fitid', 'id', 'reference', 'check number', 'checknum']);
    if (date) map[date] = 'date';
    if (desc) map[desc] = 'description';
    if (amount) map[amount] = 'amount';
    if (debit) map[debit] = 'debit';
    if (credit) map[credit] = 'credit';
    if (category) map[category] = 'category';
    if (account) map[account] = 'account';
    if (notes) map[notes] = 'notes';
    if (type) map[type] = 'type';
    if (ext) map[ext] = 'external-id';
    return map;
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      if (looksLikeOfx(text)) {
        setError('This looks like an OFX/QFX file. Use the QFX/OFX import tab instead.');
        return;
      }
      const parsed = parseCsv(text, { delimiter: detectDelimiter(text) });
      if (!parsed.header || parsed.rows.length === 0) {
        setError('Unable to parse this file. Make sure it has a header row and at least one data row.');
        return;
      }
      setHeader(parsed.header);
      setRows(parsed.rows);
      setDelimiter(parsed.delimiter);

      // Try to remember a previous mapping for this header shape.
      const fp = headerFingerprint(parsed.header);
      setMappingFp(fp);
      const saved = importMappings.find((m) => m.headerFingerprint === fp);
      if (saved) {
        setColumnMap(saved.columns as Record<string, MappedField>);
        if (saved.accountId) setAccountId(saved.accountId);
        if (saved.dateFormat) setDateFormat(saved.dateFormat);
      } else {
        setColumnMap(autoMap(parsed.header));
      }
      setStep('map');
    } catch (e) {
      setError('Unable to read this file. It may be corrupted or not a CSV/TSV file.');
    }
  };

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  const normalized = useMemo(() => {
    if (step !== 'preview') return [];
    const lookup = (name: string): string | null => {
      const cat = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return cat?.id ?? null;
    };
    const result = normalizeCsvRows({ accountId, columnMap, header, rows, categoryLookup: lookup });
    return result;
  }, [step, accountId, columnMap, header, rows, categories]);

  const duplicates = useMemo(() => {
    if (step !== 'preview') return null;
    return normalized;
  }, [step, normalized]);

  const goPreview = async () => {
    setError(null);
    if (!accountId) {
      setError('Select an account for this import.');
      return;
    }
    if (!Object.values(columnMap).includes('date')) {
      setError('Map the date column before continuing.');
      return;
    }
    if (!AMOUNT_FIELDS.some((f) => Object.values(columnMap).includes(f))) {
      setError('Map an amount column (amount, or debit/credit) before continuing.');
      return;
    }
    setStep('preview');
  };

  const confirmImport = async () => {
    setError(null);
    try {
      // Apply rules to each transaction.
      const withRules = normalized.map(({ transaction, rowIndex, error: e }) => {
        if (e) return { transaction, rowIndex, error: e };
        const catOf = (id: string | null) => (id ? categoryById(id) ?? null : null);
        const { txn } = applyRulesToTransaction(rulesRef.current, transaction, catOf);
        return { transaction: txn, rowIndex, error: e };
      });
      const valid = withRules.filter((r) => !r.error).map((r) => r.transaction);
      const parseErrors = withRules.filter((r) => r.error).length;

      // Duplicate check against existing transactions.
      const existing = await repo.getAllTransactions();
      const { matches } = findDuplicates(valid, existing);
      const dupIds = new Set(matches.map((m) => m.candidate.id));
      const fresh = valid.filter((t) => !dupIds.has(t.id));

      await repo.saveTransactions(fresh);
      await repo.saveImportSession({
        id: newId(),
        fileName,
        fileType: 'csv',
        accountId,
        mappingId: mappingFp,
        totalRows: valid.length,
        importedRows: fresh.length,
        skippedDuplicates: matches.length,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      // Remember the mapping.
      const fp = mappingFp || headerFingerprint(header);
      const existingMapping = importMappings.find((m) => m.headerFingerprint === fp);
      const mapping: ImportMapping = {
        id: existingMapping?.id ?? newId(),
        headerFingerprint: fp,
        institution: fileName.replace(/\.(csv|tsv|txt)$/i, ''),
        accountId,
        columns: columnMap,
        dateFormat,
        delimiter,
        lastUsed: nowISO().slice(0, 10),
        createdAt: existingMapping?.createdAt ?? nowISO(),
        updatedAt: nowISO(),
      };
      await repo.saveImportMapping(mapping);
      bumpTxn();
      await refresh();
      setOutcome({
        imported: fresh.length,
        skipped: matches.length + parseErrors,
        message: `Imported ${fresh.length} transactions. Skipped ${matches.length} duplicates and ${parseErrors} unparseable rows.`,
      });
      setStep('done');
    } catch (e) {
      setError('Import failed. Your data was not changed. Please try again.');
    }
  };

  const { rules } = useApp();
  const rulesRef = useRef(rules);
  rulesRef.current = rules;

  const reset = () => {
    setStep('upload');
    setFileName('');
    setHeader([]);
    setRows([]);
    setColumnMap({});
    setOutcome(null);
    setError(null);
  };

  if (step === 'done' && outcome) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Import complete</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{outcome.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={reset}>Import another file</Button>
            <Button variant="primary" onClick={() => navigate('/transactions')}>View transactions</Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {step === 'upload' && (
        <Card>
          <CardBody>
            <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Upload a CSV or TSV statement</h3>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Your file stays in your browser — nothing is uploaded to any server. Supported: CSV, TSV, quoted fields, UTF-8, most date and number formats.
            </p>
            <div
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/20"
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click(); }}
              role="button"
              tabIndex={0}
              aria-label="Upload CSV file"
            >
              <FileUp className="mb-2 h-8 w-8 text-slate-400" />
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Click to choose a file</span>
              <span className="mt-1 text-xs text-slate-400">.csv, .tsv, .txt — up to 20 MB</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
              }}
            />
            {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Privacy: file parsing happens entirely on this device.
            </p>
          </CardBody>
        </Card>
      )}

      {step === 'map' && (
        <>
          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Map columns — {fileName}</h3>
                <Badge tone="blue">{rows.length} data rows</Badge>
                <Badge tone="neutral">Delimiter: {delimiter === '\t' ? 'tab' : delimiter}</Badge>
                {mappingFp && importMappings.some((m) => m.headerFingerprint === mappingFp) && <Badge tone="green">Saved mapping applied</Badge>}
              </div>
              <Field label="Import into account" className="mb-4 max-w-sm">
                <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">Select an account…</option>
                  {accounts.filter((a) => a.active).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </Select>
              </Field>
              <div className="mb-3 overflow-x-auto">
                <table className="table-base min-w-[600px]">
                  <thead>
                    <tr>
                      <th className="w-40">CSV column</th>
                      <th>Maps to</th>
                      <th>Preview (first 3 rows)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {header.map((col, i) => (
                      <tr key={i}>
                        <td className="text-sm font-medium text-slate-900 dark:text-slate-100">{col}</td>
                        <td>
                          <Select
                            className="w-56"
                            value={columnMap[col] ?? ''}
                            onChange={(e) => setColumnMap((m) => ({ ...m, [col]: e.target.value as MappedField }))}
                            aria-label={`Map column ${col}`}
                          >
                            <option value="">— Skip —</option>
                            {MAPPABLE_FIELDS.map((f) => (
                              <option key={f.value} value={f.value}>{f.label}</option>
                            ))}
                          </Select>
                        </td>
                        <td className="max-w-[300px] truncate text-xs text-slate-500 dark:text-slate-400">
                          {preview.map((r, ri) => (
                            <div key={ri}>{r[i] ?? ''}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {Object.values(columnMap).includes('date') ? '✓ Date mapped' : '✗ Date not mapped'} ·{' '}
                  {AMOUNT_FIELDS.some((f) => Object.values(columnMap).includes(f)) ? '✓ Amount mapped' : '✗ Amount not mapped'}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={reset}>Cancel</Button>
                  <Button variant="primary" onClick={() => void goPreview()}>Preview import</Button>
                </div>
              </div>
              {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Raw data preview</h4>
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead>
                    <tr>{header.map((h, i) => <th key={i}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, ri) => (
                      <tr key={ri}>{r.map((c, ci) => <td key={ci} className="text-xs">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {step === 'preview' && (
        <>
          <Card>
            <CardBody>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Preview normalized transactions</h3>
                <Badge tone="blue">{normalized.filter((n) => !n.error).length} valid</Badge>
                <Badge tone="red">{normalized.filter((n) => n.error).length} unparseable</Badge>
              </div>
              <div className="mb-4 overflow-x-auto">
                <table className="table-base min-w-[640px]">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Date</th>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th className="text-right">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {normalized.slice(0, 20).map(({ rowIndex, transaction, error: e }) => (
                      <tr key={rowIndex}>
                        <td className="text-xs text-slate-400">#{rowIndex + 1}</td>
                        <td className="whitespace-nowrap text-xs">{formatDate(transaction.date)}</td>
                        <td className="max-w-[240px] truncate text-sm">{transaction.merchant}</td>
                        <td className="whitespace-nowrap text-xs">{transaction.categoryId ? categoryById(transaction.categoryId)?.name : '—'}</td>
                        <td className={`whitespace-nowrap text-right text-sm font-semibold ${transaction.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                          {formatMoney(transaction.amount)}
                        </td>
                        <td>{e ? <Badge tone="red">{e}</Badge> : <Badge tone="green">OK</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {normalized.length > 20 && <p className="mt-2 text-xs text-slate-400">Showing first 20 of {normalized.length} rows.</p>}
              </div>
              {duplicates && <DuplicateWarnings candidates={normalized} />}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep('map')}>Back to mapping</Button>
                <Button variant="primary" onClick={() => void confirmImport()}>
                  Import {normalized.filter((n) => !n.error).length} transactions
                </Button>
              </div>
              {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}

/** Shows duplicate candidates with skip/import decisions during preview. */
function DuplicateWarnings({ candidates }: { candidates: { rowIndex: number; transaction: Transaction; error?: string }[] }) {
  const { repo } = useApp();
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof findDuplicates>> | null>(null);
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const existing = await repo.getAllTransactions();
      const res = findDuplicates(candidates.filter((c) => !c.error).map((c) => c.transaction), existing);
      if (!cancelled) {
        setMatches(res);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  if (loading) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        <Spinner className="h-4 w-4" /> Checking for duplicates…
      </div>
    );
  }
  if (!matches) return null;
  if (matches.matches.length === 0) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
        <ShieldCheck className="h-4 w-4" /> No duplicates found. All {matches.cleanCount} transactions are new.
      </div>
    );
  }
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/40">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4" /> {matches.matches.length} possible duplicate(s) detected — these will be skipped
      </div>
      <div className="max-h-40 overflow-y-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Incoming</th>
              <th>Matches existing</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {matches.matches.slice(0, 20).map((m, i) => (
              <tr key={i}>
                <td className="text-xs">{formatDate(m.candidate.date)} · {m.candidate.merchant} · {formatMoney(m.candidate.amount)}</td>
                <td className="text-xs">{formatDate(m.existing.date)} · {m.existing.merchant} · {formatMoney(m.existing.amount)}</td>
                <td><Badge tone="amber">{m.reason}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ OFX wizard

function OfxWizard() {
  const { repo, accounts, refresh, bumpTxn, categoryById, rules: rulesList } = useApp();
  const [fileName, setFileName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [parsed, setParsed] = useState<ReturnType<typeof parseOfx> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const rulesRef = useRef(rulesList);
  rulesRef.current = rulesList;

  const handleFile = async (file: File) => {
    setError(null);
    setOutcome(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const result = parseOfx(text);
      if (!result.ok) {
        setError(result.error ?? 'Could not parse this OFX/QFX file.');
        return;
      }
      // Try to auto-select the account by matching institution/account id.
      const match = accounts.find((a) => {
        const norm = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        return result.account.accountId && a.lastFour && norm(result.account.accountId).includes(norm(a.lastFour)) ||
          (result.account.institution && norm(a.institution).includes(norm(result.account.institution)));
      });
      setParsed(result);
      if (match) setAccountId(match.id);
    } catch {
      setError('Unable to read this file. It may not be a valid OFX/QFX statement.');
    }
  };

  const confirmImport = async () => {
    if (!parsed || !accountId) {
      setError('Select an account for this import.');
      return;
    }
    try {
      const txns = normalizeOfxTransactions(parsed.transactions, accountId).map((t) => {
        const catOf = (id: string | null) => (id ? categoryById(id) ?? null : null);
        const { txn } = applyRulesToTransaction(rulesRef.current, t, catOf);
        return txn;
      });
      const existing = await repo.getAllTransactions();
      const { matches } = findDuplicates(txns, existing);
      const dupIds = new Set(matches.map((m) => m.candidate.id));
      const fresh = txns.filter((t) => !dupIds.has(t.id));
      await repo.saveTransactions(fresh);
      await repo.saveImportSession({
        id: newId(),
        fileName,
        fileType: 'qfx',
        accountId,
        mappingId: null,
        totalRows: txns.length,
        importedRows: fresh.length,
        skippedDuplicates: matches.length,
        createdAt: nowISO(),
        updatedAt: nowISO(),
      });
      bumpTxn();
      await refresh();
      setOutcome({ imported: fresh.length, skipped: matches.length, message: `Imported ${fresh.length} transactions. Skipped ${matches.length} duplicates (matched by FITID or transaction details).` });
    } catch {
      setError('Import failed. Your data was not changed.');
    }
  };

  if (outcome) {
    return (
      <Card>
        <CardBody className="py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Import complete</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{outcome.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => { setOutcome(null); setParsed(null); setFileName(''); }}>Import another file</Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Upload a QFX or OFX statement</h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Parsed locally. FITIDs are preserved so re-importing the same statement never creates duplicates.
          </p>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/20"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Upload QFX or OFX file"
          >
            <FileUp className="mb-2 h-8 w-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Click to choose a file</span>
            <span className="mt-1 text-xs text-slate-400">.qfx, .ofx — up to 20 MB</span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".qfx,.ofx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{error}</p>}
        </CardBody>
      </Card>

      {parsed && (
        <Card>
          <CardBody>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{fileName}</h3>
              <Badge tone="blue">{parsed.transactions.length} transactions found</Badge>
              {parsed.account.institution && <Badge tone="neutral">{parsed.account.institution}</Badge>}
              {parsed.account.accountId && <Badge tone="neutral">Acct {parsed.account.accountId}</Badge>}
            </div>
            <Field label="Import into account" className="mb-4 max-w-sm">
              <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">Select an account…</option>
                {accounts.filter((a) => a.active).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <div className="mb-4 max-h-80 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
              <table className="table-base min-w-[560px]">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Name</th>
                    <th>Memo</th>
                    <th className="text-right">Amount</th>
                    <th>FITID</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.transactions.slice(0, 50).map((t, i) => (
                    <tr key={i}>
                      <td className="whitespace-nowrap text-xs">{formatDate(t.date)}</td>
                      <td className="max-w-[200px] truncate text-sm">{t.name}</td>
                      <td className="max-w-[160px] truncate text-xs text-slate-500">{t.memo}</td>
                      <td className={`whitespace-nowrap text-right text-sm font-semibold ${t.amount < 0 ? 'text-slate-900 dark:text-slate-100' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatMoney(t.amount)}
                      </td>
                      <td className="max-w-[120px] truncate font-mono text-[10px] text-slate-400">{t.fitid}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsed.transactions.length > 50 && <p className="p-2 text-xs text-slate-400">Showing first 50 of {parsed.transactions.length}.</p>}
            </div>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => void confirmImport()}>Import {parsed.transactions.length} transactions</Button>
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Backup

function BackupSection() {
  const { repo, refresh } = useApp();
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<ReturnType<typeof parseBackup> | null>(null);
  const [mode, setMode] = useState<'replace' | 'merge'>('replace');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreDone, setRestoreDone] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [stats, setStats] = useState<{ transactionCount: number; accountCount: number; categoryCount: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    (async () => setStats(await repo.stats()))();
  }, [repo]);

  const doBackup = async () => {
    const data = await repo.exportAll();
    const payload = buildBackup(data, '0.1.0');
    const text = JSON.stringify(payload, null, 2);
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = backupFileName();
    a.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
    setTimeout(() => setBackupDone(false), 3000);
  };

  const handleRestoreFile = async (file: File) => {
    setRestoreFile(file);
    setParseResult(null);
    setRestoreDone(false);
    try {
      const text = await file.text();
      const result = parseBackup(JSON.parse(text));
      setParseResult(result);
    } catch {
      setParseResult({ ok: false, error: 'This file is not valid JSON. Choose a Ledgerly backup file (ledgerly-backup-v1.json).' });
    }
  };

  const doRestore = async () => {
    if (!parseResult?.ok || !parseResult.payload) return;
    setRestoring(true);
    try {
      const data = parseResult.payload.data as BackupData;
      await repo.importAll(data, { replace: mode === 'replace' });
      await refresh();
      setRestoreDone(true);
      setStats(await repo.stats());
    } catch {
      setParseResult({ ok: false, error: 'Restore failed. Your existing data was not modified.' });
    } finally {
      setRestoring(false);
      setConfirmOpen(false);
    }
  };

  const counts = parseResult?.ok && parseResult.payload ? countRecords(parseResult.payload.data as BackupData) : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardBody>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Download className="h-4 w-4 text-brand-500" /> Back up my data
          </h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Download a portable, versioned JSON backup containing everything: accounts, transactions, budgets, goals, rules, investments, settings, and more. Passwords are never included (there are none in local mode).
          </p>
          {stats && (
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                <div className="text-lg font-semibold">{stats.transactionCount.toLocaleString()}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Transactions</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                <div className="text-lg font-semibold">{stats.accountCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Accounts</div>
              </div>
              <div className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
                <div className="text-lg font-semibold">{stats.categoryCount}</div>
                <div className="text-[10px] uppercase tracking-wide text-slate-400">Categories</div>
              </div>
            </div>
          )}
          <Button variant="primary" icon={<Download className="h-4 w-4" />} onClick={() => void doBackup()}>
            {backupDone ? 'Backup downloaded ✓' : 'Backup my data'}
          </Button>
          <p className="mt-3 text-xs text-slate-400">Format: <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">ledgerly-backup-v1.json</code> (versioned for future migration).</p>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Upload className="h-4 w-4 text-brand-500" /> Restore from backup
          </h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Restore a previously downloaded backup. You can replace all current data or merge (existing records are kept, new records are added).
          </p>
          <div
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-6 text-center transition-colors hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500 dark:hover:bg-brand-900/20"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            aria-label="Choose backup file"
          >
            <Database className="mb-2 h-7 w-7 text-slate-400" />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{restoreFile ? restoreFile.name : 'Choose a backup file'}</span>
          </div>
          <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleRestoreFile(f); }} />

          {parseResult && !parseResult.ok && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">{parseResult.error}</p>
          )}
          {parseResult?.ok && parseResult.payload && counts && (
            <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge tone="green">Valid backup</Badge>
                <Badge tone="blue">v{parseResult.payload.version}</Badge>
                <span className="text-xs text-slate-400">Exported {parseResult.payload.exportedAt.slice(0, 10)}</span>
              </div>
              <div className="grid grid-cols-4 gap-1 text-center text-xs">
                <div className="rounded bg-slate-50 p-1.5 dark:bg-slate-800"><div className="font-semibold">{counts.accounts}</div><div className="text-slate-400">Accounts</div></div>
                <div className="rounded bg-slate-50 p-1.5 dark:bg-slate-800"><div className="font-semibold">{counts.transactions}</div><div className="text-slate-400">Transactions</div></div>
                <div className="rounded bg-slate-50 p-1.5 dark:bg-slate-800"><div className="font-semibold">{counts.categories}</div><div className="text-slate-400">Categories</div></div>
                <div className="rounded bg-slate-50 p-1.5 dark:bg-slate-800"><div className="font-semibold">{counts.goals}</div><div className="text-slate-400">Goals</div></div>
              </div>
              <div className="mt-3 space-y-2">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} className="h-4 w-4" />
                  Replace all current data <span className="text-xs text-slate-400">(everything will be overwritten)</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <input type="radio" checked={mode === 'merge'} onChange={() => setMode('merge')} className="h-4 w-4" />
                  Merge with current data <span className="text-xs text-slate-400">(keeps existing records, adds new ones)</span>
                </label>
              </div>
              <Button
                variant="primary"
                className="mt-3"
                disabled={restoring}
                onClick={() => setConfirmOpen(true)}
              >
                {restoring ? 'Restoring…' : 'Restore backup'}
              </Button>
              {restoreDone && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">Restore complete — all data recovered. ✓</p>}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doRestore}
        danger={mode === 'replace'}
        title="Restore this backup?"
        confirmLabel="Restore"
        message={
          mode === 'replace' ? (
            <span>
              <strong>Replace mode:</strong> all current data will be deleted and replaced with the backup contents. This cannot be undone — export a backup of your current data first if you&apos;re unsure.
            </span>
          ) : (
            <span>
              <strong>Merge mode:</strong> records from the backup will be added where they don&apos;t already exist. No current data will be removed.
            </span>
          )
        }
      />
    </div>
  );
}