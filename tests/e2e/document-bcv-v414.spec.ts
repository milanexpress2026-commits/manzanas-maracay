import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { loginPage } from './helpers/auth';
import { commercePost, commercialCustomer } from './helpers/commerce';
import { unpricedProduct, receiveUnknown, manualSaleInput } from './helpers/operation-v45';
import type { SaleDetail } from '../../packages/domain/src/commerce';

async function textOf(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  return doc
    .getPages()
    .map((page) => {
      const contents = page.node.Contents();
      return (contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [])
        .map((value) => {
          const stream = doc.context.lookup(value);
          if (!(stream instanceof PDFRawStream)) throw new Error('Expected PDF content');
          const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString('latin1');
          return [...operators.matchAll(/<([A-Fa-f0-9]+)>\s*Tj/g)]
            .map((match) => new TextDecoder('windows-1252').decode(Buffer.from(match[1]!, 'hex')))
            .join(' ');
        })
        .join(' ');
    })
    .join(' ');
}

test('V4.14 crédito BCV imprime la tasa de la venta y conserva datos tras abono y reimpresión', async ({
  page,
}) => {
  test.setTimeout(120000);
  const target = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55432' ||
    target.username !== 'mm_owner' ||
    target.search ||
    target.hash
  )
    throw new Error('Solo la base local de pruebas.');
  target.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: target.toString(), statement_timeout: 10000 });
  await db.connect();
  try {
    const binding = (
      await db.query('select environment,database_name from runtime_environment where singleton')
    ).rows[0];
    expect(binding).toEqual({ environment: 'test', database_name: 'manzanas_maracay_test' });
    // Distinct old dates cannot overlap other suites' current synthetic quotes.
    for (const [day, rate] of [
      ['2001-01-04', '45.12345678'],
      ['2001-01-05', '99.00000000'],
    ] as const) {
      const id = randomUUID(),
        from = new Date(day + 'T04:00:00Z');
      await db.query(
        `insert into bcv_rates(id,rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
        values($1,$2,'BCV','https://www.bcv.org.ve/',$3,$4,$5,$6,$6,'QA V4.14 SINTÉTICA LOCAL; NO COTIZACIÓN REAL')`,
        [
          id,
          rate,
          createHash('sha256').update(id).digest('hex'),
          from,
          new Date(+from + 86400000),
          new Date(+from - 3600000),
        ],
      );
    }
  } finally {
    await db.end();
  }
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request);
  const receipt = await receiveUnknown(page.request, product, 3, '2001-01-03T15:00:00Z');
  const input = {
    ...manualSaleInput(client, product, 1, '40', 'box', 'bcv'),
    soldAt: '2001-01-04T15:00:00Z',
  };
  const sale = await commercePost<SaleDetail>(page.request, '/api/sales', input);
  expect(sale.payments).toEqual([]);
  const stock = await (await page.request.get('/api/inventory/lots/' + receipt.lots[0]!.id)).json();
  for (const suffix of [
    'delivery-note?size=letter',
    'delivery-note?size=a4&download=1',
    'document',
  ]) {
    const res = await page.request.get('/api/sales/' + sale.id + '/' + suffix);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('application/pdf');
    const text = await textOf(await res.body());
    expect(text).toContain('Total en bolívares');
    expect(text).toContain('Bs. 1.804,94');
    expect(text).toContain('45,12345678');
    expect(text).toContain('04/01/2001');
    expect(text).not.toContain('99,00000000');
    if (suffix.startsWith('delivery')) {
      expect(text).not.toContain('Saldo actual');
      expect(text).not.toContain('Observaciones');
    }
  }
  expect(await (await page.request.get('/api/sales/' + sale.id)).json()).toEqual(sale);
  expect(
    await (await page.request.get('/api/inventory/lots/' + receipt.lots[0]!.id)).json(),
  ).toEqual(stock);
  await commercePost(page.request, '/api/payments', {
    clientId: client.id,
    currency: 'USD',
    amount: '10',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  const paid = await (await page.request.get('/api/sales/' + sale.id)).json();
  expect(paid).toMatchObject({ totalUsd: '40.00', paidUsd: '10.00', balanceUsd: '30.00' });
  const reprint = await page.request.get('/api/sales/' + sale.id + '/delivery-note');
  expect(await textOf(await reprint.body())).toContain('Bs. 1.804,94');
  expect(await (await page.request.get('/api/sales/' + sale.id)).json()).toEqual(paid);
  const missing = await commercePost<SaleDetail>(page.request, '/api/sales', {
    ...input,
    soldAt: '2001-01-06T15:00:00Z',
  });
  const unavailable = await page.request.get('/api/sales/' + missing.id + '/delivery-note');
  expect(unavailable.status()).toBe(200);
  expect(await textOf(await unavailable.body())).toContain('Equivalente en Bs. no calculado');
});
