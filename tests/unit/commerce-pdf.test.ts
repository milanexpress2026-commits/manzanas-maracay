import { describe, expect, it } from 'vitest';
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
} from 'pdf-lib';
import { composeSalePdf, composePaymentPdf, salePdf } from '../../apps/api/src/commerce-pdf';
import {
  createPdfLayout,
  pdfTextWidth,
  printablePdfText,
  wrapPdfText,
  type PdfLayoutReport,
} from '../../apps/api/src/pdf-layout';
import {
  PDF_QA_PRINTED_AT,
  pdfSaleFixture,
  pdfPaymentFixture,
  pdfUnicodeFixture,
} from '../fixtures/commerce-pdf';

async function extractedPages(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  const pages = doc.getPages().map((page) => {
    const contents = page.node.Contents();
    const values = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    return values
      .map((value) => {
        const stream = doc.context.lookup(value);
        if (!(stream instanceof PDFRawStream)) throw new Error('Expected a content stream');
        const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
        return [...operators.matchAll(/<([A-Fa-f0-9]+)>\s*Tj/g)]
          .map((match) => new TextDecoder('windows-1252').decode(Buffer.from(match[1], 'hex')))
          .join('\n');
      })
      .join('\n');
  });
  return { doc, pages };
}
function geometry(layout: PdfLayoutReport) {
  for (const box of layout.text) {
    expect(box.x, box.text).toBeGreaterThanOrEqual(layout.margin - 0.01);
    expect(box.x + box.width, box.text).toBeLessThanOrEqual(layout.width - layout.margin + 0.01);
    expect(box.y, box.text).toBeGreaterThanOrEqual(layout.margin - 0.01);
    expect(box.y + box.height, box.text).toBeLessThanOrEqual(layout.height - layout.margin + 0.01);
  }
  for (let page = 1; page <= layout.pages; page++) {
    const boxes = layout.text.filter((box) => box.page === page);
    expect(boxes.some((box) => !['header', 'footer', 'warning'].includes(box.role))).toBe(true);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        expect(width > 0.1 && height > 0.1, `${a.text} intersects ${b.text}`).toBe(false);
      }
  }
  for (const block of layout.blocks) expect(block.bottom).toBeGreaterThanOrEqual(64 - 0.01);
}

describe('composición comercial V4.7', () => {
  it.each(['letter', 'a4'] as const)(
    '%s: emisor formal con RIF, dirección larga y encabezado repetido sin perder mercancía',
    async (size) => {
      const sale = pdfSaleFixture(50);
      const before = JSON.stringify(sale);
      const issuer = {
        legalName: 'IMPORTADORA DE FRUTAS DE EJEMPLO PARA VERIFICACIÓN DE DOCUMENTOS C.A.',
        rif: 'J-00000000-0',
        address: 'Dirección sintética para pruebas. '.repeat(8).trim(),
      };
      const result = await composeSalePdf(sale, 'delivery', {
        size,
        issuer,
        generatedAt: PDF_QA_PRINTED_AT,
      });
      const { doc, pages } = await extractedPages(result.bytes);
      expect(doc.getAuthor()).toBe(issuer.legalName);
      expect(pages.length).toBeGreaterThan(1);
      for (const page of pages) {
        expect(page).toContain('RIF: J-00000000-0');
        expect(page).toContain('NOTA DE ENTREGA');
        expect(page).not.toContain('MANZANAS MARACAY');
        expect(page).toContain('No constituye factura fiscal.');
      }
      expect(result.layout.blocks.filter((b) => b.role === 'row').map((b) => b.id)).toEqual(
        sale.lines.map((l) => l.id),
      );
      expect(JSON.stringify(sale)).toBe(before);
      geometry(result.layout);
      const receipt = await composeSalePdf(sale, 'sale', { issuer });
      expect((await extractedPages(receipt.bytes)).doc.getAuthor()).toBe('Manzanas Maracay');
    },
    20000,
  );
  it.each([1, 5, 10, 15, 25, 35, 50])(
    '%i filas: Carta, orden completo, márgenes, totales y firmas indivisibles',
    async (count) => {
      const sale = pdfSaleFixture(count),
        before = JSON.stringify(sale);
      const { bytes, layout } = await composeSalePdf(sale, 'delivery', {
        generatedAt: PDF_QA_PRINTED_AT,
      });
      const { doc, pages } = await extractedPages(bytes);
      expect(JSON.stringify(sale)).toBe(before);
      expect(doc.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
      expect(
        layout.blocks.filter((block) => block.role === 'row').map((block) => block.id),
      ).toEqual(sale.lines.map((row) => row.id));
      const text = pages.join('\n');
      let previous = -1;
      for (let index = 1; index <= count; index++) {
        const marker = `R${String(index).padStart(3, '0')} `;
        expect(text.split(marker)).toHaveLength(2);
        const at = text.indexOf(marker);
        expect(at).toBeGreaterThan(previous);
        previous = at;
      }
      pages.forEach((page, index) => {
        expect(page).toContain(sale.number);
        expect(page).toContain(`Página ${index + 1} de ${pages.length}`);
        expect(page).toContain('DEMO - ENTORNO DE PRUEBAS');
        if (index > 0) expect(page).toContain('Continuación');
        if (layout.blocks.some((block) => block.page === index + 1 && block.role === 'row'))
          expect(page).toContain('Subtotal USD');
      });
      expect(text).not.toContain('ACTUALES al imprimir:');
      expect(text).not.toContain('12/11/2026');
      expect(text).toContain('Condición: Crédito');
      expect(text).not.toMatch(/Observaciones|Abonado vigente|Saldo actual/);
      expect(text).toContain('Acuerdo en divisa');
      expect(text).not.toContain('20/11/2026');
      const final = layout.blocks.filter((block) => block.role === 'final');
      expect(final).toHaveLength(1);
      expect(
        layout.text
          .filter((box) => ['totals', 'signature', 'balance-caption'].includes(box.role))
          .every((box) => box.page === final[0].page),
      ).toBe(true);
      expect(text).not.toMatch(/Costo|Margen|Utilidad|Diferencia de referencia/);
      expect(doc.catalog.has(PDFName.of('OpenAction'))).toBe(false);
      geometry(layout);
    },
  );

  it('mantiene toda una fila a cada lado del límite y repite encabezado tras el salto', async () => {
    const result = [];
    for (const filler of [40, 41]) {
      const pdf = await createPdfLayout({
        title: 'PRUEBA',
        number: 'QA-LIMITE',
        isDemo: false,
        footer: 'Documento sintético.',
        options: { generatedAt: PDF_QA_PRINTED_AT },
      });
      for (let i = 0; i < filler; i++) pdf.paragraph(`Bloque ${i}`, { gap: 0 });
      pdf.table({
        title: 'Tabla',
        headers: ['Valor'],
        widths: [pdf.contentWidth],
        rows: [
          { id: 'a', values: ['Fila A'] },
          { id: 'b', values: ['Fila B'] },
        ],
      });
      const rendered = await pdf.finish();
      geometry(rendered.layout);
      result.push(rendered.layout);
    }
    expect(result[0].pages).toBe(1);
    expect(result[1].pages).toBe(2);
    expect(
      result[1].blocks.filter((block) => block.role === 'row').map((block) => block.page),
    ).toEqual([1, 2]);
    expect(result[1].blocks.filter((block) => block.role === 'table-header')).toHaveLength(2);
  });

  it('A4 opcional y anulada conservan advertencia y DEMO en cada página', async () => {
    const sale = pdfSaleFixture(25);
    sale.status = 'cancelled';
    sale.balanceUsd = '0.00';
    sale.cancellation = {
      reason: 'Prueba de anulación sin entrega',
      actor: 'DEMO',
      createdAt: '2026-11-06T12:00:00Z',
    };
    const result = await composeSalePdf(sale, 'delivery', {
      size: 'a4',
      generatedAt: PDF_QA_PRINTED_AT,
    });
    const { doc, pages } = await extractedPages(result.bytes);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595.28, height: 841.89 });
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      expect(page).toContain('ANULADO - NO ENTREGAR');
      expect(page).toContain('DEMO');
    }
    geometry(result.layout);
  });

  it('texto español intacto, emoji explícito y contenido hostil literal sin acciones', async () => {
    const result = await composeSalePdf(pdfUnicodeFixture(), 'sale', {
      generatedAt: PDF_QA_PRINTED_AT,
    });
    const { doc, pages } = await extractedPages(result.bytes),
      text = pages.join('\n');
    expect(text).toContain('ÁÉÍÓÚÜÑ áéíóúüñ ¿¡ € £ ¥');
    expect(text).toContain('[U+1F600]');
    expect(text).toContain('[U+1F34E]');
    expect(text).toContain('U+200D');
    expect(text).not.toMatch(/[\u0000\u0001\u0085\u202e\ufffd]/);
    expect(text).toContain('<script>alert("literal")</script>');
    expect(text).toContain('TEXTO_FINAL');
    expect(doc.getPages().every((page) => (page.node.Annots()?.size() ?? 0) === 0)).toBe(true);
    expect(doc.catalog.has(PDFName.of('Names'))).toBe(false);
    geometry(result.layout);
  });

  it('palabra Unicode extrema conserva el renglón entero a ancho completo', async () => {
    const sale = pdfSaleFixture(1);
    sale.lines[0].description = '漢'.repeat(350);
    const result = await composeSalePdf(sale, 'delivery', { generatedAt: PDF_QA_PRINTED_AT });
    expect(result.layout.blocks.filter((block) => block.role === 'row')).toHaveLength(1);
    expect(result.layout.text.some((box) => box.text.startsWith('Producto y presentación:'))).toBe(
      true,
    );
    geometry(result.layout);
  });

  it('entrega compacta con muchos pagos y reimpresión no modifica snapshots', async () => {
    const sale = pdfSaleFixture(1),
      payment = pdfPaymentFixture();
    sale.payments = Array.from({ length: 60 }, (_, index) => ({
      ...payment,
      number: `AB-EXTRA-${index}`,
      appliedUsd: '0.01',
    }));
    const before = JSON.stringify(sale);
    const delivery = await composeSalePdf(sale, 'delivery', { generatedAt: PDF_QA_PRINTED_AT });
    const printed = (await extractedPages(delivery.bytes)).pages.join('\n');
    expect(delivery.layout.pages).toBe(1);
    expect(printed).not.toContain('AB-EXTRA');
    expect(printed).not.toMatch(/Observaciones|Abonado|Saldo|ACTUALES/);
    expect(printed).not.toContain(sale.notes!);
    expect(printed).toContain('Total');
    expect(printed).toContain('firma');
    expect(printed).toContain('Acuerdo en divisa');
    const accountDocument = await composeSalePdf(sale, 'sale');
    const accountText = (await extractedPages(accountDocument.bytes)).pages.join('\n');
    expect(accountText).toContain('Saldo actual');
    expect(accountText).toContain('Observaciones');
    const later = await salePdf(sale, 'delivery', {
      generatedAt: new Date('2026-11-07T16:34:56Z'),
    });
    expect((await extractedPages(later)).pages.join('\n')).toContain(sale.number);
    expect(JSON.stringify(sale)).toBe(before);
  });

  it('recibo conserva monto, referencia USDT y saldo al registrar; no saldo actual', async () => {
    const payment = pdfPaymentFixture(),
      before = JSON.stringify(payment);
    const result = await composePaymentPdf(payment, { generatedAt: PDF_QA_PRINTED_AT });
    const text = (await extractedPages(result.bytes)).pages.join('\n');
    expect(text).toContain('USDT 10,00');
    expect(text).toContain('Bs. 1.251,23');
    expect(text).toContain('125.12345678');
    expect(text).toContain('30,00');
    expect(text).toContain('no son saldos actuales');
    expect(text).toContain('No representa bolívares recibidos.');
    expect(JSON.stringify(payment)).toBe(before);
    geometry(result.layout);
  });

  it('rechaza dimensiones inválidas y termina el ajuste de palabras sin espacios', async () => {
    const doc = await PDFDocument.create(),
      font = await doc.embedFont(StandardFonts.Helvetica);
    const safe = printablePdfText('Á\u0000🍎', font);
    expect(safe.text).toBe('Á[U+1F34E]');
    expect(safe.substitutions).toBe(1);
    // PDF drawText emits glyph advances without kerning; its real right edge must
    // not use the narrower kerned estimate (caught by extracted footer boxes).
    expect(pdfTextWidth('AV', font, 10)).toBeGreaterThan(font.widthOfTextAtSize('AV', 10));
    const word = 'W'.repeat(400),
      lines = wrapPdfText(word, font, 80, 10);
    expect(lines.join('')).toBe(word);
    expect(lines.every((line) => font.widthOfTextAtSize(line, 10) <= 80)).toBe(true);
    expect(() => wrapPdfText(word, font, 0, 10)).toThrow();
    await expect(
      salePdf(pdfSaleFixture(1), 'delivery', { size: 'legal' as 'letter' }),
    ).rejects.toThrow('Tamaño');
  });

  it('mantiene cantidades y precios grandes en su columna sin partir importes', async () => {
    const sale = pdfSaleFixture(1);
    Object.assign(sale.lines[0], {
      quantity: 1000,
      agreedUnitUsd: '999999.9999',
      totalUsd: '999999999.90',
    });
    Object.assign(sale, { totalUsd: '999999999.90', paidUsd: '0.00', balanceUsd: '999999999.90' });
    const result = await composeSalePdf(sale, 'delivery', { generatedAt: PDF_QA_PRINTED_AT });
    const cells = result.layout.text
      .filter((box) => box.role === `row:${sale.lines[0].id}`)
      .map((box) => box.text);
    expect(cells).toContain('1000');
    expect(cells).toContain('999.999,9999');
    expect(cells).toContain('999.999.999,90');
    geometry(result.layout);
  });
});
