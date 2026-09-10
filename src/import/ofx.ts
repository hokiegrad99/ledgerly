/**
 * OFX / QFX parsing.
 *
 * OFX and QFX files are SGML-ish text. We parse the statement transaction
 * blocks (`<STMTTRN>...</STMTTRN>`) plus account / institution info.
 * Handles `<OFX>` (OFX 1.x SGML style, which QFX also uses).
 */
import { parseDate } from '../lib/dates';

export interface OfxTransaction {
  fitid: string;
  date: string; // YYYY-MM-DD
  amount: number; // cents
  name: string;
  memo: string;
  type: string;
  checkNum?: string;
}

export interface OfxAccountInfo {
  accountId?: string;
  institution?: string;
  bankId?: string;
  accountType?: string;
  currency?: string;
  balance?: number;
  balanceDate?: string;
}

export interface OfxParseResult {
  ok: boolean;
  error?: string;
  transactions: OfxTransaction[];
  account: OfxAccountInfo;
  /** The raw `fiid` values, in order (for duplicate detection). */
  fitids: string[];
}

/** Extract the raw content between <TAG> and </TAG> (or <TAG>VALUE for self-closed). */
function extractTag(content: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i');
  const m = content.match(re);
  if (m) return m[1].trim();
  const re2 = new RegExp(`<${tag}>([^<]*)`, 'i');
  const m2 = content.match(re2);
  return m2 ? m2[1].trim() : undefined;
}

/** Parse an OFX date: 20240910120000.000 followed by a timezone suffix, or 20240910. */
export function parseOfxDate(value: string | undefined | null): string | null {
  if (!value) return null;
  const s = value.trim();
  // Take the date portion only (before any timezone suffix such as `-5:EST` in brackets).
  const cleaned = s.split('[')[0];
  const m = cleaned.match(/^(\d{4})(\d{2})(\d{2})(?:(\d{2})(\d{2})(\d{2}))?(?:\.(\d+))?$/);
  if (!m) {
    // Try plain ISO date.
    return parseDate(s);
  }
  const [, y, mo, d] = m;
  const date = `${y}-${mo}-${d}`;
  const parsed = parseDate(date);
  if (parsed) return parsed;
  // Validate day range.
  const day = Number(d);
  const month = Number(mo);
  if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return `${y}-${mo}-${d}`;
  return null;
}

/** Parse amount like "-1234.56" or "1234.56" into cents. */
export function parseOfxAmount(value: string | undefined | null): number | null {
  if (!value) return null;
  const num = Number(value.trim());
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

export function parseOfx(text: string): OfxParseResult {
  let content = text;
  if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
  content = content.replace(/^<\?xml[\s\S]*?\?>/i, '');

  // QFX files sometimes wrap OFX in a header + <OFX>...</OFX>. Strip headers.
  const ofxMatch = content.match(/<OFX>([\s\S]*?)<\/OFX>/i);
  if (ofxMatch) content = ofxMatch[1];

  const transactionBlocks = content.match(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi) ?? [];

  const transactions: OfxTransaction[] = [];
  const fitids: string[] = [];

  for (const block of transactionBlocks) {
    const fitid = extractTag(block, 'FITID') ?? '';
    const rawDate = extractTag(block, 'DTPOSTED') ?? extractTag(block, 'DTUSER') ?? '';
    const date = parseOfxDate(rawDate);
    const amount = parseOfxAmount(extractTag(block, 'TRNAMT'));
    const name = extractTag(block, 'NAME') ?? extractTag(block, 'PAYEE') ?? '';
    const memo = extractTag(block, 'MEMO') ?? '';
    const type = extractTag(block, 'TRNTYPE') ?? 'OTHER';
    const checkNum = extractTag(block, 'CHECKNUM');

    if (!date || amount === null) continue;
    fitids.push(fitid);
    transactions.push({
      fitid,
      date,
      amount,
      name,
      memo,
      type,
      checkNum,
    });
  }

  if (transactions.length === 0 && !/STMTTRN/i.test(content)) {
    return {
      ok: false,
      error: 'No transactions were found in this file. It may not be a valid OFX/QFX statement.',
      transactions: [],
      account: {},
      fitids: [],
    };
  }

  const account: OfxAccountInfo = {
    accountId: extractTag(content, 'ACCTID'),
    institution: extractTag(content, 'ORG') ?? extractTag(content, 'NAME'),
    bankId: extractTag(content, 'BANKID'),
    accountType: extractTag(content, 'ACCTTYPE'),
    currency: extractTag(content, 'CURDEF'),
  };
  const balRaw = extractTag(content, 'BALAMT');
  if (balRaw) {
    account.balance = parseOfxAmount(balRaw) ?? undefined;
    account.balanceDate = parseOfxDate(extractTag(content, 'DTASOF')) ?? undefined;
  }

  return { ok: true, transactions, account, fitids };
}

/** Detect whether a file looks like OFX/QFX. */
export function looksLikeOfx(text: string): boolean {
  return /<OFX>|<STMTTRN>|<TRNAMT>/i.test(text.slice(0, 50000));
}