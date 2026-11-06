import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';

export type PdfOptions = { size?: 'letter' | 'a4'; generatedAt?: Date };
export type PdfTextBox = {
  page: number;
  role: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};
export type PdfBlock = { page: number; role: string; id?: string; top: number; bottom: number };
export type PdfLayoutReport = {
  size: 'letter' | 'a4';
  width: number;
  height: number;
  margin: number;
  pages: number;
  text: PdfTextBox[];
  blocks: PdfBlock[];
  substitutions: number;
};
type TextStyle = { size?: number; bold?: boolean; muted?: boolean; gap?: number };
type PreparedText = { lines: string[]; size: number; bold: boolean; leading: number };
type TableRow = { id: string; values: string[] };
type Total = { label: string; value: string; emphasis?: boolean };
const MARGIN = 34,
  FLOOR = 64,
  LEADING = 13,
  PAD = 6;
const INK = rgb(0.12, 0.12, 0.12),
  MUTED = rgb(0.38, 0.38, 0.38),
  RULE = rgb(0.8, 0.8, 0.8);
const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });

const glyphWidths = new WeakMap<PDFFont, Map<string, number>>();
/** Standard-font drawText emits Tj without pair kerning. Sum actual glyph advances,
 * rather than pdf-lib's kerned width estimate, so wrapping/right edges match ink. */
export function pdfTextWidth(value: string, font: PDFFont, size: number) {
  let widths = glyphWidths.get(font);
  if (!widths) {
    widths = new Map();
    glyphWidths.set(font, widths);
  }
  let total = 0;
  for (const character of value) {
    let width = widths.get(character);
    if (width === undefined) {
      width = font.widthOfTextAtSize(character, 1);
      widths.set(character, width);
    }
    total += width;
  }
  return total * size;
}

/** Literal text only. Unsupported graphemes remain identifiable, never a silent '?'. */
export function printablePdfText(value: string, font: Pick<PDFFont, 'encodeText'>) {
  let substitutions = 0;
  const normalized = value
    .normalize('NFC')
    .replace(/[\r\n\t\u00a0]/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u200e\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[\u2010-\u2015]/g, '-');
  const text = [...segmenter.segment(normalized)]
    .map(({ segment }) => {
      try {
        font.encodeText(segment);
        return segment;
      } catch {
        substitutions++;
        return `[${[...segment].map((c) => `U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`).join(' ')}]`;
      }
    })
    .join('');
  return { text, substitutions };
}

/** Breaks overlong words too; each iteration consumes input and never shrinks the font. */
export function wrapPdfText(value: string, font: PDFFont, width: number, size: number): string[] {
  if (!(width > 0 && size > 0)) throw new Error('Dimensiones de texto PDF inválidas.');
  const lines: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (pdfTextWidth(candidate, font, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const character of word) {
      if (pdfTextWidth(character, font, size) > width)
        throw new Error('Una columna PDF es demasiado estrecha.');
      if (line && pdfTextWidth(line + character, font, size) > width) {
        lines.push(line);
        line = '';
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

let logoPromise: Promise<Buffer> | undefined;
function officialLogo() {
  return (logoPromise ??= (async () => {
    for (const filename of [
      path.resolve('apps/api/assets/brand/logo-manzanas-maracay.png'),
      path.resolve('apps/web/public/brand/logo-manzanas-maracay.png'),
    ]) {
      try {
        return await fs.readFile(filename);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new Error('Falta el logo oficial para emitir el documento.');
  })());
}

export async function createPdfLayout(input: {
  title: string;
  number: string;
  isDemo: boolean;
  warning?: string;
  footer: string;
  options?: PdfOptions;
}) {
  const size = input.options?.size ?? 'letter';
  if (size !== 'letter' && size !== 'a4') throw new Error('Tamaño de papel no permitido.');
  const [width, height] = size === 'letter' ? [612, 792] : [595.28, 841.89];
  const contentWidth = width - MARGIN * 2,
    right = width - MARGIN;
  const generatedAt = input.options?.generatedAt ?? new Date();
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('Fecha de impresión inválida.');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await doc.embedPng(await officialLogo());
  doc.setTitle(printablePdfText(`${input.title} ${input.number}`, font).text);
  doc.setAuthor('Manzanas Maracay');
  doc.setProducer('Manzanas Maracay');
  doc.setCreationDate(generatedAt);
  doc.setModificationDate(generatedAt);
  const report: PdfLayoutReport = {
    size,
    width,
    height,
    margin: MARGIN,
    pages: 0,
    text: [],
    blocks: [],
    substitutions: 0,
  };
  let page: PDFPage,
    y = 0,
    bodyTop = 0;
  function prepare(value: string, available = contentWidth, style: TextStyle = {}): PreparedText {
    const f = style.bold ? bold : font,
      textSize = style.size ?? 10;
    const safe = printablePdfText(value, f);
    report.substitutions += safe.substitutions;
    return {
      lines: wrapPdfText(safe.text, f, available, textSize),
      size: textSize,
      bold: !!style.bold,
      leading: Math.max(LEADING, textSize + 3),
    };
  }
  function line(
    value: string,
    x: number,
    top: number,
    textSize = 10,
    useBold = false,
    role = 'body',
    muted = false,
  ) {
    const f = useBold ? bold : font;
    const ascent = f.heightAtSize(textSize, { descender: false });
    const fullHeight = f.heightAtSize(textSize);
    const baseline = top - ascent;
    const textWidth = pdfTextWidth(value, f, textSize);
    page.drawText(value, { x, y: baseline, size: textSize, font: f, color: muted ? MUTED : INK });
    if (value)
      report.text.push({
        page: doc.getPageCount(),
        role,
        text: value,
        x,
        y: baseline - (fullHeight - ascent),
        width: textWidth,
        height: fullHeight,
      });
  }
  function start() {
    page = doc.addPage([width, height]);
    const dimensions = logo.scaleToFit(48, 48);
    page.drawImage(logo, {
      x: MARGIN,
      y: height - MARGIN - dimensions.height,
      width: dimensions.width,
      height: dimensions.height,
    });
    line('MANZANAS MARACAY', MARGIN + 61, height - MARGIN, 15, true, 'header');
    line(input.title, MARGIN + 61, height - MARGIN - 21, 11, true, 'header');
    const folio = prepare(`Folio: ${input.number}`, contentWidth - 61 - 105, { size: 9.5 });
    // Server folios are short; wrapping also protects historical nonstandard folios.
    for (const [index, value] of folio.lines.entries())
      line(value, MARGIN + 61, height - MARGIN - 38 - index * 13, 9.5, false, 'header');
    if (doc.getPageCount() > 1)
      line('Continuación', right - 85, height - MARGIN - 38, 9.5, true, 'header');
    y = height - MARGIN - 55 - (folio.lines.length - 1) * 13;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: right, y }, thickness: 0.7, color: INK });
    y -= 12;
    for (const warning of [
      input.isDemo ? 'DEMO - ENTORNO DE PRUEBAS - SIN VALIDEZ COMERCIAL' : '',
      input.warning ?? '',
    ].filter(Boolean)) {
      const prepared = prepare(warning, contentWidth - 12, { size: 9, bold: true });
      const bandHeight = prepared.lines.length * 13 + 8;
      page.drawRectangle({
        x: MARGIN,
        y: y - bandHeight,
        width: contentWidth,
        height: bandHeight,
        color: rgb(0.95, 0.95, 0.95),
        borderColor: RULE,
        borderWidth: 0.4,
      });
      for (const [index, value] of prepared.lines.entries())
        line(value, MARGIN + 6, y - 4 - index * 13, 9, true, 'warning');
      y -= bandHeight + 7;
    }
    bodyTop = y;
  }
  start();
  function ensure(blockHeight: number) {
    if (!Number.isFinite(blockHeight) || blockHeight < 0 || blockHeight > bodyTop - FLOOR)
      throw new Error('Un bloque del documento excede el área imprimible.');
    if (y - blockHeight < FLOOR) start();
  }
  function paragraph(value: string, style: TextStyle = {}) {
    const text = prepare(value, contentWidth, style);
    for (const value of text.lines) {
      ensure(text.leading);
      line(value, MARGIN, y, text.size, text.bold, 'body', style.muted);
      y -= text.leading;
    }
    y -= style.gap ?? 4;
  }
  function section(title: string, firstLineHeight = LEADING) {
    ensure(26 + firstLineHeight);
    y -= 8;
    line(printablePdfText(title, bold).text, MARGIN, y, 10, true, 'section');
    y -= 18;
  }
  function paragraphHeight(value: string, style: TextStyle = {}) {
    const text = prepare(value, contentWidth, style);
    return text.lines.length * text.leading + (style.gap ?? 4);
  }
  function table(inputTable: {
    title: string;
    headers: string[];
    widths: number[];
    rows: TableRow[];
    rightAligned?: number[];
    keepLastWith?: number;
  }) {
    const { headers, widths, rows } = inputTable;
    if (
      headers.length !== widths.length ||
      Math.abs(widths.reduce((a, b) => a + b, 0) - contentWidth) > 0.01
    )
      throw new Error('Columnas PDF inválidas.');
    const headings = headers.map((value, index) =>
      prepare(value, widths[index] - PAD * 2, { size: 8.5, bold: true }),
    );
    const headingHeight =
      Math.max(...headings.map((cell) => cell.lines.length)) * LEADING + PAD * 2;
    const maxRowHeight = bodyTop - FLOOR - headingHeight - 26;
    const measured = rows.map((row) => {
      if (row.values.length !== widths.length) throw new Error('Fila PDF inválida.');
      let cells = row.values.map((value, index) => prepare(value, widths[index] - PAD * 2));
      let rowHeight = Math.max(...cells.map((cell) => cell.lines.length)) * LEADING + PAD * 2;
      let expanded = false;
      // Maximum-length unusual Unicode can expand to visible codepoint labels. Keep
      // that row whole in a full-width labelled block instead of clipping/shrinking it.
      if (rowHeight > maxRowHeight) {
        expanded = true;
        cells = row.values.map((value, index) =>
          prepare(`${headers[index]}: ${value}`, contentWidth - PAD * 2),
        );
        rowHeight = cells.reduce((sum, cell) => sum + cell.lines.length * LEADING + 3, 0) + PAD * 2;
      }
      if (rowHeight > maxRowHeight)
        throw new Error('Un renglón excede el área imprimible incluso a ancho completo.');
      return { ...row, cells, rowHeight, expanded };
    });
    let needsHeader = true,
      first = true;
    function drawHeading() {
      if (first) {
        y -= 8;
        line(inputTable.title, MARGIN, y, 10, true, 'section');
        y -= 18;
        first = false;
      }
      page.drawRectangle({
        x: MARGIN,
        y: y - headingHeight,
        width: contentWidth,
        height: headingHeight,
        color: rgb(0.95, 0.95, 0.95),
      });
      let x = MARGIN;
      headings.forEach((cell, index) => {
        cell.lines.forEach((value, i) =>
          line(value, x + PAD, y - PAD - i * LEADING, cell.size, true, 'table-header'),
        );
        x += widths[index];
      });
      report.blocks.push({
        page: doc.getPageCount(),
        role: 'table-header',
        top: y,
        bottom: y - headingHeight,
      });
      y -= headingHeight;
      needsHeader = false;
    }
    for (const [index, row] of measured.entries()) {
      const headerSpace = needsHeader ? headingHeight + (first ? 26 : 0) : 0;
      const tail = index === measured.length - 1 ? (inputTable.keepLastWith ?? 0) : 0;
      const canKeepTail = row.rowHeight + headingHeight + tail <= bodyTop - FLOOR;
      if (y - headerSpace - row.rowHeight - (canKeepTail ? tail : 0) < FLOOR) {
        start();
        needsHeader = true;
      }
      if (needsHeader) drawHeading();
      // The row was measured with the repeated header already reserved.
      if (y - row.rowHeight < FLOOR) throw new Error('No hay espacio para el renglón completo.');
      const top = y;
      if (row.expanded) {
        let textY = y - PAD;
        for (const cell of row.cells) {
          for (const value of cell.lines) {
            line(value, MARGIN + PAD, textY, 10, false, `row:${row.id}`);
            textY -= LEADING;
          }
          textY -= 3;
        }
      } else {
        let x = MARGIN;
        row.cells.forEach((cell, column) => {
          cell.lines.forEach((value, i) => {
            const textX = inputTable.rightAligned?.includes(column)
              ? x + widths[column] - PAD - pdfTextWidth(value, font, 10)
              : x + PAD;
            line(value, textX, y - PAD - i * LEADING, 10, false, `row:${row.id}`);
          });
          x += widths[column];
        });
      }
      y -= row.rowHeight;
      page.drawLine({
        start: { x: MARGIN, y },
        end: { x: right, y },
        thickness: 0.35,
        color: RULE,
      });
      report.blocks.push({ page: doc.getPageCount(), role: 'row', id: row.id, top, bottom: y });
    }
    y -= 10;
  }
  function totalsBlock(totals: Total[], caption: string, signatures: boolean) {
    const labelWidth = contentWidth * 0.51 - 12,
      valueWidth = contentWidth * 0.49 - 12;
    const rows = totals.map((total) => ({
      ...total,
      label: prepare(total.label, labelWidth, {
        size: total.emphasis ? 11 : 10,
        bold: total.emphasis,
      }),
      display: prepare(total.value, valueWidth, {
        size: total.emphasis ? 12 : 10,
        bold: total.emphasis,
      }),
    }));
    const captionText = prepare(caption, contentWidth, { size: 8.5 });
    const rowHeights = rows.map(
      (row) =>
        Math.max(
          row.label.lines.length * row.label.leading,
          row.display.lines.length * row.display.leading,
        ) + 8,
    );
    const blockHeight =
      12 +
      rowHeights.reduce((a, b) => a + b, 0) +
      captionText.lines.length * 13 +
      10 +
      (signatures ? 87 : 0);
    return {
      height: blockHeight,
      draw() {
        ensure(blockHeight);
        const top = y;
        y -= 7;
        page.drawLine({
          start: { x: MARGIN, y },
          end: { x: right, y },
          thickness: 0.7,
          color: INK,
        });
        y -= 5;
        rows.forEach((row, index) => {
          row.label.lines.forEach((value, i) =>
            line(
              value,
              MARGIN,
              y - i * row.label.leading,
              row.label.size,
              row.label.bold,
              'totals',
            ),
          );
          row.display.lines.forEach((value, i) => {
            const f = row.display.bold ? bold : font;
            line(
              value,
              right - pdfTextWidth(value, f, row.display.size),
              y - i * row.display.leading,
              row.display.size,
              row.display.bold,
              'totals',
            );
          });
          y -= rowHeights[index];
        });
        captionText.lines.forEach((value, i) =>
          line(value, MARGIN, y - i * 13, 8.5, false, 'balance-caption', true),
        );
        y -= captionText.lines.length * 13 + 10;
        if (signatures) {
          y -= 7;
          const second = MARGIN + contentWidth / 2 + 12;
          line('Entregado por / firma', MARGIN, y, 9, false, 'signature');
          line('Recibido por / firma', second, y, 9, false, 'signature');
          y -= 32;
          page.drawLine({
            start: { x: MARGIN, y },
            end: { x: second - 24, y },
            thickness: 0.5,
            color: MUTED,
          });
          page.drawLine({
            start: { x: second, y },
            end: { x: right, y },
            thickness: 0.5,
            color: MUTED,
          });
          y -= 13;
          line('Fecha de entrega: ________________________', MARGIN, y, 9, false, 'signature');
          y -= 25;
          line(
            'Reimprimir este documento no registra otra venta ni salida de inventario.',
            MARGIN,
            y,
            8,
            false,
            'signature',
            true,
          );
          y -= 10;
        }
        report.blocks.push({ page: doc.getPageCount(), role: 'final', top, bottom: y });
      },
    };
  }
  async function finish() {
    const pages = doc.getPages();
    for (const [index, current] of pages.entries()) {
      page = current;
      const text = printablePdfText(input.footer, font).text;
      line(text, MARGIN, 45, 8, false, 'footer', true);
      const pagination = `Página ${index + 1} de ${pages.length}`;
      // line() normally tracks the current page count; footer belongs to its own page.
      report.text[report.text.length - 1].page = index + 1;
      line(pagination, right - pdfTextWidth(pagination, font, 8), 45, 8, false, 'footer', true);
      report.text[report.text.length - 1].page = index + 1;
    }
    report.pages = pages.length;
    return { bytes: Buffer.from(await doc.save()), layout: report };
  }
  return {
    paragraph,
    paragraphHeight,
    section,
    table,
    totalsBlock,
    finish,
    contentWidth,
    generatedAt,
  };
}
