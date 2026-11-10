import Decimal from 'decimal.js';
import {
  paymentMethodLabel,
  type SaleDetail,
  type PaymentDetail,
} from '../../../packages/domain/src/commerce';
import { createPdfLayout, type PdfOptions } from './pdf-layout';
import { readDocumentIssuer } from './document-issuer';
export type { PdfOptions } from './pdf-layout';

const presentation = { box: 'Caja', half_box: 'Media caja', blister: 'Blíster' };
const date = (value: string | Date) =>
  new Intl.DateTimeFormat('es-VE', {
    timeZone: 'America/Caracas',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
const calendarDate = (value: string) => value.split('-').reverse().join('/');
const amount = (value: string, scale = 2) => {
  const [integer, fraction] = new Decimal(value).toFixed(scale, Decimal.ROUND_HALF_UP).split('.');
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction}`;
};

/** The diagnostic layout is used by offline QA, never sent to a browser or persisted. */
export async function composeSalePdf(
  sale: SaleDetail,
  kind: 'sale' | 'delivery' = 'sale',
  options: PdfOptions = {},
) {
  const delivery = kind === 'delivery';
  const issuer = delivery
    ? (options.issuer ?? (sale.isDemo ? undefined : await readDocumentIssuer()))
    : undefined;
  const pdf = await createPdfLayout({
    issuer,
    title: delivery ? 'NOTA DE ENTREGA' : 'COMPROBANTE DE VENTA',
    number: sale.number,
    isDemo: sale.isDemo,
    warning:
      sale.status === 'cancelled'
        ? delivery
          ? 'ANULADO - NO ENTREGAR'
          : 'COMPROBANTE ANULADO'
        : undefined,
    footer: delivery
      ? 'Nota de entrega / documento comercial. No constituye factura fiscal.'
      : 'Documento comercial. No constituye factura fiscal SENIAT.',
    options,
  });
  pdf.paragraph(`Venta: ${date(sale.soldAt)} - Hora de Venezuela`, { size: 9, muted: true });
  pdf.paragraph(`Cliente: ${sale.client.name}`, { bold: true, size: 11 });
  if (sale.client.taxId) pdf.paragraph(`Identificación / RIF: ${sale.client.taxId}`, { size: 9 });
  if (sale.client.phone) pdf.paragraph(`Teléfono: ${sale.client.phone}`, { size: 9 });
  if (sale.client.address) pdf.paragraph(`Dirección: ${sale.client.address}`, { size: 9 });
  pdf.paragraph(
    `Condición original: ${sale.condition === 'cash' ? 'Contado' : 'Crédito'}${
      sale.originalDueDate
        ? ` - Fecha pactada original: ${calendarDate(sale.originalDueDate)}`
        : sale.condition === 'credit'
          ? ' - Sin fecha pactada al registrar'
          : ''
    }`,
    { size: 9 },
  );
  if (!delivery && sale.dueDate !== sale.originalDueDate)
    pdf.paragraph(
      sale.dueDate
        ? `Vencimiento vigente: ${calendarDate(sale.dueDate)}`
        : 'Actualmente sin fecha pactada.',
      { size: 9 },
    );
  pdf.paragraph(
    sale.settlementBasis === 'divisa'
      ? 'Acuerdo en divisa: USD/USDT 1:1; Bs. a tasa USDT de compra verificada al cobrar.'
      : sale.settlementBasis === 'legacy_bcv'
        ? 'Acuerdo histórico conservado: bolívares según BCV.'
        : 'Acuerdo BCV: se conserva el precio USD pactado al registrar abonos.',
    { size: 9 },
  );
  if (sale.cancellation?.reason)
    pdf.paragraph(`Motivo de anulación: ${sale.cancellation.reason}`, { size: 9 });
  const caption = `Abonado y saldo ACTUALES al imprimir: ${date(pdf.generatedAt)} (Caracas). Productos, precios y condición conservan el registro original.`;
  const final = pdf.totalsBlock(
    [
      { label: 'Total de la venta', value: `USD ${amount(sale.totalUsd)}`, emphasis: true },
      { label: 'Abonado vigente', value: `USD ${amount(sale.paidUsd)}` },
      {
        label: sale.status === 'cancelled' ? 'Saldo actual (venta anulada)' : 'Saldo actual',
        value: `USD ${amount(sale.balanceUsd)}`,
        emphasis: true,
      },
    ],
    caption,
    delivery,
  );
  const notesHeight = sale.notes ? 26 + pdf.paragraphHeight(sale.notes, { size: 9 }) : 0;
  pdf.table({
    title: 'Detalle de mercancía',
    headers: ['N.º', 'Producto y presentación', 'Cant.', 'P. unitario USD', 'Subtotal USD'],
    widths: [26, pdf.contentWidth - 270, 44, 99, 101],
    rightAligned: [0, 2, 3, 4],
    rows: sale.lines.map((line, index) => ({
      id: line.id,
      values: [
        String(index + 1),
        `${line.description} / ${line.commercialUnitLabel ?? presentation[line.presentation]}`,
        String(line.quantity),
        amount(line.agreedUnitUsd, 4),
        amount(line.totalUsd),
      ],
    })),
    keepLastWith: delivery || sale.payments.length === 0 ? final.height + notesHeight + 10 : 0,
  });
  if (!delivery && sale.payments.length) {
    pdf.section('Abonos registrados');
    for (const payment of sale.payments)
      pdf.paragraph(
        `${payment.number} - ${date(payment.receivedAt)} - ${payment.currency} ${amount(payment.amount)} - Aplicado USD ${amount(payment.appliedUsd)}${payment.reversed ? ' - REVERSADO' : ''}`,
        { size: 9 },
      );
  }
  if (sale.notes) {
    pdf.section('Observaciones');
    pdf.paragraph(sale.notes, { size: 9 });
  }
  final.draw();
  return pdf.finish();
}

export async function salePdf(
  sale: SaleDetail,
  kind: 'sale' | 'delivery' = 'sale',
  options: PdfOptions = {},
): Promise<Buffer> {
  return (await composeSalePdf(sale, kind, options)).bytes;
}

export async function composePaymentPdf(payment: PaymentDetail, options: PdfOptions = {}) {
  const pdf = await createPdfLayout({
    title: 'RECIBO DE ABONO',
    number: payment.number,
    isDemo: payment.isDemo,
    warning: payment.reversed ? 'ABONO REVERSADO' : undefined,
    footer: 'Documento comercial. No constituye factura fiscal SENIAT.',
    options,
  });
  pdf.paragraph(`Abono: ${date(payment.receivedAt)} - Hora de Venezuela`, { size: 9 });
  pdf.paragraph(`Impreso: ${date(pdf.generatedAt)} (Caracas)`, { size: 9, muted: true });
  pdf.paragraph(`Cliente: ${payment.client.name}`, { bold: true, size: 11 });
  if (payment.client.taxId)
    pdf.paragraph(`Identificación / RIF: ${payment.client.taxId}`, { size: 9 });
  if (payment.client.phone) pdf.paragraph(`Teléfono: ${payment.client.phone}`, { size: 9 });
  pdf.paragraph(`Forma de pago: ${paymentMethodLabel(payment.method)}`, { size: 9 });
  pdf.paragraph(`Operador: ${payment.operatorName ?? payment.actor}`, { size: 9 });
  if (payment.reversal?.reason)
    pdf.paragraph(`Motivo de reversión: ${payment.reversal.reason}`, { size: 9 });
  pdf.section('Monto recibido');
  pdf.paragraph(`${payment.currency} ${amount(payment.amount)}`, { bold: true, size: 16, gap: 8 });
  if (payment.bcvRate) {
    pdf.paragraph(`BCV histórico: ${payment.bcvRate.rate} VES por USD`, { size: 9 });
    pdf.paragraph(`Fuente oficial: ${payment.bcvRate.sourceUrl}`, { size: 9 });
  }
  if (payment.usdtRate) {
    pdf.paragraph(`USDT de compra histórico: ${payment.usdtRate.rate} VES por USDT`, { size: 9 });
    pdf.paragraph(`Fuente comercial: ${payment.usdtRate.sourceUrl}`, { size: 9 });
    pdf.paragraph('Conversión aplicada al acuerdo en divisa; no corresponde a la tasa BCV.', {
      size: 9,
    });
  }
  if (payment.currency === 'USDT') {
    pdf.paragraph('USDT recibido aplicado 1:1 a la deuda USD.', { size: 9 });
    if (payment.usdtReferenceRate) {
      pdf.paragraph(
        `Referencia informativa: Bs. ${amount(payment.usdtReferenceRate.equivalentVes)}. No representa bolívares recibidos.`,
        { size: 9 },
      );
      pdf.paragraph(
        `Binance compra: ${payment.usdtReferenceRate.rate} VES por USDT - ${payment.usdtReferenceRate.sourceUrl}`,
        { size: 9 },
      );
      pdf.paragraph(
        `Referencia válida desde ${date(payment.usdtReferenceRate.validFrom)} hasta ${date(payment.usdtReferenceRate.validUntil)} (Caracas).`,
        { size: 9 },
      );
    } else pdf.paragraph('Equivalencia informativa en Bs. no disponible.', { size: 9 });
  }
  if (payment.conversionRoundingUsd && !new Decimal(payment.conversionRoundingUsd).isZero())
    pdf.paragraph(
      `Ajuste por liquidación del importe exacto en Bs.: USD ${payment.conversionRoundingUsd}.`,
      { size: 9 },
    );
  const final = pdf.totalsBlock(
    [{ label: 'Equivalente aplicado', value: `USD ${amount(payment.amountUsd)}`, emphasis: true }],
    'Los saldos de esta tabla son los posteriores a ESTE abono; no son saldos actuales. Los movimientos siguientes se consultan en el estado de cuenta.',
    false,
  );
  pdf.table({
    title: 'Aplicación por comprobante',
    headers: ['Comprobante', 'Aplicado USD', 'Saldo al registrar USD'],
    widths: [pdf.contentWidth - 240, 110, 130],
    rightAligned: [1, 2],
    rows: payment.applications.map((entry) => ({
      id: entry.saleId,
      values: [entry.number, amount(entry.amountUsd), amount(entry.balanceAfterUsd)],
    })),
    keepLastWith: final.height + 10,
  });
  final.draw();
  return pdf.finish();
}

export async function paymentPdf(
  payment: PaymentDetail,
  options: PdfOptions = {},
): Promise<Buffer> {
  return (await composePaymentPdf(payment, options)).bytes;
}
