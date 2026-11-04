import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fs from 'node:fs/promises';
import path from 'node:path';
import Decimal from 'decimal.js';
import type { SaleDetail, PaymentDetail } from '../../../packages/domain/src/commerce';

const green = rgb(0.07, 0.235, 0.173),
  cream = rgb(0.97, 0.965, 0.94),
  ink = rgb(0.13, 0.21, 0.17),
  muted = rgb(0.38, 0.44, 0.41);
const presentation = { box: 'Caja', half_box: 'Media caja', blister: 'Blíster' };
const date = (value: string) =>
  new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const amount = (value: string, scale = 2) => {
  const [integer, fraction] = new Decimal(value).toFixed(scale, Decimal.ROUND_HALF_UP).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};
// Text stays literal PDF text: no HTML, script, dynamic paths, or remote assets are interpreted.
function printable(value: string, font: PDFFont) {
  return [...value.normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')]
    .map((character) => {
      if (character === '\n' || character === '\r' || character === '\t') return ' ';
      try {
        font.encodeText(character);
        return character;
      } catch {
        return '?';
      }
    })
    .join('');
}
async function document(title: string, number: string, isDemo: boolean) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} ${number}`);
  doc.setAuthor('Manzanas Maracay');
  doc.setProducer('Manzanas Maracay');
  const font = await doc.embedFont(StandardFonts.Helvetica),
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let logoBytes: Uint8Array | undefined;
  for (const filename of [
    path.resolve('apps/api/assets/brand/logo-manzanas-maracay.png'),
    path.resolve('apps/web/public/brand/logo-manzanas-maracay.png'),
  ]) {
    try {
      logoBytes = await fs.readFile(filename);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (!logoBytes) throw new Error('Falta el logo oficial para emitir el documento.');
  const logo = await doc.embedPng(logoBytes);
  let page: PDFPage,
    y = 0;
  function start() {
    page = doc.addPage([595.28, 841.89]);
    y = 690;
    page.drawRectangle({ x: 0, y: 722, width: 595.28, height: 120, color: green });
    const dimensions = logo.scaleToFit(84, 94);
    page.drawImage(logo, {
      x: 36 + (84 - dimensions.width) / 2,
      y: 733 + (94 - dimensions.height) / 2,
      width: dimensions.width,
      height: dimensions.height,
    });
    page.drawText('MANZANAS MARACAY', {
      x: 141,
      y: 798,
      size: 17,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText(title, { x: 141, y: 771, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText(number, { x: 141, y: 749, size: 12, font, color: rgb(1, 1, 1) });
    if (isDemo) {
      page.drawRectangle({ x: 36, y: 690, width: 523, height: 22, color: cream });
      page.drawText('DEMO · ENTORNO DE PRUEBAS · SIN VALIDEZ COMERCIAL', {
        x: 47,
        y: 697,
        size: 9,
        font: bold,
        color: green,
      });
      y = 671;
    }
  }
  start();
  function ensure(height: number) {
    if (y - height < 64) {
      start();
      return true;
    }
    return false;
  }
  function words(value: string, maxWidth: number, size = 10, useBold = false) {
    const currentFont = useBold ? bold : font,
      safe = printable(value, currentFont),
      result: string[] = [];
    let line = '';
    for (const word of safe.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (currentFont.widthOfTextAtSize(candidate, size) <= maxWidth) line = candidate;
      else {
        if (line) result.push(line);
        line = '';
        for (const character of word) {
          if (line && currentFont.widthOfTextAtSize(line + character, size) > maxWidth) {
            result.push(line);
            line = '';
          }
          line += character;
        }
      }
    }
    if (line) result.push(line);
    return result.length ? result : [''];
  }
  function text(
    value: string,
    options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) {
    const size = options.size ?? 10,
      lines = words(value, 523, size, options.bold);
    for (const line of lines) {
      ensure(size + 6);
      page.drawText(line, {
        x: 36,
        y,
        size,
        font: options.bold ? bold : font,
        color: options.color ?? ink,
      });
      y -= size + 5;
    }
  }
  function section(value: string) {
    ensure(44);
    y -= 10;
    page.drawRectangle({ x: 36, y: y - 7, width: 523, height: 24, color: cream });
    page.drawText(value, { x: 46, y, size: 11, font: bold, color: green });
    y -= 31;
  }
  let tableHeading: { values: string[]; widths: number[] } | null = null;
  function tableRow(values: string[], widths: number[], header = false) {
    const wrapped = values.map((value, i) => words(value, widths[i] - 12, header ? 9 : 10, header)),
      height = Math.max(...wrapped.map((lines) => lines.length)) * 14 + 12;
    if (header) tableHeading = { values, widths };
    if (ensure(height) && !header && tableHeading)
      tableRow(tableHeading.values, tableHeading.widths, true);
    if (header) page.drawRectangle({ x: 36, y: y - height + 12, width: 523, height, color: cream });
    let x = 36;
    wrapped.forEach((lines, i) => {
      lines.forEach((line, j) =>
        page.drawText(line, {
          x: x + 6,
          y: y - j * 14,
          size: header ? 9 : 10,
          font: header ? bold : font,
          color: ink,
        }),
      );
      x += widths[i];
    });
    y -= height;
    page.drawLine({
      start: { x: 36, y: y + 12 },
      end: { x: 559, y: y + 12 },
      thickness: 0.4,
      color: rgb(0.85, 0.88, 0.85),
    });
  }
  function total(label: string, value: string, emphasis = false) {
    ensure(28);
    y -= 7;
    page.drawText(label, {
      x: 270,
      y,
      size: emphasis ? 12 : 10,
      font: emphasis ? bold : font,
      color: ink,
    });
    const display = `USD ${amount(value)}`,
      f = emphasis ? bold : font,
      size = emphasis ? 12 : 10;
    page.drawText(display, {
      x: 559 - f.widthOfTextAtSize(display, size),
      y,
      size,
      font: f,
      color: ink,
    });
    y -= 18;
  }
  async function finish() {
    const pages = doc.getPages();
    for (let i = 0; i < pages.length; i++) {
      pages[i].drawText('Documento comercial. No es una factura fiscal SENIAT.', {
        x: 36,
        y: 38,
        size: 8,
        font,
        color: muted,
      });
      pages[i].drawText(`${i + 1} / ${pages.length}`, {
        x: 527,
        y: 38,
        size: 8,
        font,
        color: muted,
      });
    }
    return Buffer.from(await doc.save());
  }
  return { text, section, tableRow, total, finish };
}
export async function salePdf(sale: SaleDetail): Promise<Buffer> {
  const pdf = await document('COMPROBANTE DE VENTA', sale.number, sale.isDemo);
  pdf.text(`Fecha: ${date(sale.soldAt)} · Hora de Venezuela`);
  pdf.text(`Cliente: ${sale.client.name}`, { bold: true, size: 12 });
  if (sale.client.taxId) pdf.text(`Identificación: ${sale.client.taxId}`);
  if (sale.client.phone) pdf.text(`Teléfono: ${sale.client.phone}`);
  if (sale.client.address) pdf.text(`Dirección: ${sale.client.address}`);
  pdf.text(
    `Condición: ${sale.condition === 'cash' ? 'Contado' : 'Crédito'}${sale.dueDate ? ` · Fecha pactada: ${sale.dueDate}` : ' · Sin fecha pactada'}`,
  );
  if (sale.status === 'cancelled')
    pdf.text(`ANULADO: ${sale.cancellation?.reason ?? ''}`, { bold: true });
  pdf.section('Detalle de mercancía');
  pdf.tableRow(
    ['Producto y presentación', 'Cantidad', 'P. unitario USD', 'Total USD'],
    [257, 55, 105, 106],
    true,
  );
  for (const line of sale.lines)
    pdf.tableRow(
      [
        `${line.description} / ${presentation[line.presentation]}`,
        `${line.quantity}`,
        amount(line.agreedUnitUsd, 4),
        amount(line.totalUsd),
      ],
      [257, 55, 105, 106],
    );
  pdf.total('Total de la venta', sale.totalUsd, true);
  if (!new Decimal(sale.discountUsd).isZero())
    pdf.total('Diferencia de referencia', sale.discountUsd);
  pdf.total('Abonado', sale.paidUsd);
  pdf.total('Saldo actual', sale.balanceUsd, true);
  if (sale.payments.length) {
    pdf.section('Abonos registrados');
    for (const payment of sale.payments)
      pdf.text(
        `${payment.number} · ${date(payment.receivedAt)} · ${payment.currency} ${amount(payment.amount)} · Aplicado USD ${amount(payment.appliedUsd)}${payment.reversed ? ' · REVERSADO' : ''}`,
      );
  }
  if (sale.notes) {
    pdf.section('Observaciones');
    pdf.text(sale.notes);
  }
  pdf.text('El saldo refleja los abonos vigentes al consultar este comprobante.', {
    size: 9,
    color: muted,
  });
  return pdf.finish();
}
export async function paymentPdf(payment: PaymentDetail): Promise<Buffer> {
  const pdf = await document('RECIBO DE ABONO', payment.number, payment.isDemo);
  pdf.text(`Fecha: ${date(payment.receivedAt)} · Hora de Venezuela`);
  pdf.text(`Cliente: ${payment.client.name}`, { bold: true, size: 12 });
  if (payment.client.phone) pdf.text(`Teléfono: ${payment.client.phone}`);
  pdf.text(`Forma de pago: ${payment.method}`);
  pdf.text(`Operador: ${payment.operatorName ?? payment.actor}`);
  if (payment.reversed) pdf.text(`REVERSADO: ${payment.reversal?.reason ?? ''}`, { bold: true });
  pdf.section('Monto recibido');
  pdf.text(`${payment.currency} ${amount(payment.amount)}`, { bold: true, size: 18 });
  if (payment.bcvRate) {
    pdf.text(`BCV histórico: ${payment.bcvRate.rate} VES por USD`);
    pdf.text(`Fuente oficial: ${payment.bcvRate.sourceUrl}`, { size: 9 });
  }
  pdf.total('Equivalente aplicado', payment.amountUsd, true);
  pdf.section('Aplicación por comprobante');
  pdf.tableRow(['Comprobante', 'Aplicado USD', 'Saldo al registrar USD'], [257, 133, 133], true);
  for (const application of payment.applications)
    pdf.tableRow(
      [application.number, amount(application.amountUsd), amount(application.balanceAfterUsd)],
      [257, 133, 133],
    );
  pdf.text(
    'Este recibo conserva el saldo posterior a este abono; los movimientos siguientes se consultan en el estado de cuenta.',
    { size: 9, color: muted },
  );
  return pdf.finish();
}
