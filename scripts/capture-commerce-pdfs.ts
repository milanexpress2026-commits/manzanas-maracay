import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { composeSalePdf, composePaymentPdf } from '../apps/api/src/commerce-pdf';
import {
  PDF_QA_PRINTED_AT,
  pdfSaleFixture,
  pdfPaymentFixture,
  pdfUnicodeFixture,
} from '../tests/fixtures/commerce-pdf';

// Offline, synthetic fixtures only. No database/service/environment configuration is read.
const output = path.resolve('.local/pdf-qa/v4-7');
const published = path.resolve('docs/capturas/impresion-v4-7');
const options = { generatedAt: PDF_QA_PRINTED_AT };
async function main() {
  await fs.mkdir(output, { recursive: true });
  await fs.mkdir(published, { recursive: true });
  const samples = [1, 5, 10, 15, 25, 35, 50].map((count) => {
    const sale = pdfSaleFixture(count);
    return {
      name: `entrega-${String(count).padStart(2, '0')}`,
      expectedRows: count,
      totalUsd: sale.totalUsd,
      publish: [1, 25, 50].includes(count),
      compose: () => composeSalePdf(sale, 'delivery', options),
    };
  });
  const sale = pdfSaleFixture(25);
  const cancelled = pdfSaleFixture(25);
  cancelled.status = 'cancelled';
  cancelled.balanceUsd = '0.00';
  cancelled.cancellation = {
    reason: 'Anulación sintética para revisar marca en todas las páginas.',
    actor: 'DEMO',
    createdAt: '2026-11-06T14:00:00Z',
  };
  const payment = pdfPaymentFixture();
  samples.push(
    {
      name: 'comprobante-25',
      expectedRows: 25,
      totalUsd: sale.totalUsd,
      publish: false,
      compose: () => composeSalePdf(sale, 'sale', options),
    },
    {
      name: 'abono-usdt',
      expectedRows: 1,
      totalUsd: payment.amountUsd,
      publish: false,
      compose: () => composePaymentPdf(payment, options),
    },
    {
      name: 'entrega-anulada-25',
      expectedRows: 25,
      totalUsd: cancelled.totalUsd,
      publish: false,
      compose: () => composeSalePdf(cancelled, 'delivery', options),
    },
    {
      name: 'entrega-a4-25',
      expectedRows: 25,
      totalUsd: sale.totalUsd,
      publish: false,
      compose: () => composeSalePdf(sale, 'delivery', { ...options, size: 'a4' }),
    },
    {
      name: 'entrega-unicode',
      expectedRows: 1,
      totalUsd: '40.00',
      publish: false,
      compose: () => composeSalePdf(pdfUnicodeFixture(), 'delivery', options),
    },
  );
  const manifest = [];
  for (const sample of samples) {
    const { bytes, layout } = await sample.compose();
    const rows = layout.blocks.filter((block) => block.role === 'row');
    if (
      rows.length !== sample.expectedRows ||
      new Set(rows.map((row) => row.id)).size !== rows.length
    )
      throw new Error('Una muestra no conserva sus renglones.');
    await fs.writeFile(path.join(output, sample.name + '.pdf'), bytes);
    await fs.writeFile(
      path.join(output, sample.name + '.layout.json'),
      JSON.stringify(layout, null, 2),
    );
    if (sample.publish) await fs.writeFile(path.join(published, sample.name + '.pdf'), bytes);
    manifest.push({
      name: sample.name,
      pages: layout.pages,
      size: layout.size,
      width: layout.width,
      height: layout.height,
      expectedRows: sample.expectedRows,
      rows: rows.length,
      rowPages: rows.map((row) => row.page),
      totalUsd: sample.totalUsd,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      substitutions: layout.substitutions,
      published: sample.publish,
    });
  }
  await fs.writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      { synthetic: true, generatedAt: PDF_QA_PRINTED_AT.toISOString(), samples: manifest },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({
      synthetic: true,
      generated: manifest.length,
      databaseUsed: false,
      samples: manifest.map(({ name, pages, rows }) => ({ name, pages, rows })),
    }),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Falló la muestra PDF.');
  process.exitCode = 1;
});
