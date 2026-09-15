/**
 * Report PDF export.
 *
 * Layout is produced by a small dependency-free builder (`buildPdf`) so the
 * geometry (pagination, column widths, text wrapping) is unit-testable; jsPDF
 * is only loaded lazily at export time (`exportReportPdf`) and never in tests.
 *
 * Charts (the Monarch-style Sankey) are rasterized from their live SVG via
 * `svgToPngDataUrl` and embedded as images. Rasterization needs real canvas +
 * image decoding, so it degrades gracefully: if it fails, the PDF is still
 * produced with the report's data table instead of the diagram.
 *
 * Fonts: PDF core fonts have no Unicode metrics, so non-WinAnsi characters
 * (e.g. "€" in some currency formats, "—" em dashes) are transliterated to
 * their closest ASCII equivalents before measurement and drawing.
 */
import { formatMoneyPlain } from './money';

// ---------------------------------------------------------------------------
// Small shared helpers
// ---------------------------------------------------------------------------

const ASCII_FALLBACKS: Record<string, string> = {
  '\u2014': '-', '\u2013': '-', '\u2018': "'", '\u2019': "'",
  '\u201c': '"', '\u201d': '"', '\u2026': '...', '\u00a0': ' ',
  '\u2212': '-', '\u00b7': '*', '\u2022': '*', '\u2192': '->',
  '\u20ac': 'EUR', '\u00a3': 'GBP', '\u00a5': 'JPY', '\u20b9': 'INR',
};

/** Make a string safe for PDF core-font drawing (WinAnsi + fallbacks). */
export function pdfSafeText(s: string): string {
  let out = '';
  for (const ch of s ?? '') {
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 32 && code <= 255) out += ch;
    else if (ASCII_FALLBACKS[ch] !== undefined) out += ASCII_FALLBACKS[ch];
    else if (code === 10 || code === 13) out += ' ';
    else out += '?';
  }
  return out;
}

/** Parse a CSS color to RGB (hex only is used by the app's charts). */
export function parseColor(color: string | null | undefined): [number, number, number] | null {
  if (!color) return null;
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const s = /^#([0-9a-f]{3})$/i.exec(color.trim());
  if (s) {
    const [r, g, b] = s[1].split('').map((c) => parseInt(c + c, 16));
    return [r, g, b];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Core-font metrics (Helvetica / Helvetica-Bold, WinAnsi widths in 1/1000 em)
// ---------------------------------------------------------------------------

/** Helvetica regular widths for char codes 32..255. */
const HELVregular: number[] = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 350,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
];
/** Helvetica-Bold widths for char codes 32..255. */
const HELVbold: number[] = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 350,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
];

export interface SimplePdfFonts {
  width(text: string, size: number, bold?: boolean): number;
}

/** WinAnsi Helvetica metrics for text measurement (no font file needed). */
export const simplePdfFonts: SimplePdfFonts = {
  width(text: string, size: number, bold = false): number {
    const table = bold ? HELVbold : HELVregular;
    let units = 0;
    for (const ch of pdfSafeText(text)) {
      const code = ch.codePointAt(0) ?? 32;
      units += code >= 32 && code <= 255 ? table[code - 32] : 500;
    }
    return (units / 1000) * size;
  },
};

export function measurePdfText(text: string, size: number, bold = false): number {
  return simplePdfFonts.width(text, size, bold);
}

/** Wrap text to a pixel/pt width; breaks on spaces, hard-splits long words. */
export function wrapPdfText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const paragraphs = pdfSafeText(text).split('\n');
  const lines: string[] = [];
  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (simplePdfFonts.width(candidate, size, bold) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (simplePdfFonts.width(word, size, bold) <= maxWidth) {
        line = word;
      } else {
        // Hard-split a word longer than the line.
        let chunk = '';
        for (const ch of word) {
          if (simplePdfFonts.width(chunk + ch, size, bold) > maxWidth && chunk) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk += ch;
          }
        }
        line = chunk;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length > 0 ? lines : [''];
}

// ---------------------------------------------------------------------------
// Minimal document interface (implemented by jsPDF; stubbed in tests)
// ---------------------------------------------------------------------------

export interface PdfLikeDoc {
  setFontSize(size: number): void;
  setFont(name: string, style: string): void;
  setTextColor(r: number, g: number, b: number): void;
  setFillColor(r: number, g: number, b: number): void;
  setDrawColor(r: number, g: number, b: number): void;
  text(text: string, x: number, y: number, opts?: { baseline?: 'top' | 'middle' | 'bottom' }): void;
  rect(x: number, y: number, w: number, h: number, style?: 'F' | 'S' | 'FD'): void;
  line(x1: number, y1: number, x2: number, y2: number): void;
  addImage(dataUrl: string, format: string, x: number, y: number, w: number, h: number): void;
  addPage(): void;
  setPage(page: number): void;
  getNumberOfPages(): number;
  output(type: 'arraybuffer'): ArrayBuffer;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
}

export interface PdfDocFactory {
  (opts: { orientation: 'p' | 'l'; unit: 'pt'; format: 'a4' }): PdfLikeDoc;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export type PdfTableCell = { text: string; color?: string };

export type PdfSection =
  | { kind: 'note'; text: string }
  | { kind: 'summary'; cards: { label: string; value: string; color?: string }[] }
  | { kind: 'table'; title?: string; headers: string[]; align?: ('left' | 'right')[]; rows: PdfTableCell[][]; note?: string }
  | { kind: 'chart'; title?: string; dataUrl: string; width: number; height: number; note?: string };

export interface PdfInput {
  title: string;
  subtitle?: string;
  /** Rendered as a wrapped paragraph under the title (filters, range, …). */
  meta?: string;
  sections: PdfSection[];
  createDoc: PdfDocFactory;
  fonts?: SimplePdfFonts;
}

const PAGE_MARGIN_X = 40;
const PAGE_TOP = 46;
const PAGE_BOTTOM = 46;
const COLORS = {
  text: [15, 23, 42] as [number, number, number],
  subtle: [100, 116, 139] as [number, number, number],
  faint: [148, 163, 184] as [number, number, number],
  chipBg: [248, 250, 252] as [number, number, number],
  chipBorder: [226, 232, 240] as [number, number, number],
  headBg: [241, 245, 249] as [number, number, number],
  zebra: [249, 250, 251] as [number, number, number],
  line: [226, 232, 240] as [number, number, number],
};

/** Build the whole report PDF. Pure apart from the injected document factory. */
export function buildPdf(input: PdfInput): { doc: PdfLikeDoc; pageCount: number } {
  const fonts = input.fonts ?? simplePdfFonts;
  const doc = input.createDoc({ orientation: 'p', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const contentW = pageW - PAGE_MARGIN_X * 2;

  let y = PAGE_TOP;

  const ensure = (needed: number): void => {
    if (y + needed > pageH - PAGE_BOTTOM) {
      doc.addPage();
      y = PAGE_TOP;
    }
  };

  // Header: title + optional subtitle.
  doc.setTextColor(...COLORS.text);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(pdfSafeText(input.title), PAGE_MARGIN_X, y, { baseline: 'top' });
  y += 20;
  if (input.subtitle) {
    doc.setTextColor(...COLORS.subtle);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.text(pdfSafeText(input.subtitle), PAGE_MARGIN_X, y, { baseline: 'top' });
    y += 13;
  }
  if (input.meta) {
    doc.setTextColor(...COLORS.subtle);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (const line of wrapPdfText(input.meta, 8.5, contentW).slice(0, 4)) {
      ensure(11);
      doc.text(line, PAGE_MARGIN_X, y, { baseline: 'top' });
      y += 11;
    }
    y += 4;
  }
  y += 2;

  for (const section of input.sections) {
    if (section.kind === 'note') {
      const lines = wrapPdfText(section.text, 9, contentW);
      ensure(lines.length * 12 + 4);
      doc.setTextColor(...COLORS.subtle);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      for (const line of lines) {
        doc.text(line, PAGE_MARGIN_X, y, { baseline: 'top' });
        y += 12;
      }
      y += 4;
      continue;
    }

    if (section.kind === 'summary') {
      const cards = section.cards.filter((c) => c.value !== '');
      if (cards.length === 0) continue;
      const gap = 10;
      const cardW = (contentW - gap * 2) / 3;
      const cardH = 36;
      for (let i = 0; i < cards.length; i += 3) {
        ensure(cardH + 6);
        const row = cards.slice(i, i + 3);
        row.forEach((card, j) => {
          const x = PAGE_MARGIN_X + j * (cardW + gap);
          doc.setFillColor(...COLORS.chipBg);
          doc.rect(x, y, cardW, cardH, 'F');
          doc.setDrawColor(...COLORS.chipBorder);
          doc.rect(x, y, cardW, cardH, 'S');
          doc.setTextColor(...COLORS.subtle);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.text(pdfSafeText(card.label.toUpperCase()), x + 8, y + 8, { baseline: 'top' });
          const rgb = parseColor(card.color) ?? COLORS.text;
          doc.setTextColor(...rgb);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(11);
          doc.text(pdfSafeText(card.value), x + 8, y + 19, { baseline: 'top' });
        });
        y += cardH + 6;
      }
      y += 2;
      continue;
    }

    if (section.kind === 'table') {
      if (section.rows.length === 0) continue;
      if (section.title) {
        ensure(20);
        doc.setTextColor(...COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(pdfSafeText(section.title), PAGE_MARGIN_X, y, { baseline: 'top' });
        y += 15;
      }
      if (section.note) {
        doc.setTextColor(...COLORS.subtle);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const line of wrapPdfText(section.note, 8, contentW)) {
          ensure(10);
          doc.text(line, PAGE_MARGIN_X, y, { baseline: 'top' });
          y += 10;
        }
      }

      // Column widths: first (label) column is flexible, numeric columns share
      // the rest equally, honoring the widest amount header.
      const cols = section.headers.length;
      const restW = Math.max(contentW - 190, 0);
      const numW = cols > 1 ? Math.max(restW / (cols - 1), 58) : 0;
      const labelW = cols > 1 ? contentW - numW * (cols - 1) : contentW;
      const colW = (i: number) => (i === 0 ? labelW : numW);
      const align = (i: number) => section.align?.[i] ?? (i === 0 ? 'left' : 'right');

      const cellText = (cell: PdfTableCell | undefined): string => pdfSafeText(cell?.text ?? '');
      const drawCell = (cell: PdfTableCell | undefined, i: number, x: number, cy: number, opts: { bold?: boolean; size: number; fallback: [number, number, number]; uppercase?: boolean }) => {
        let text = cellText(cell);
        if (opts.uppercase) text = text.toUpperCase();
        const maxW = colW(i) - 12;
        while (text.length > 1 && fonts.width(text, opts.size, opts.bold) > maxW) text = text.slice(0, -1);
        const rgb = parseColor(cell?.color) ?? opts.fallback;
        doc.setTextColor(...rgb);
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
        doc.setFontSize(opts.size);
        const tx = align(i) === 'right' ? x + colW(i) - 6 : x + 6;
        doc.text(text, tx, cy, { baseline: 'middle' });
      };

      const rowH = 17;
      const headH = 20;
      ensure(headH + rowH); // always keep header + at least one row together
      doc.setFillColor(...COLORS.headBg);
      doc.rect(PAGE_MARGIN_X, y, contentW, headH, 'F');
      for (let i = 0; i < cols; i++) {
        drawCell({ text: section.headers[i] }, i, PAGE_MARGIN_X, y + headH / 2, { bold: true, size: 7.5, fallback: COLORS.subtle, uppercase: true });
      }
      y += headH;
      doc.setDrawColor(...COLORS.line);
      doc.line(PAGE_MARGIN_X, y, PAGE_MARGIN_X + contentW, y);

      section.rows.forEach((row, ri) => {
        ensure(rowH);
        if (ri % 2 === 1) {
          doc.setFillColor(...COLORS.zebra);
          doc.rect(PAGE_MARGIN_X, y, contentW, rowH, 'F');
        }
        const cy = y + rowH / 2;
        row.forEach((cell, i) => {
          if (i < cols) drawCell(cell, i, PAGE_MARGIN_X, cy, { size: 9, fallback: COLORS.text });
        });
        y += rowH;
      });
      y += 10;
      continue;
    }

    if (section.kind === 'chart') {
      if (section.title) {
        ensure(20);
        doc.setTextColor(...COLORS.text);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(pdfSafeText(section.title), PAGE_MARGIN_X, y, { baseline: 'top' });
        y += 15;
      }
      if (section.note) {
        doc.setTextColor(...COLORS.subtle);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const line of wrapPdfText(section.note, 8, contentW)) {
          ensure(10);
          doc.text(line, PAGE_MARGIN_X, y, { baseline: 'top' });
          y += 10;
        }
      }
      if (section.width > 0 && section.height > 0) {
        const w = contentW;
        const h = (section.height / section.width) * w;
        ensure(Math.min(h, pageH - PAGE_TOP - PAGE_BOTTOM) + 6);
        doc.addImage(section.dataUrl, 'PNG', PAGE_MARGIN_X, y, w, h);
        y += h + 10;
      }
      continue;
    }
  }

  // Footers on every page.
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    doc.setDrawColor(...COLORS.line);
    doc.line(PAGE_MARGIN_X, pageH - 30, pageW - PAGE_MARGIN_X, pageH - 30);
    doc.setTextColor(...COLORS.faint);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Generated by Ledgerly - all data processed locally', PAGE_MARGIN_X, pageH - 18, { baseline: 'top' });
    const label = `Page ${p} of ${total}`;
    doc.text(label, pageW - PAGE_MARGIN_X - fonts.width(label, 7.5), pageH - 18, { baseline: 'top' });
  }

  return { doc, pageCount: total };
}

// ---------------------------------------------------------------------------
// Browser-only: SVG rasterization + jsPDF loading + orchestration
// ---------------------------------------------------------------------------

/**
 * Rasterize an SVG element to a PNG data URL at `scale`× resolution.
 * Browser-only (needs XMLSerializer, canvas, and image decoding) — rejects in
 * test environments without them.
 */
export async function svgToPngDataUrl(svg: SVGSVGElement, width: number, height: number, scale = 2): Promise<string> {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(w));
  clone.setAttribute('height', String(h));
  // Explicit fill/stroke keep the chart's palette: Tailwind classes on SVG
  // elements would resolve to black once the SVG is serialized standalone.
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const cs = window.getComputedStyle(child);
      for (const prop of ['fill', 'stroke', 'strokeWidth', 'fontFamily', 'fontSize', 'fontWeight'] as const) {
        const val = cs.getPropertyValue(prop);
        if (val && val !== 'none' && val !== '') child.setAttribute(prop, val);
      }
      walk(child);
    }
  };
  walk(clone);
  const xml = new XMLSerializer().serializeToString(clone);
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;

  const img = new Image();
  img.decoding = 'sync';
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Could not rasterize the chart image.'));
  });
  img.src = src;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

interface JsPdfModule {
  jsPDF: new (opts: { orientation: 'p' | 'l'; unit: 'pt'; format: 'a4' }) => PdfLikeDoc;
}

let pdfModule: Promise<JsPdfModule> | null = null;

/** Lazily import jsPDF so it never enters the initial bundle. */
export async function loadPdfJs(): Promise<JsPdfModule> {
  if (!pdfModule) {
    pdfModule = import('jspdf').then((m) => m as unknown as JsPdfModule);
  }
  return pdfModule;
}

/** Trigger a browser download for generated PDF bytes. */
export function downloadPdf(filename: string, bytes: Uint8Array): void {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Pick the report's chart SVG (the Sankey is tagged role="img") inside a container. */
export function extractReportSvg(container: HTMLElement | null | undefined): SVGSVGElement | null {
  if (!container) return null;
  return container.querySelector('svg[role="img"]');
}

export interface ReportPdfOptions {
  title: string;
  subtitle?: string;
  meta?: string;
  summary?: { label: string; value: string; color?: string }[];
  table: { title?: string; headers: string[]; align?: ('left' | 'right')[]; rows: PdfTableCell[][]; note?: string };
  /** Live element containing the chart SVG (e.g. the Sankey) to embed. */
  chartContainer?: HTMLElement | null;
  chartTitle?: string;
  chartNote?: string;
  /** Present the diagram first (landscape data is otherwise fine either way). */
  chartFirst?: boolean;
  filename: string;
}

export type ReportPdfResult = { ok: true } | { ok: false; error: string };

/**
 * Generate and download a report PDF. The chart (when a container is given)
 * is rasterized from the live SVG; if rasterization fails the data table is
 * still exported so the user always gets their report.
 */
export async function exportReportPdf(opts: ReportPdfOptions): Promise<ReportPdfResult> {
  try {
    if (typeof window === 'undefined') throw new Error('PDF export is only available in the app.');

    const chartSvg = extractReportSvg(opts.chartContainer);
    let chartSection: PdfSection | null = null;
    let chartError: string | null = null;
    if (chartSvg) {
      const vb = chartSvg.viewBox.baseVal;
      const width = vb && vb.width ? vb.width : chartSvg.clientWidth || 1000;
      const height = vb && vb.height ? vb.height : chartSvg.clientHeight || 500;
      try {
        const dataUrl = await svgToPngDataUrl(chartSvg, width, height, 2);
        chartSection = { kind: 'chart', title: opts.chartTitle, dataUrl, width, height, note: opts.chartNote };
      } catch (e) {
        chartError = e instanceof Error ? e.message : 'Could not rasterize the chart image.';
      }
    } else if (opts.chartContainer) {
      chartError = 'Diagram not rendered yet — open the report and try again.';
    }

    const { jsPDF } = await loadPdfJs();
    const sections: PdfSection[] = [];
    if (opts.chartFirst && chartSection) sections.push(chartSection);
    if (opts.summary && opts.summary.length > 0) sections.push({ kind: 'summary', cards: opts.summary });
    if (!opts.chartFirst && chartSection) sections.push(chartSection);
    sections.push({ kind: 'table', ...opts.table });

    const { doc } = buildPdf({
      title: opts.title,
      subtitle: opts.subtitle,
      meta: opts.meta,
      sections,
      createDoc: (o) => new jsPDF(o),
    });

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    downloadPdf(opts.filename, bytes);
    return chartError ? { ok: false, error: chartError } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not generate the PDF.' };
  }
}

/** Re-export so callers don't need to import money.ts for table amounts. */
export { formatMoneyPlain };
