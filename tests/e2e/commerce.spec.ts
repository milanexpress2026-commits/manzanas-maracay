import { historicalSaleCost, historicalContainerCosts } from './helpers/historical-cost';
import { test, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { loginRequest } from './helpers/auth';
import {
  commerceHeaders,
  commercePost,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSaleInput,
  commercialSale,
} from './helpers/commerce';
import type {
  SaleDetail,
  PaymentDetail,
  ClientAccount,
  CollectionsOverview,
} from '../../packages/domain/src/commerce';
import type { LotDetail } from '../../packages/domain/src/index';
dotenv.config({ quiet: true });
test.beforeEach(async ({ request }) => loginRequest(request));
async function database<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.pathname = '/manzanas_maracay_test';
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432')
    throw new Error('Solo base local aislada de pruebas.');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
test('FIFO real: 10 cajas a 25 + 10 a 27, venta 12 a 40 conserva costo 304, bruto 176 y remanente 8', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const first = await commercialReceipt(
    request,
    rule,
    10,
    '25',
    new Date(Date.now() - 172800000).toISOString(),
  );
  const second = await commercialReceipt(
    request,
    rule,
    10,
    '27',
    new Date(Date.now() - 86400000).toISOString(),
  );
  const input = commercialSaleInput(customer, rule, 12),
    key = randomUUID();
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input, key);
  expect(sale).toMatchObject({
    totalUsd: '480.00',
    costUsd: null,
    grossProfitUsd: null,
    balanceUsd: '480.00',
    paidUsd: '0.00',
    dueDate: null,
  });
  await historicalSaleCost(sale.id, '304.0000');
  expect(sale.lines[0].allocations.filter((a) => a.lotId === first.lots[0].id)).toHaveLength(10);
  expect(sale.lines[0].allocations.filter((a) => a.lotId === second.lots[0].id)).toHaveLength(2);
  expect(
    (await (await request.get(`/api/inventory/lots/${first.lots[0].id}`)).json()).lot.closedBoxes,
  ).toBe(0);
  expect(
    (await (await request.get(`/api/inventory/lots/${second.lots[0].id}`)).json()).lot.closedBoxes,
  ).toBe(8);
  expect((await commercePost<SaleDetail>(request, '/api/sales', input, key)).id).toBe(sale.id);
  expect(
    (await (await request.get(`/api/inventory/lots/${second.lots[0].id}`)).json()).lot.closedBoxes,
  ).toBe(8);
  const prices = await (await request.get('/api/prices')).json();
  expect(
    prices.find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rule.id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('40.0000');
});
test('venta de un blíster de tres cajas de cinco conserva dos cajas, cuatro blíster y costo 84 de 90', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'blister', '40', 5);
  const customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 3, '30');
  const input = commercialSaleInput(customer, rule, 1, '10', 'blister');
  const key = randomUUID();
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input, key);
  expect(sale).toMatchObject({ totalUsd: '10.00', costUsd: null, grossProfitUsd: null });
  await historicalSaleCost(sale.id, '6.0000');
  expect(sale.lines[0].allocations).toHaveLength(1);
  expect(sale.lines[0].allocations[0]).toMatchObject({
    lotId: receipt.lots[0].id,
    quantity: 1,
    costUsd: null,
  });
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(detail.lot).toMatchObject({
    closedBoxes: 2,
    openBoxes: 1,
    intactBlisters: 4,
    equivalentIntactBlisters: 14,
  });
  expect(detail.containers.every((container) => container.countedPieces === null)).toBe(true);
  expect(detail.containers.every((container) => container.costUsd === null)).toBe(true);
  expect(await historicalContainerCosts(receipt.lots[0].id)).toEqual([
    '0.0000',
    '0.0000',
    '30.0000',
    '30.0000',
    '6.0000',
    '6.0000',
    '6.0000',
    '6.0000',
  ]);
  expect(detail.containers.filter((container) => container.state === 'dispatched')).toHaveLength(1);
  expect((await commercePost<SaleDetail>(request, '/api/sales', input, key)).id).toBe(sale.id);
  const piece = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: { ...input, lines: [{ ...input.lines[0], presentation: 'piece' }] },
  });
  expect(piece.status()).toBe(400);
  const unchanged: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(unchanged.containers).toEqual(detail.containers);
  expect(unchanged.movements).toHaveLength(detail.movements.length);
});
test('negociación 5 por 38 sin cambiar lista; contado cubre total y pago cero se omite en crédito', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 6, '25');
  const soldAt = new Date().toISOString(),
    input = {
      ...commercialSaleInput(customer, rule, 5, '38'),
      soldAt,
      condition: 'cash',
      initialPayment: { currency: 'USD', amount: '190', method: 'Efectivo', receivedAt: soldAt },
    };
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input);
  expect(sale).toMatchObject({
    totalUsd: '190.00',
    discountUsd: '10.00',
    costUsd: null,
    balanceUsd: '0.00',
    dueStatus: 'paid',
  });
  await historicalSaleCost(sale.id, '125.0000');
  expect(sale.lines[0].referenceUnitUsd).toBe('40.0000');
  expect(sale.payments).toHaveLength(1);
  const zero = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: {
      ...commercialSaleInput(customer, rule, 1),
      initialPayment: {
        currency: 'USD',
        amount: '0',
        method: 'Efectivo',
        receivedAt: new Date().toISOString(),
      },
    },
  });
  expect(zero.status()).toBe(400);
  const credit = await commercialSale(request, customer, rule, 1);
  expect(credit.payments).toHaveLength(0);
  expect(credit.balanceUsd).toBe('40.00');
});
test('reparto explícito 80 sobre 200/150/100; recibo, concurrencia y reintento no duplican deuda ni cobro', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'blister', '50'),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 9, '25');
  const sales = await Promise.all(
    [4, 3, 2].map((q) => commercialSale(request, customer, rule, q, '50')),
  );
  const input = {
      clientId: customer.id,
      currency: 'USD',
      amount: '80',
      method: 'Efectivo',
      receivedAt: new Date().toISOString(),
      applications: [{ saleId: sales[0].id, amountUsd: '80' }],
    },
    key = randomUUID();
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', input, key);
  expect(payment.applications[0].balanceAfterUsd).toBe('120.00');
  expect((await commercePost<PaymentDetail>(request, '/api/payments', input, key)).id).toBe(
    payment.id,
  );
  const account: ClientAccount = await (await request.get(`/api/clients/${customer.id}`)).json();
  expect(account.client.balanceUsd).toBe('370.00');
  expect(sales.map((s) => account.sales.find((a) => a.id === s.id)!.balanceUsd)).toEqual([
    '120.00',
    '150.00',
    '100.00',
  ]);
  const pdf = await request.get(`/api/payments/${payment.id}/document`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const concurrent = {
    ...input,
    amount: '120',
    applications: [{ saleId: sales[0].id, amountUsd: '120' }],
  };
  const attempts = await Promise.all(
    [1, 2].map(() =>
      request.post('/api/payments', { headers: commerceHeaders(), data: concurrent }),
    ),
  );
  expect(attempts.map((r) => r.status()).sort()).toEqual([201, 409]);
  const current: SaleDetail = await (await request.get(`/api/sales/${sales[0].id}`)).json();
  expect(current.balanceUsd).toBe('0.00');
  const collections: CollectionsOverview = await (await request.get('/api/collections')).json();
  expect(collections.invoices.some((s) => s.id === sales[0].id)).toBe(false);
});
test('última caja concurrente se vende una sola vez y fallo multilínea conserva todo el inventario', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request),
    receipt = await commercialReceipt(request, rule, 1, '25');
  const invalid = {
    ...commercialSaleInput(customer, rule, 1),
    lines: [
      ...commercialSaleInput(customer, rule, 1).lines,
      ...commercialSaleInput(customer, rule, 1).lines,
    ],
  };
  const failure = await request.post('/api/sales', { headers: commerceHeaders(), data: invalid });
  expect(failure.status()).toBe(409);
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)).json()).lot.closedBoxes,
  ).toBe(1);
  const input = commercialSaleInput(customer, rule, 1),
    attempts = await Promise.all(
      [1, 2].map(() => request.post('/api/sales', { headers: commerceHeaders(), data: input })),
    );
  expect(attempts.map((r) => r.status()).sort()).toEqual([201, 409]);
  const account: ClientAccount = await (await request.get(`/api/clients/${customer.id}`)).json();
  expect(account.sales).toHaveLength(1);
  expect(account.client.balanceUsd).toBe('40.00');
});
test('granel y kiwi venden medias sin piezas; uva rechaza blíster y media', async ({ request }) => {
  const customer = await commercialCustomer(request),
    granel = await commercialProduct(request, 'halves');
  const receipt = await commercialReceipt(request, granel, 10, '25');
  const input = commercialSaleInput(customer, granel, 1);
  input.lines.push({ ...input.lines[0], presentation: 'half_box' });
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input);
  expect(sale.costUsd).toBeNull();
  await historicalSaleCost(sale.id, '37.5000');
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(detail.lot.closedBoxes).toBe(8);
  expect(detail.lot.preparedHalfBoxes).toBe(1);
  expect(detail.lot.intactBlisters).toBe(0);
  expect(detail.containers.every((c) => c.countedPieces === null)).toBe(true);
  const kiwi = await commercialProduct(request, 'halves', '40', 5, '10'),
    kiwiReceipt = await commercialReceipt(request, kiwi, 1, '10');
  await commercialSale(request, customer, kiwi, 1, '20', 'half_box');
  const kiwiDetail: LotDetail = await (
    await request.get(`/api/inventory/lots/${kiwiReceipt.lots[0].id}`)
  ).json();
  expect(kiwiDetail.lot.closedBoxes).toBe(0);
  expect(kiwiDetail.lot.preparedHalfBoxes).toBe(1);
  expect(kiwiDetail.lot.equivalentBoxes).toBe(0.5);
  expect(Number(kiwiDetail.lot.boxWeightKgSnapshot)).toBe(10);
  expect(kiwiDetail.containers.every((container) => container.countedPieces === null)).toBe(true);
  const uva = await commercialProduct(request, 'whole');
  await commercialReceipt(request, uva, 1, '20');
  for (const presentation of ['half_box', 'blister'] as const)
    expect(
      (
        await request.post('/api/sales', {
          headers: commerceHeaders(),
          data: commercialSaleInput(customer, uva, 1, '40', presentation),
        })
      ).status(),
    ).toBe(400);
  expect((await commercialSale(request, customer, uva, 1)).totalUsd).toBe('40.00');
});
test('reversa comercial conserva documento y costo, restaura stock y rectifica abono con evento', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request),
    receipt = await commercialReceipt(request, rule, 1, '25');
  const sale = await commercialSale(request, customer, rule, 1);
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '10',
    method: 'Efectivo',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  expect(
    (
      await request.post(`/api/sales/${sale.id}/cancel`, {
        headers: commerceHeaders(),
        data: { reason: 'Corrección de prueba' },
      })
    ).status(),
  ).toBe(409);
  const reversed = await commercePost<PaymentDetail>(
    request,
    `/api/payments/${payment.id}/reverse`,
    { reason: 'Monto registrado en comprobante equivocado' },
  );
  expect(reversed.reversed).toBe(true);
  expect(reversed.amountUsd).toBe('10.00');
  const cancelled = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'Mercancía no entregada en prueba',
  });
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.balanceUsd).toBe('0.00');
  expect(cancelled.costUsd).toBeNull();
  await historicalSaleCost(cancelled.id, '25.0000');
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(detail.lot.closedBoxes).toBe(1);
  expect(detail.movements.some((m) => m.kind === 'reversal')).toBe(true);
  await database(async (db) => {
    await db.query('begin');
    try {
      await expect(
        db.query('update sale_lines set agreed_unit_usd=1 where sale_id=$1', [sale.id]),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
  });
});
test('fecha pactada e interna separadas y WhatsApp utiliza teléfono y saldo actuales', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 1, '25');
  const sale = await commercialSale(request, customer, rule, 1);
  expect(sale.dueDate).toBeNull();
  const changed = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/dates`, {
    dueDate: null,
    reminderDate: '2027-01-15',
    reason: 'Recordatorio interno, sin promesa del cliente',
  });
  expect(changed.originalDueDate).toBeNull();
  expect(changed.dueDate).toBeNull();
  expect(changed.dateHistory).toHaveLength(1);
  await commercePost(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '10',
    method: 'Efectivo',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(decodeURIComponent(current.whatsappUrl!)).toContain('USD 30.00');
  expect(current.whatsappUrl).toMatch(/^https:\/\/wa.me\/584120000001/);
  const pdf = await request.get(`/api/sales/${sale.id}/document`);
  expect(pdf.ok()).toBe(true);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
});
test('PostgreSQL impide venta sin egreso y cambios tardíos de aplicaciones o documentos', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 2, '25');
  const sale = await commercialSale(request, customer, rule, 1),
    other = await commercialSale(request, customer, rule, 1);
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '10',
    method: 'Efectivo',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  await database(async (db) => {
    await db.query('begin');
    try {
      await db.query(
        "insert into sales(number,client_id,condition,status,sold_at,total_usd,is_demo) values($1,$2,'credit','confirmed',now(),1,true)",
        [randomUUID(), customer.id],
      );
      await expect(db.query('commit')).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
    await db.query('begin');
    try {
      await expect(
        db.query(
          'insert into payment_applications(payment_id,sale_id,client_id,amount_usd) values($1,$2,$3,1)',
          [payment.id, other.id, customer.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
    await db.query('begin');
    try {
      await expect(
        db.query('delete from payments where id=$1', [payment.id]),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
  });
});
test('VES BCV exige cotización vigente; reintento tras vencimiento conserva precio, deuda y recibo', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const rateId = randomUUID(),
    historical = new Date();
  await commercialReceipt(
    request,
    rule,
    1,
    '25',
    new Date(historical.getTime() - 86400000).toISOString(),
  );
  const saleInput = commercialSaleInput(customer, rule, 1);
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    ...saleInput,
    lines: saleInput.lines.map((line) => ({ ...line, priceBasis: 'ves_regular' })),
    soldAt: new Date(historical.getTime() - 10000).toISOString(),
  });
  const quoteTime = new Date(),
    expiresAt = new Date(quoteTime.getTime() + 12_000),
    receivedAt = quoteTime.toISOString();
  const data = {
    clientId: customer.id,
    currency: 'VES',
    amount: '1000',
    method: 'bolivares',
    rateId,
    receivedAt,
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  };
  expect((await request.post('/api/payments', { headers: commerceHeaders(), data })).status()).toBe(
    503,
  );
  await database(async (db) => {
    await db.query(
      `insert into bcv_rates(id,rate,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
    values($1,'100','https://www.bcv.org.ve/', $2,$3,$4,$5,$5,'TEST SINTÉTICO LOCAL, NO TASA REAL')`,
      [
        rateId,
        createHash('sha256').update(`fixture-${rateId}`).digest('hex'),
        new Date(historical.getTime() - 1000),
        expiresAt,
        new Date(historical.getTime() - 500),
      ],
    );
  });
  const key = randomUUID(),
    payment = await commercePost<PaymentDetail>(request, '/api/payments', data, key);
  expect(payment.amountUsd).toBe('10.00');
  expect(payment.bcvRate?.id).toBe(rateId);
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(current.balanceUsd).toBe('30.00');
  expect(current.totalUsd).toBe('40.00');
  // This isolated test advances to the next quote without rewriting either
  // immutable cache entry, the agreed price, or an already committed receipt.
  const laterRateId = randomUUID();
  await database(async (db) => {
    await db.query(
      `insert into bcv_rates(id,rate,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
       values($1,'200','https://www.bcv.org.ve/',$2,$3,$4,$5,$5,'TEST SINTÉTICO LOCAL, NO TASA REAL')`,
      [
        laterRateId,
        createHash('sha256').update(`fixture-${laterRateId}`).digest('hex'),
        expiresAt,
        new Date(expiresAt.getTime() + 120_000),
        new Date(expiresAt.getTime() - 100),
      ],
    );
  });
  await new Promise((resolve) =>
    setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now()) + 100),
  );
  expect(await commercePost<PaymentDetail>(request, '/api/payments', data, key)).toEqual(payment);
  expect((await request.post('/api/payments', { headers: commerceHeaders(), data })).status()).toBe(
    409,
  );
  const historicalReceipt: PaymentDetail = await (
    await request.get(`/api/payments/${payment.id}`)
  ).json();
  expect(historicalReceipt).toMatchObject({
    amount: '1000.00',
    amountUsd: '10.00',
    bcvRate: { id: rateId, rate: '100.00000000' },
  });
  expect(historicalReceipt.applications[0].balanceAfterUsd).toBe('30.00');
  const unchangedAccount: ClientAccount = await (
    await request.get(`/api/clients/${customer.id}`)
  ).json();
  expect(unchangedAccount.payments).toHaveLength(1);
  expect(unchangedAccount.sales.find((invoice) => invoice.id === sale.id)).toMatchObject({
    totalUsd: '40.00',
    paidUsd: '10.00',
    balanceUsd: '30.00',
  });
  const later = await commercePost<PaymentDetail>(request, '/api/payments', {
    ...data,
    rateId: laterRateId,
    receivedAt: new Date().toISOString(),
    amount: '2000',
  });
  expect(later.amountUsd).toBe('10.00');
  const afterLater: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(afterLater).toMatchObject({
    totalUsd: '40.00',
    balanceUsd: '20.00',
    settlementBasis: 'bcv',
  });
  expect(afterLater.lines[0].agreedUnitUsd).toBe('40.0000');
  expect(
    (await (await request.get(`/api/payments/${payment.id}`)).json()).applications[0]
      .balanceAfterUsd,
  ).toBe('30.00');
  // These quotes exist only in the guarded local test database, never in staging/production.
});
