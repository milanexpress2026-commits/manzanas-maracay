import { test, expect } from '@playwright/test';
import { randomUUID, createHash } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import {
  collectionPushCandidatesSql,
  eligibleCollectionPushNoticesSql,
} from '../../apps/api/src/push-queries';
import { loginRequest } from './helpers/auth';
import {
  commerceHeaders,
  commercePost,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSaleInput,
} from './helpers/commerce';
import {
  businessDate,
  addBusinessDays,
  type SaleDetail,
  type PaymentDetail,
  type ClientAccount,
  type CollectionsOverview,
} from '../../packages/domain/src/commerce';
import type { LotDetail, SaleAvailability } from '../../packages/domain/src/index';

test.beforeEach(async ({ request }) => loginRequest(request));
dotenv.config({ quiet: true });
async function database<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432')
    throw new Error('Solo PostgreSQL local de QA.');
  url.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}

test('contado rechaza fechas manipuladas sin movimiento ni documento y reintento correcto cobra una sola vez', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 2, '25');
  const lotPath = `/api/inventory/lots/${receipt.lots[0]!.id}`;
  const before: LotDetail = await (await request.get(lotPath)).json();
  const input = {
    ...commercialSaleInput(customer, rule, 1),
    condition: 'cash',
    dueDate: null,
    reminderDate: null,
    initialPayment: {
      currency: 'USD',
      amount: '40',
      method: 'Efectivo USD',
      receivedAt: new Date().toISOString(),
    },
  };
  const key = randomUUID();
  for (const field of ['dueDate', 'reminderDate']) {
    const response = await request.post('/api/sales', {
      headers: commerceHeaders(key),
      data: { ...input, [field]: addBusinessDays(businessDate(), 15) },
    });
    expect(response.status()).toBe(400);
    const unchanged: LotDetail = await (await request.get(lotPath)).json();
    expect(unchanged.containers).toEqual(before.containers);
    expect(unchanged.movements).toEqual(before.movements);
  }
  const empty: ClientAccount = await (await request.get(`/api/clients/${customer.id}`)).json();
  expect(empty.sales).toHaveLength(0);
  expect(empty.payments).toHaveLength(0);
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input, key);
  expect(await commercePost<SaleDetail>(request, '/api/sales', input, key)).toEqual(sale);
  expect(sale).toMatchObject({
    dueDate: null,
    reminderDate: null,
    balanceUsd: '0.00',
    costUsd: '25.0000',
    dueStatus: 'paid',
  });
  const after: LotDetail = await (await request.get(lotPath)).json();
  expect(after.lot.closedBoxes).toBe(1);
  expect(after.movements).toHaveLength(before.movements.length + 1);
  const pdf = await request.get(`/api/sales/${sale.id}/document`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  // Reversing the receipt reopens a real balance, but never turns cash into credit.
  await commercePost(request, `/api/payments/${sale.payments[0]!.id}/reverse`, {
    reason: 'Prueba aislada de rectificación del cobro',
  });
  expect(
    (
      await request.post(`/api/sales/${sale.id}/dates`, {
        headers: commerceHeaders(),
        data: {
          dueDate: null,
          reminderDate: businessDate(),
          reason: 'No programar contado rectificado',
        },
      })
    ).status(),
  ).toBe(409);
});

test('crédito pagado completo rechaza fechas sobrantes y conserva stock hasta confirmar sin ellas', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 1, '25');
  const input = {
    ...commercialSaleInput(customer, rule, 1),
    initialPayment: {
      currency: 'USD',
      amount: '40',
      method: 'Efectivo USD',
      receivedAt: new Date().toISOString(),
    },
  };
  for (const field of ['dueDate', 'reminderDate'])
    expect(
      (
        await request.post('/api/sales', {
          headers: commerceHeaders(),
          data: { ...input, [field]: addBusinessDays(businessDate(), 7) },
        })
      ).status(),
    ).toBe(400);
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot
      .closedBoxes,
  ).toBe(1);
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    ...input,
    dueDate: null,
    reminderDate: null,
  });
  expect(sale).toMatchObject({
    condition: 'credit',
    balanceUsd: '0.00',
    reminderDate: null,
    dueDate: null,
  });
  const collections: CollectionsOverview = await (await request.get('/api/collections')).json();
  expect(collections.invoices.some((row) => row.id === sale.id)).toBe(false);
});

test('crédito sin abono mantiene fechas independientes; parcial y pago final eliminan alertas sin duplicar cobros', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 1, '25');
  const input = {
    ...commercialSaleInput(customer, rule, 1),
    dueDate: addBusinessDays(businessDate(), 15),
    reminderDate: businessDate(),
  };
  const sale = await commercePost<SaleDetail>(request, '/api/sales', input);
  expect(sale.payments).toHaveLength(0);
  expect(sale.balanceUsd).toBe('40.00');
  const initialCollections: CollectionsOverview = await (
    await request.get('/api/collections')
  ).json();
  expect(initialCollections.todayInvoices.some((row) => row.id === sale.id)).toBe(true);
  await database(async (db) => {
    const candidates = (await db.query(collectionPushCandidatesSql, [businessDate()])).rows;
    expect(candidates.some((candidate) => candidate.sale_id === sale.id)).toBe(true);
  });
  const payment = {
    clientId: customer.id,
    currency: 'USD',
    method: 'Efectivo USD',
    receivedAt: new Date().toISOString(),
    amount: '0',
    applications: [{ saleId: sale.id, amountUsd: '0' }],
  };
  expect(
    (await request.post('/api/payments', { headers: commerceHeaders(), data: payment })).status(),
  ).toBe(400);
  const partial = await commercePost<PaymentDetail>(request, '/api/payments', {
    ...payment,
    amount: '10',
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  expect(partial.applications[0]!.balanceAfterUsd).toBe('30.00');
  const finalKey = randomUUID();
  const finalInput = {
    ...payment,
    amount: '30',
    applications: [{ saleId: sale.id, amountUsd: '30' }],
  };
  const final = await commercePost<PaymentDetail>(request, '/api/payments', finalInput, finalKey);
  expect(await commercePost<PaymentDetail>(request, '/api/payments', finalInput, finalKey)).toEqual(
    final,
  );
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(current).toMatchObject({ balanceUsd: '0.00', dueStatus: 'paid', whatsappUrl: null });
  expect(current.payments).toHaveLength(2);
  await database(async (db) => {
    expect(
      (await db.query(collectionPushCandidatesSql, [businessDate()])).rows.some(
        (row) => row.sale_id === sale.id,
      ),
    ).toBe(false);
    // A notice claimed before the final payment is also ineligible before send.
    // No device is subscribed and this synthetic notice is rolled back.
    await db.query('begin');
    try {
      const batch = randomUUID();
      await db.query(
        'insert into push_notices(sale_id,reminder_date,device_generation,batch_id) values($1,$2,$3,$4)',
        [sale.id, sale.reminderDate, randomUUID(), batch],
      );
      expect(
        (await db.query(eligibleCollectionPushNoticesSql, [batch, businessDate()])).rows,
      ).toHaveLength(0);
    } finally {
      await db.query('rollback');
    }
  });
  const collections: CollectionsOverview = await (await request.get('/api/collections')).json();
  for (const group of [
    collections.invoices,
    collections.todayInvoices,
    collections.upcomingInvoices,
    collections.overdueInvoices,
  ])
    expect(group.some((row) => row.id === sale.id)).toBe(false);
  expect(
    (
      await request.post(`/api/sales/${sale.id}/dates`, {
        headers: commerceHeaders(),
        data: {
          dueDate: null,
          reminderDate: businessDate(),
          reason: 'No recordar comprobante ya pagado',
        },
      })
    ).status(),
  ).toBe(409);
  for (const path of [
    `/api/sales/${sale.id}/document`,
    `/api/payments/${partial.id}/document`,
    `/api/payments/${final.id}/document`,
  ])
    expect((await (await request.get(path)).body()).subarray(0, 5).toString()).toBe('%PDF-');
});

test('disponibilidad por presentación no reserva ni duplica caja abierta; una mezcla excesiva falla atómicamente', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'blister', '40', 5);
  const customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 3, '30');
  await commercePost(request, '/api/sales', commercialSaleInput(customer, rule, 1, '8', 'blister'));
  const lotPath = `/api/inventory/lots/${receipt.lots[0]!.id}`;
  const before: LotDetail = await (await request.get(lotPath)).json();
  const availability: SaleAvailability = await (
    await request.get('/api/inventory/sale-availability')
  ).json();
  const items = availability.items.filter((item) => item.configurationId === rule.id);
  expect(items.find((item) => item.presentation === 'box')!.availableQuantity).toBe(2);
  expect(items.find((item) => item.presentation === 'blister')!.availableQuantity).toBe(14);
  expect(items.find((item) => item.presentation === 'half_box')!.availableQuantity).toBe(0);
  const mixed = commercialSaleInput(customer, rule, 2, '40', 'box');
  mixed.lines.push({ ...mixed.lines[0]!, presentation: 'blister', quantity: 5 });
  expect(
    (await request.post('/api/sales', { headers: commerceHeaders(), data: mixed })).status(),
  ).toBe(409);
  const after: LotDetail = await (await request.get(lotPath)).json();
  expect(after.containers).toEqual(before.containers);
  expect(after.movements).toEqual(before.movements);
});

test('acuerdo inicial conserva precio: USDT 1:1, Bs divisa a compra USDT y abonos de acuerdos distintos separados', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 4, '25');
  const divisaInput = commercialSaleInput(customer, rule, 1, '40');
  const divisa = await commercePost<SaleDetail>(request, '/api/sales', divisaInput);
  const regular = await commercePost<SaleDetail>(request, '/api/sales', {
    ...commercialSaleInput(customer, rule, 1, '48'),
    lines: [{ ...divisaInput.lines[0]!, priceBasis: 'ves_regular', agreedUnitUsd: '48' }],
  });
  expect(divisa.settlementBasis).toBe('divisa');
  expect(regular.settlementBasis).toBe('bcv');
  await database(async (db) => {
    await db.query('begin');
    try {
      await db.query(
        "insert into sales(number,client_id,condition,status,sold_at,total_usd,is_demo,settlement_basis) values($1,$2,'credit','confirmed',now(),0,true,'legacy_bcv')",
        [randomUUID(), customer.id],
      );
      await expect(
        db.query('set constraints sale_settlement_valid immediate'),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
    await db.query('begin');
    try {
      await expect(
        db.query("update sales set settlement_basis='bcv' where id=$1", [divisa.id]),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await db.query('rollback');
    }
  });
  const payment = {
    clientId: customer.id,
    currency: 'USDT',
    amount: '10',
    method: 'usdt_transfer',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: divisa.id, amountUsd: '10' }],
  };
  const native = await commercePost<PaymentDetail>(request, '/api/payments', payment);
  expect(native).toMatchObject({
    currency: 'USDT',
    amount: '10.00',
    amountUsd: '10.00',
    bcvRate: null,
    usdtRate: null,
  });
  const mixedApplications = [
    { saleId: divisa.id, amountUsd: '10' },
    { saleId: regular.id, amountUsd: '10' },
  ];
  expect(
    (
      await request.post('/api/payments', {
        headers: commerceHeaders(),
        data: {
          ...payment,
          currency: 'VES',
          method: 'bolivares',
          rateId: randomUUID(),
          amount: '2000',
          applications: mixedApplications,
        },
      })
    ).status(),
  ).toBe(400);
  const mixedNative = await commercePost<PaymentDetail>(request, '/api/payments', {
    ...payment,
    currency: 'USD',
    method: 'usd_cash',
    amount: '20',
    applications: mixedApplications,
  });
  expect(mixedNative.applications.map((application) => application.amountUsd)).toEqual([
    '10.00',
    '10.00',
  ]);
  expect(
    (
      await request.post('/api/sales', {
        headers: commerceHeaders(),
        data: {
          ...divisaInput,
          lines: [divisaInput.lines[0], { ...divisaInput.lines[0], priceBasis: 'ves_regular' }],
        },
      })
    ).status(),
  ).toBe(400);
  for (const method of ['Pago móvil', 'Punto de venta', 'Otro', 'bolivares'])
    expect(
      (
        await request.post('/api/payments', {
          headers: commerceHeaders(),
          data: { ...payment, method },
        })
      ).status(),
    ).toBe(400);
  const rateId = randomUUID();
  const ves = {
    ...payment,
    currency: 'VES',
    method: 'bolivares',
    rateId,
    amount: '2000',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: divisa.id, amountUsd: '20' }],
  };
  expect(
    (await request.post('/api/payments', { headers: commerceHeaders(), data: ves })).status(),
  ).toBe(503);
  const now = new Date();
  await database(async (db) => {
    await db.query(
      `insert into usdt_rates(id,rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
      values($1,'100','BINANCE_P2P_BUY',$2,$3,$4,$5,$4,$4,'QA SINTÉTICO LOCAL, NO COTIZACIÓN REAL')`,
      [
        rateId,
        'https://www.binance.com/bapi/c2c/v1/public/c2c/agent/quote-price?fiat=VES&asset=USDT&tradeType=BUY',
        createHash('sha256').update(rateId).digest('hex'),
        new Date(now.getTime() - 10_000),
        new Date(now.getTime() + 120_000),
      ],
    );
  });
  const key = randomUUID();
  const received = await commercePost<PaymentDetail>(request, '/api/payments', ves, key);
  expect(received).toMatchObject({
    amount: '2000.00',
    amountUsd: '20.00',
    bcvRate: null,
    usdtRate: { id: rateId, rate: '100.00000000' },
  });
  expect(await commercePost<PaymentDetail>(request, '/api/payments', ves, key)).toEqual(received);
  const current: SaleDetail = await (await request.get(`/api/sales/${divisa.id}`)).json();
  expect(current).toMatchObject({
    totalUsd: '40.00',
    paidUsd: '40.00',
    balanceUsd: '0.00',
    settlementBasis: 'divisa',
  });
  expect(current.lines[0]!.agreedUnitUsd).toBe('40.0000');
  // The server detects full settlement after conversion, before any stock movement.
  const fullVes = {
    ...divisaInput,
    dueDate: null,
    reminderDate: businessDate(),
    initialPayment: {
      currency: 'VES',
      method: 'bolivares',
      rateId,
      amount: '4000',
      receivedAt: new Date().toISOString(),
    },
  };
  expect(
    (await request.post('/api/sales', { headers: commerceHeaders(), data: fullVes })).status(),
  ).toBe(400);
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot
      .closedBoxes,
  ).toBe(2);
  for (const id of [native.id, received.id])
    expect(
      (await (await request.get(`/api/payments/${id}/document`)).body()).subarray(0, 5).toString(),
    ).toBe('%PDF-');
});
