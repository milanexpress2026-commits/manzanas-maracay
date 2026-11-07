import Decimal from 'decimal.js';
import type { PaymentDetail, SaleDetail } from '../../packages/domain/src/commerce';

export const PDF_QA_PRINTED_AT = new Date('2026-11-06T16:34:56.000Z');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const client = {
  name: 'DEMO Bodegón José y María',
  phone: '0000000000',
  taxId: 'DEMO-SIN-RIF',
  address: 'Dirección ficticia para revisar impresión; no corresponde a un cliente real.',
};
export function pdfSaleFixture(count: number, long = count > 1): SaleDetail {
  const lines: SaleDetail['lines'] = Array.from({ length: count }, (_, index) => {
    const quantity = (index % 5) + 1,
      price = new Decimal(40).plus(new Decimal(index).div(10)).toFixed(4);
    const family = [
      'Manzana Gala · Cal. 100 · Tradicional',
      'Manzana Verde · Cal. PC · A granel',
      'Pera Packham · Cal. 135 · Tradicional',
      'Kiwi · Caja 10 kg',
      'Aceituna rellena · Unidad comercial',
    ][index % 5];
    return {
      id: id(index + 100),
      variantId: id(index + 200),
      configurationId: id(index + 300),
      description: `R${String(index + 1).padStart(3, '0')} ${family}${long ? ' · Selección sintética de presentación conservada en el registro original para revisar palabras y saltos de página' : ''}`,
      commercialUnitLabel: index % 5 === 4 ? 'Envase DEMO confirmado' : null,
      presentation: 'box',
      quantity,
      priceBasis: 'manual',
      referenceUnitUsd: null,
      agreedUnitUsd: price,
      totalUsd: new Decimal(price).times(quantity).toFixed(2),
      costUsd: null,
      allocations: [],
    };
  });
  const totalUsd = lines.reduce((sum, line) => sum.plus(line.totalUsd), new Decimal(0)).toFixed(2);
  return {
    id: id(1),
    number: `V-DEMO-${String(count).padStart(2, '0')}-RENGLONES`,
    clientId: id(2),
    clientName: client.name,
    client: { ...client },
    condition: 'credit',
    settlementBasis: 'divisa',
    status: 'confirmed',
    soldAt: '2026-11-05T15:15:30Z',
    dueDate: '2026-11-20',
    originalDueDate: '2026-11-12',
    reminderDate: null,
    totalUsd,
    paidUsd: '10.00',
    balanceUsd: new Decimal(totalUsd).minus(10).toFixed(2),
    costUsd: null,
    grossProfitUsd: null,
    discountUsd: null,
    isDemo: true,
    dueStatus: 'pending',
    notes:
      'Muestra ficticia para QA. Verificar mercancía al recibir. Esta impresión no registra operaciones.',
    actor: 'Cuenta DEMO',
    lines,
    payments: [],
    dateHistory: [],
    cancellation: null,
    whatsappUrl: null,
  };
}

export function pdfPaymentFixture(): PaymentDetail {
  return {
    id: id(500),
    number: 'AB-DEMO-0001',
    clientId: id(2),
    clientName: client.name,
    client: { ...client },
    currency: 'USDT',
    amount: '10.00',
    amountUsd: '10.00',
    method: 'usdt_transfer',
    receivedAt: '2026-11-05T16:10:30Z',
    actor: 'Cuenta DEMO',
    operatorName: 'Cuenta DEMO',
    isDemo: true,
    reversed: false,
    bcvRate: null,
    usdtRate: null,
    reversal: null,
    usdtReferenceRate: {
      id: id(501),
      rate: '125.12345678',
      sourceUrl: 'https://p2p.binance.com/',
      validFrom: '2026-11-05T16:10:00Z',
      validUntil: '2026-11-05T16:15:00Z',
      equivalentVes: '1251.23',
    },
    applications: [
      {
        saleId: id(1),
        number: 'V-DEMO-01-RENGLONES',
        amountUsd: '10.00',
        balanceAfterUsd: '30.00',
      },
    ],
  };
}

export function pdfUnicodeFixture(): SaleDetail {
  const sale = pdfSaleFixture(1);
  sale.client = {
    ...sale.client,
    name: 'DEMO ÁÉÍÓÚÜÑ áéíóúüñ ¿¡ € £ ¥ 😀 🍎 👨‍👩‍👧‍👦',
    address: 'Dirección ' + 'PalabraSinEspacios'.repeat(10),
  };
  sale.notes =
    '<script>alert("literal")</script> javascript:alert(1) <img src="https://invalid.example/logo">\u0000\u0001\u0085\u202e TEXTO_FINAL';
  return sale;
}
