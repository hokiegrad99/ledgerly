/**
 * CSV / TSV parsing.
 *
 * Handles quoted fields, embedded delimiters/newlines, UTF-8 (with BOM),
 * and delimiter auto-detection (comma, tab, semicolon, pipe).
 */
import { fnv1a } from '../lib/id';

export const DELIMITERS = [',', '\t', ';', '|'] as const;
export type Delimiter = (typeof DELIMITERS)[number];

export interface CsvParseResult {
  /** Raw rows, header excluded (or included if noHeader). */
  rows: string[][];
  header: string[] | null;
  delimiter: Delimiter;
  /** 0-based index of the detected header row. */
  headerRowIndex: number;
}

/** Split a single CSV line into fields, honoring quotes. */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === delimiter) {
      fields.push(field);
      field = '';
      i++;
      continue;
    }
    field += ch;
    i++;
  }
  fields.push(field);
  return fields;
}

/** Detect the most likely delimiter by counting delimiter occurrences in the first lines. */
export function detectDelimiter(text: string): Delimiter {
  const sample = text.slice(0, 4000);
  let best: Delimiter = ',';
  let bestScore = -1;
  for (const d of DELIMITERS) {
    let score = 0;
    for (const line of sample.split(/\r?\n/).slice(0, 8)) {
      // Rough check: quoted lines complicate counting; count outside quotes.
      const count = countDelimitersOutsideQuotes(line, d);
      if (count > 1) score += count;
    }
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return bestScore > 0 ? best : ',';
}

function countDelimitersOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === delimiter && !inQuotes) count++;
  }
  return count;
}

/** Parse CSV/TSV text into rows. Handles quoted multi-line fields. */
export function parseCsv(text: string, opts: { delimiter?: Delimiter; header?: boolean } = {}): CsvParseResult {
  let content = text;
  // Strip UTF-8 BOM.
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  const delimiter = opts.delimiter ?? detectDelimiter(content);
  const rawLines = content.split(/\r?\n/);
  const rows: string[][] = [];
  let current: string[] | null = null;
  let pendingField = '';
  let inQuotes = false;

  for (const line of rawLines) {
    let field = pendingField;
    pendingField = '';
    let i = 0;
    while (i < line.length) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i + 1] === '"') {
            field += '"';
            i += 2;
            continue;
          }
          inQuotes = false;
          i++;
          continue;
        }
        field += ch;
        i++;
        continue;
      }
      if (ch === '"') {
        inQuotes = true;
        i++;
        continue;
      }
      if (ch === delimiter) {
        if (current === null) current = [];
        current.push(field);
        field = '';
        i++;
        continue;
      }
      field += ch;
      i++;
    }
    if (inQuotes) {
      // Field continues on the next line.
      pendingField = field + '\n';
      if (current === null) current = [];
    } else {
      if (current === null) current = [];
      current.push(field);
      rows.push(current);
      current = null;
    }
  }
  if (current && pendingField) current.push(pendingField.replace(/\n$/, ''));
  if (current && current.length > 0 && !rows.includes(current)) rows.push(current);

  // Trim empty trailing rows.
  while (rows.length > 0 && rows[rows.length - 1].every((f) => f.trim() === '')) rows.pop();

  let header: string[] | null = null;
  let headerRowIndex = 0;
  if (opts.header !== false) {
    // Find the header row: first row that isn't mostly empty and doesn't look like data.
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      const row = rows[i];
      const nonEmpty = row.filter((f) => f.trim() !== '');
      if (nonEmpty.length === 0) continue;
      // Header heuristic: contains alphabetic text in most cells, low numeric ratio.
      const alphaCells = row.filter((f) => /[A-Za-z]/.test(f)).length;
      if (alphaCells >= Math.max(1, Math.floor(row.length / 2))) {
        header = row.map((f) => f.trim());
        headerRowIndex = i;
        break;
      }
      headerRowIndex = i;
      break;
    }
  }
  const dataRows = header ? rows.slice(headerRowIndex + 1) : rows;
  // Drop fully-empty rows.
  const clean = dataRows.filter((r) => r.some((f) => f.trim() !== ''));
  return { rows: clean, header, delimiter, headerRowIndex };
}

/** Fingerprint a header row so import mappings can be remembered. */
export function headerFingerprint(header: string[]): string {
  return fnv1a(header.map((h) => h.toLowerCase().trim()).join('|'));
}

/** Unique column names for mapping UI (de-duplicate same names). */
export function uniqueColumns(header: string[]): string[] {
  const seen = new Map<string, number>();
  return header.map((h) => {
    const base = h.trim();
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return n === 0 ? base : `${base} (${n + 1})`;
  });
}