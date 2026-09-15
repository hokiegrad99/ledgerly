import { describe, expect, it } from 'vitest';
import { measurePdfText, pdfSafeText, parseColor, wrapPdfText } from './reportPdf';
import { createPdfHarness } from './pdf-test-harness';

const A4_WIDTH = 595;
const A4_HEIGHT = 842;

function harness() {
  return createPdfHarness({ width: A4_WIDTH, height: A4_HEIGHT });
}

describe('pdfSafeText', () => {
  it('passes ASCII through unchanged', () => {
    expect(pdfSafeText('Groceries $1,234.56')).toBe('Groceries $1,234.56');
  });

  it('maps common typographic and currency characters to ASCII', () => {
    expect(pdfSafeText('a—b–c')).toBe('a-b-c');
    expect(pdfSafeText('“quoted” and ‘single’')).toBe('"quoted" and \'single\'');
    expect(pdfSafeText('100€ · 50£')).toBe('100EUR · 50£'); // € → EUR; · and £ are WinAnsi
  });

  it('keeps Latin-1 characters and replaces other Unicode with ?', () => {
    expect(pdfSafeText('café')).toBe('café');
    expect(pdfSafeText('日本語')).toBe('???');
  });
});

describe('parseColor', () => {
  it('parses 6-digit and 3-digit hex', () => {
    expect(parseColor('#3c68ee')).toEqual([60, 104, 238]);
    expect(parseColor('#fff')).toEqual([255, 255, 255]);
  });

  it('returns null for non-hex input', () => {
    expect(parseColor('rgb(1,2,3)')).toBeNull();
    expect(parseColor(undefined)).toBeNull();
  });
});

describe('measurePdfText / wrapPdfText', () => {
  it('measures bold wider than regular for the same string', () => {
    expect(measurePdfText('Amount', 10, true)).toBeGreaterThan(measurePdfText('Amount', 10, false));
  });

  it('measures at size 1 exactly per Helvetica metrics for known strings', () => {
    // 'W' = 944/1000 em, 'i' = 222/1000 em in Helvetica regular.
    expect(measurePdfText('Wi', 10)).toBeCloseTo(11.66, 2);
  });

  it('wraps long text into lines that fit the width', () => {
    const text = 'Income sources flow into the Income node and then out to category groups.';
    const lines = wrapPdfText(text, 10, 200);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measurePdfText(line, 10)).toBeLessThanOrEqual(200);
    }
    expect(lines.join(' ')).toBe(text);
  });

  it('hard-splits words longer than the line width', () => {
    const lines = wrapPdfText('A'.repeat(50), 10, 100);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measurePdfText(line, 10)).toBeLessThanOrEqual(100);
    }
  });

  it('returns a single empty line for empty input', () => {
    expect(wrapPdfText('', 10, 100)).toEqual(['']);
  });
});

describe('buildPdf', () => {
  const baseInput = {
    title: 'Spending by category',
    subtitle: 'Ledgerly report',
    meta: 'Period 2026-08-01 – 2026-08-31 · Generated 2026-09-15 · Ledgerly',
    sections: [
      { kind: 'note', text: 'Transfers and excluded accounts are not shown.' },
      {
        kind: 'summary',
        cards: [
          { label: 'Total income', value: '1,593.00', color: '#10b981' },
          { label: 'Total expenses', value: '2,743.20', color: '#ef4444' },
          { label: 'Net', value: '-1,150.20', color: '#ef4444' },
        ],
      },
      {
        kind: 'table',
        headers: ['Name', 'Amount'],
        rows: [
          [{ text: 'Groceries' }, { text: '512.30' }],
          [{ text: 'Rent' }, { text: '1,600.00' }],
        ],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  it('draws the title, subtitle, and meta on the first page', () => {
    const h = harness();
    h.build(baseInput);
    const strings = h.texts.map((t) => t.text);
    expect(strings).toContain('Spending by category');
    expect(strings).toContain('Ledgerly report');
    expect(strings.some((s) => s.includes('Period 2026-08-01'))).toBe(true);
  });

  it('uppercases and draws summary card labels with their values', () => {
    const h = harness();
    h.build(baseInput);
    const strings = h.texts.map((t) => t.text);
    expect(strings).toContain('TOTAL INCOME');
    expect(strings).toContain('1,593.00');
    // Filled card backgrounds exist.
    expect(h.rects.some((r) => r.style === 'F' && r.h === 36)).toBe(true);
  });

  it('draws table headers, zebra striping, and both data rows', () => {
    const h = harness();
    h.build(baseInput);
    const strings = h.texts.map((t) => t.text);
    expect(strings).toContain('NAME');
    expect(strings).toContain('AMOUNT');
    expect(strings).toContain('Groceries');
    expect(strings).toContain('512.30');
    expect(strings).toContain('Rent');
    // Exactly one zebra fill for the second row.
    const zebra = h.rects.filter((r) => r.style === 'F' && r.fill.join(',') === '249,250,251');
    expect(zebra.length).toBe(1);
  });

  it('right-aligns numeric cells inside the content area', () => {
    const h = harness();
    h.build(baseInput);
    const amount = h.texts.find((t) => t.text === '512.30');
    expect(amount).toBeDefined();
    const rightEdge = A4_WIDTH - 40 - 6;
    expect(amount!.x).toBeLessThanOrEqual(rightEdge);
    expect(amount!.x).toBeGreaterThan(A4_WIDTH / 2);
  });

  it('emits a footer with page numbers on every page', () => {
    const h = harness();
    h.build(baseInput);
    const footers = h.texts.filter((t) => /^Page \d+ of \d+$/.test(t.text));
    expect(footers.length).toBe(1);
    expect(footers[0].text).toBe('Page 1 of 1');
  });

  it('paginates a long table across multiple pages', () => {
    const h = harness();
    h.build({
      title: 'Many rows',
      sections: [
        {
          kind: 'table',
          headers: ['Name', 'Amount'],
          rows: Array.from({ length: 120 }, (_, i) => [{ text: `Item ${i + 1}` }, { text: `${i + 1}.00` }]),
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(h.pages).toBeGreaterThan(1);
    // Every page gets a footer.
    const footers = h.texts.filter((t) => /^Page \d+ of \d+$/.test(t.text));
    expect(footers.length).toBe(h.pages);
  });

  it('embeds a chart image sized to the content width and keeps aspect ratio', () => {
    const h = harness();
    h.build({
      title: 'Cash flow diagram',
      sections: [{ kind: 'chart', dataUrl: 'data:image/png;base64,AAA', width: 1040, height: 480 }],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(h.images.length).toBe(1);
    const img = h.images[0];
    expect(img.w).toBeCloseTo(A4_WIDTH - 80, 0);
    expect(img.h / img.w).toBeCloseTo(480 / 1040, 2);
  });

  it('skips empty tables and empty summary cards', () => {
    const h = harness();
    h.build({
      title: 'Empty',
      sections: [
        { kind: 'summary', cards: [] },
        { kind: 'table', headers: ['Name', 'Amount'], rows: [] },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    expect(h.rects.filter((r) => r.h === 36).length).toBe(0);
    expect(h.texts.map((t) => t.text)).not.toContain('NAME');
  });

  it('truncates over-long cell text to fit its column', () => {
    const h = harness();
    h.build({
      title: 'Truncation',
      sections: [
        {
          kind: 'table',
          headers: ['Name', 'Amount'],
          rows: [[{ text: 'X'.repeat(200) }, { text: '10.00' }]],
        },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
    const drawn = h.texts.find((t) => t.text.startsWith('XXX'));
    expect(drawn).toBeDefined();
    expect(drawn!.text.length).toBeLessThan(200);
  });
});
