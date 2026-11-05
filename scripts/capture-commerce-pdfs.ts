import fs from 'node:fs/promises';
import path from 'node:path';
import { salePdf, paymentPdf } from '../apps/api/src/commerce-pdf';
import type { SaleDetail, PaymentDetail } from '../packages/domain/src/commerce';
const output = path.resolve('.local/pdf-qa');
const client = {
  name: 'DEMO Bodegón José y María',
  phone: null,
  taxId: null,
  address: 'Dirección sintética para revisión visual',
};
const payment: PaymentDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  number: 'AB-DEMO-00000001',
  clientId: '00000000-0000-4000-8000-000000000002',
  clientName: client.name,
  client,
  currency: 'USD',
  amount: '80.00',
  amountUsd: '80.00',
  method: 'Efectivo',
  receivedAt: '2026-11-04T14:00:00Z',
  actor: 'Operador DEMO',
  isDemo: true,
  reversed: false,
  bcvRate: null,
  usdtRate: null,
  reversal: null,
  applications: [
    {
      saleId: '00000000-0000-4000-8000-000000000003',
      number: 'V-DEMO-00000001',
      amountUsd: '80.00',
      balanceAfterUsd: '120.00',
    },
  ],
};
const sale: SaleDetail = {
  id: '00000000-0000-4000-8000-000000000003',
  number: 'V-DEMO-00000001',
  clientId: payment.clientId,
  clientName: client.name,
  client,
  condition: 'credit',
  settlementBasis: 'divisa',
  status: 'confirmed',
  soldAt: '2026-11-04T12:00:00Z',
  dueDate: '2026-11-11',
  originalDueDate: '2026-11-11',
  reminderDate: '2026-11-10',
  totalUsd: '200.00',
  paidUsd: '80.00',
  balanceUsd: '120.00',
  costUsd: '125.0000',
  grossProfitUsd: '75.0000',
  discountUsd: '10.00',
  isDemo: true,
  dueStatus: 'pending',
  notes:
    'Documento sintético para revisar el diseño. La mercancía y los importes de este archivo no son operaciones del negocio.',
  actor: 'Operador DEMO',
  lines: [
    {
      id: '00000000-0000-4000-8000-000000000004',
      variantId: '00000000-0000-4000-8000-000000000005',
      configurationId: '00000000-0000-4000-8000-000000000006',
      description: 'Manzana Gala · Cal. 100 · Bandejas',
      presentation: 'box',
      quantity: 5,
      priceBasis: 'usd_cash_promo',
      referenceUnitUsd: '42.0000',
      agreedUnitUsd: '40.0000',
      totalUsd: '200.00',
      costUsd: '125.0000',
      allocations: [],
    },
  ],
  payments: [{ ...payment, appliedUsd: '80.00' }],
  dateHistory: [],
  cancellation: null,
  whatsappUrl: null,
};
async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.writeFile(path.join(output, 'venta-demo.pdf'), await salePdf(sale));
  await fs.writeFile(path.join(output, 'abono-demo.pdf'), await paymentPdf(payment));
  await fs.writeFile(
    path.join(output, 'abono-usdt-demo.pdf'),
    await paymentPdf({
      ...payment,
      currency: 'USDT',
      method: 'usdt_transfer',
    }),
  );
  await fs.writeFile(
    path.join(output, 'abono-ves-divisa-demo.pdf'),
    await paymentPdf({
      ...payment,
      currency: 'VES',
      amount: '8000.00',
      method: 'bolivares',
      usdtRate: {
        id: '00000000-0000-4000-8000-000000000007',
        rate: '100.00000000',
        sourceUrl: 'https://p2p.binance.com/',
        validFrom: '2026-11-04T13:59:00Z',
        validUntil: '2026-11-04T14:05:00Z',
      },
    }),
  );
  await fs.writeFile(
    path.join(output, 'venta-larga-demo.pdf'),
    await salePdf({
      ...sale,
      number: 'V-DEMO-50-LINEAS',
      totalUsd: '10000.00',
      balanceUsd: '9920.00',
      costUsd: '6250.0000',
      grossProfitUsd: '3750.0000',
      discountUsd: '500.00',
      lines: Array.from({ length: 50 }, (_, index) => ({
        ...sale.lines[0],
        id: `linea-${index}`,
        description: `DEMO Producto ${index + 1} de descripción extensa: manzana de presentación comercial con variedad y calibre conservados históricamente.`,
      })),
    }),
  );
  console.log(
    'Generados cinco PDF sintéticos para QA visual en .local/pdf-qa; no se modificó ninguna base.',
  );
}
main().catch(() => {
  console.error('No se pudo generar la muestra PDF.');
  process.exitCode = 1;
});
