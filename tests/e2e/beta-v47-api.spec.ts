import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import type { PaymentDetail, ReceiptResult, SaleDetail } from '../../packages/domain/src/index';
import { loginRequest } from './helpers/auth';
import { commerceHeaders, commercePost, commercialCustomer } from './helpers/commerce';
import {
  manualSale,
  manualSaleInput,
  receiveUnknown,
  unknownCostLine,
  unpricedProduct,
} from './helpers/operation-v45';
import { receiptDatabase } from './helpers/receipt-v42';
import { syntheticPaymentRates } from './helpers/rates';

// Deliberately excludes authentication activity: GETs may renew a session, but
// must never change commercial rows, quantities, command receipts or audit.
const businessTables = [
  'fruits',
  'varieties',
  'calibers',
  'product_variants',
  'packing_rules',
  'suppliers',
  'clients',
  'purchases',
  'purchase_lines',
  'lots',
  'containers',
  'stock_balances',
  'inventory_movements',
  'inventory_entries',
  'inventory_cost_entries',
  'inventory_cost_openings',
  'sales',
  'sale_lines',
  'sale_allocations',
  'payments',
  'payment_applications',
  'sale_cancellations',
  'payment_reversals',
  'sale_date_events',
  'command_receipts',
  'audit_events',
  'price_items',
  'price_lists',
  'bcv_rates',
  'usdt_rates',
] as const;
async function businessFingerprint() {
  return receiptDatabase(async (db) => {
    const result: Record<string, { count: number; hash: string }> = {};
    for (const table of businessTables)
      result[table] = (
        await db.query(`select count(*)::int count,
        md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by to_jsonb(t)::text),'')) hash
        from ${table} t`)
      ).rows[0];
    return result;
  });
}
async function assertPdf(
  request: APIRequestContext,
  url: string,
  disposition: 'inline' | 'attachment',
  size: 'letter' | 'a4' = 'letter',
) {
  const response = await request.get(url);
  expect(response.status(), response.ok() ? undefined : await response.text()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/pdf');
  expect(response.headers()['content-disposition']).toMatch(
    new RegExp(`^${disposition}; filename="(entrega|venta|abono)-[a-f0-9-]{36}\\.pdf"$`),
  );
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  const body = await response.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  const pdf = await PDFDocument.load(body);
  for (const page of pdf.getPages()) {
    expect(page.getWidth()).toBeCloseTo(size === 'letter' ? 612 : 595.28, 1);
    expect(page.getHeight()).toBeCloseTo(size === 'letter' ? 792 : 841.89, 1);
  }
  return pdf;
}
test.beforeEach(async ({ request }) => loginRequest(request));

test('V4.7 recepción de 50 líneas sin costo ni proveedor: atomicidad, límites y replay exacto', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const key = randomUUID();
  const body = {
    schemaVersion: 3,
    lines: Array.from({ length: 50 }, () => unknownCostLine(rule, 1)),
  };
  const before = await businessFingerprint();
  for (const lines of [
    [...body.lines, unknownCostLine(rule, 1)],
    [unknownCostLine(rule, 1000), unknownCostLine(rule, 1)],
  ]) {
    const rejected = await request.post('/api/receipts', {
      headers: commerceHeaders(),
      data: { ...body, lines },
    });
    expect(rejected.status()).toBe(400);
    expect(await businessFingerprint()).toEqual(before);
  }
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', body, key);
  expect(receipt.lots).toHaveLength(50);
  expect(new Set(receipt.lots.map((lot) => lot.id)).size).toBe(50);
  await receiptDatabase(async (db) => {
    const ids = receipt.lots.map((lot) => lot.id);
    expect(
      (
        await db.query(
          `select count(*)::int total, count(unit_cost_usd)::int known
      from lots where id=any($1::uuid[])`,
          [ids],
        )
      ).rows[0],
    ).toEqual({ total: 50, known: 0 });
    expect(
      (
        await db.query(
          `select sum(s.quantity)::int quantity, count(s.cost_usd)::int known
      from stock_balances s join containers c on c.id=s.container_id where c.lot_id=any($1::uuid[])`,
          [ids],
        )
      ).rows[0],
    ).toEqual({ quantity: 50, known: 0 });
    expect(
      (
        await db.query(
          `select count(*)::int total, count(p.supplier_id)::int suppliers,
      count(pl.unit_cost_usd)::int known from purchase_lines pl join purchases p on p.id=pl.purchase_id
      join lots l on l.purchase_line_id=pl.id where l.id=any($1::uuid[])`,
          [ids],
        )
      ).rows[0],
    ).toEqual({ total: 50, suppliers: 0, known: 0 });
  });
  const saved = await businessFingerprint();
  expect(saved.price_items).toEqual(before.price_items);
  expect(saved.price_lists).toEqual(before.price_lists);
  expect(await commercePost(request, '/api/receipts', body, key)).toEqual(receipt);
  const conflict = await request.post('/api/receipts', {
    headers: commerceHeaders(key),
    data: { ...body, lines: body.lines.slice(1) },
  });
  expect(conflict.status()).toBe(409);
  expect(await businessFingerprint()).toEqual(saved);
});

test('V4.7 notas privadas de 50 líneas, descarga Carta/A4 y reimpresión no escriben ningún registro comercial', async ({
  request,
  playwright,
}) => {
  const rule = await unpricedProduct(request);
  const customer = await commercialCustomer(request);
  await receiveUnknown(request, rule, 60);
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    ...manualSaleInput(customer, rule, 1),
    lines: Array.from({ length: 50 }, (_, index) => ({
      configurationId: rule.id,
      presentation: 'box',
      quantity: 1,
      agreedUnitUsd: String(index + 1),
    })),
  });
  expect(sale.lines).toHaveLength(50);
  expect(sale.totalUsd).toBe('1275.00');
  const payments: PaymentDetail[] = [];
  for (const amount of ['10.00', '15.00'])
    payments.push(
      await commercePost<PaymentDetail>(request, '/api/payments', {
        clientId: customer.id,
        currency: 'USD',
        amount,
        method: 'usd_cash',
        receivedAt: new Date().toISOString(),
        applications: [{ saleId: sale.id, amountUsd: amount }],
      }),
    );
  const cancelled = await manualSale(request, customer, rule, 1);
  await commercePost(request, `/api/sales/${cancelled.id}/cancel`, {
    reason: 'QA nota anulada conserva historia y no entrega',
  });
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(current.balanceUsd).toBe('1250.00');
  const before = await businessFingerprint();
  const base = `/api/sales/${sale.id}/delivery-note`;
  expect((await assertPdf(request, base, 'inline')).getPageCount()).toBeGreaterThan(1);
  await assertPdf(request, base + '?download=1', 'attachment');
  await assertPdf(request, base + '?size=a4&download=1', 'attachment', 'a4');
  await assertPdf(request, base, 'inline');
  await assertPdf(request, `/api/sales/${cancelled.id}/delivery-note`, 'inline');
  await assertPdf(request, `/api/sales/${sale.id}/document`, 'attachment');
  await assertPdf(request, `/api/payments/${payments[0]!.id}/document`, 'attachment');
  for (const query of [
    '?size=giant',
    '?download=javascript',
    '?size=a4&size=letter',
    '?unknown=1',
  ]) {
    const invalid = await request.get(base + query);
    expect(invalid.status()).toBe(400);
    expect(invalid.headers()['cache-control']).toContain('no-store');
    expect(invalid.headers()['content-type']).not.toContain('application/pdf');
  }
  const missing = await request.get(`/api/sales/${randomUUID()}/delivery-note`);
  expect(missing.status()).toBe(404);
  expect(missing.headers()['cache-control']).toContain('no-store');
  const anonymous = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3200' });
  try {
    for (const suffix of ['delivery-note', 'delivery-note?download=1', 'document']) {
      const denied = await anonymous.get(`/api/sales/${sale.id}/${suffix}`);
      expect(denied.status()).toBe(401);
      expect(denied.headers()['cache-control']).toContain('no-store');
      expect(await denied.text()).not.toContain(sale.number);
    }
  } finally {
    await anonymous.dispose();
  }
  expect(await (await request.get(`/api/sales/${sale.id}`)).json()).toEqual(current);
  expect(await businessFingerprint()).toEqual(before);
});

test('V4.7 una tasa que vence esperando el INSERT rechaza el cobro completo sin modificar deuda', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const customer = await commercialCustomer(request);
  await receiveUnknown(request, rule, 1);
  const sale = await manualSale(request, customer, rule, 1, '40');
  const rates = await syntheticPaymentRates({ usdt: '390.12345678', validForMs: 3000 });
  const before = await businessFingerprint();
  let pending: ReturnType<APIRequestContext['post']> | undefined;
  await receiptDatabase(async (db) => {
    // Delay only this disposable QA database's payment INSERT after the API
    // has read its valid quote. No production target can pass receiptDatabase.
    await db.query('lock table payments in share mode');
    pending = request.post('/api/payments', {
      headers: commerceHeaders(),
      data: {
        clientId: customer.id,
        currency: 'VES',
        amount: '15604.94',
        method: 'bolivares',
        rateId: rates.usdt.id,
        receivedAt: new Date().toISOString(),
        applications: [{ saleId: sale.id, amountUsd: '40.00' }],
      },
    });
    await expect
      .poll(
        async () => {
          await db.query('select pg_stat_clear_snapshot()');
          return (
            await db.query(`select exists(select 1 from pg_stat_activity
      where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock'
      and query ilike 'insert into payments%' and pg_backend_pid()=any(pg_blocking_pids(pid))) blocked`)
          ).rows[0].blocked;
        },
        { timeout: 2000, intervals: [50, 100, 150] },
      )
      .toBe(true);
    await db.query(
      `select pg_sleep(greatest(0,extract(epoch from $1::timestamptz-clock_timestamp()))+0.1)`,
      [rates.usdt.validUntil],
    );
    await db.query('rollback');
  }, true);
  const rejected = await pending!;
  expect(rejected.status(), await rejected.text()).toBe(400);
  expect((await (await request.get(`/api/sales/${sale.id}`)).json()).balanceUsd).toBe('40.00');
  expect(await businessFingerprint()).toEqual(before);
});

test('V4.7 importes altos mantienen cuatro decimales de precio y liquidación VES exacta', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const customer = await commercialCustomer(request);
  await receiveUnknown(request, rule, 2);
  const before = await businessFingerprint();
  const excessive = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: manualSaleInput(customer, rule, 1, '100000000000'),
  });
  expect(excessive.status()).toBe(400);
  expect(await businessFingerprint()).toEqual(before);
  const sale = await manualSale(request, customer, rule, 2, '49999999999.9950');
  expect(sale.totalUsd).toBe('99999999999.99');
  expect(sale.lines[0]!.agreedUnitUsd).toBe('49999999999.9950');
  const rates = await syntheticPaymentRates({ usdt: '0.60000000' });
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'VES',
    amount: '59999999999.99',
    method: 'bolivares',
    rateId: rates.usdt.id,
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '99999999999.99' }],
  });
  expect(payment.amountUsd).toBe('99999999999.99');
  expect(payment.conversionRoundingUsd).toBe('0.01');
  expect((await (await request.get(`/api/sales/${sale.id}`)).json()).balanceUsd).toBe('0.00');
  await assertPdf(request, `/api/sales/${sale.id}/delivery-note`, 'inline');
});
