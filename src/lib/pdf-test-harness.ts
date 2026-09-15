import { buildPdf, type PdfLikeDoc } from './reportPdf';

/**
 * Test harness for the dependency-free PDF builder.
 *
 * `buildPdf` takes a document factory, so tests run against a tiny in-memory
 * recorder instead of jsPDF: every text draw, rect, image, and page transition
 * is captured so assertions can verify layout, pagination, and content.
 */

export interface RecordedText {
  text: string;
  x: number;
  y: number;
  size: number;
  bold: boolean;
  color: [number, number, number];
}

export interface RecordedRect {
  x: number;
  y: number;
  w: number;
  h: number;
  style: string;
  fill: [number, number, number];
}

export function createPdfHarness(pageSize: { width: number; height: number } = { width: 595, height: 842 }) {
  let current: Array<RecordedText> = [];
  const texts: Array<RecordedText> = [];
  const rects: RecordedRect[] = [];
  const images: Array<{ dataUrl: string; x: number; y: number; w: number; h: number; page: number }> = [];
  const strokes: Array<{ x1: number; y1: number; x2: number; y2: number; page: number }> = [];
  let pages = 1;
  let page = 1;
  let size = 10;
  let bold = false;
  let color: [number, number, number] = [0, 0, 0];
  let fillColor: [number, number, number] = [255, 255, 255];

  const doc: PdfLikeDoc = {
    setFontSize(s) {
      size = s;
    },
    setFont(_name, style) {
      bold = style === 'bold';
    },
    setTextColor(r, g, b) {
      color = [r, g, b];
    },
    setFillColor(r, g, b) {
      fillColor = [r, g, b];
    },
    setDrawColor() {
      /* recorded separately if ever needed */
    },
    line(x1, y1, x2, y2) {
      strokes.push({ x1, y1, x2, y2, page });
    },
    setPage(p) {
      page = p;
    },
    text(t, x, y) {
      const rec = { text: t, x, y, size, bold, color };
      texts.push(rec);
      current.push(rec);
    },
    rect(x, y, w, h, style = 'S') {
      rects.push({ x, y, w, h, style, fill: fillColor });
    },
    addImage(dataUrl, _format, x, y, w, h) {
      images.push({ dataUrl, x, y, w, h, page });
    },
    addPage() {
      pages += 1;
      page += 1;
      current = [];
    },
    getNumberOfPages() {
      return pages;
    },
    output() {
      return new ArrayBuffer(8);
    },
    internal: {
      pageSize: {
        getWidth: () => pageSize.width,
        getHeight: () => pageSize.height,
      },
    },
  };

  return {
    doc,
    texts,
    rects,
    images,
    strokes,
    get pages() {
      return pages;
    },
    get lastPageTexts() {
      return current;
    },
    build(input: Parameters<typeof buildPdf>[0]) {
      return buildPdf({ ...input, createDoc: () => doc });
    },
  };
}
