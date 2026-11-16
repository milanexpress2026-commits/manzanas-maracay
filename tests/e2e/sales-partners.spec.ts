import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { SaleDetail, SellerReport, LotDetail } from '../../packages/domain/src';
import { loginRequest } from './helpers/auth';
import {
  commercePost,
  commerceHeaders,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSale,
} from './helpers/commerce';
test.beforeEach(async ({ request }) => loginRequest(request));

test('ampliar contado conserva folio, vendedor y pago; cobra solo extra y recupera reintento', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 5, '10');
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller: 'randy',
    clientId: customer.id,
    condition: 'cash',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    dateMode: 'automatic',
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
    initialPayment: {
      currency: 'USD',
      amount: '40',
      method: 'usd_cash',
      receivedAt: new Date().toISOString(),
      dateMode: 'automatic',
    },
  });
  const input = {
    expectedVersion: 0,
    lines: [
      { configurationId: rule.id, presentation: 'half_box', quantity: 1, agreedUnitUsd: '20' },
    ],
    payment: {
      currency: 'USD',
      amount: '20',
      method: 'usd_cash',
      receivedAt: new Date().toISOString(),
      dateMode: 'automatic',
    },
  };
  const key = randomUUID();
  const changed = await commercePost<SaleDetail>(
    request,
    `/api/sales/${sale.id}/add-products`,
    input,
    key,
  );
  expect(changed).toMatchObject({
    id: sale.id,
    number: sale.number,
    seller: 'randy',
    version: 1,
    totalUsd: '60.00',
    paidUsd: '60.00',
    balanceUsd: '0.00',
    soldAt: sale.soldAt,
  });
  expect(changed.payments).toHaveLength(2);
  expect(changed.lines).toHaveLength(2);
  expect(changed.payments.find((p) => p.id === sale.payments[0].id)).toEqual(sale.payments[0]);
  expect(await commercePost(request, `/api/sales/${sale.id}/add-products`, input, key)).toEqual(
    changed,
  );
  expect(
    (
      await request.post(`/api/sales/${sale.id}/add-products`, {
        headers: commerceHeaders(),
        data: input,
      })
    ).status(),
  ).toBe(409);
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.equivalentBoxes).toBe(3.5);
  expect((await request.get(`/api/sales/${sale.id}/delivery-note`)).ok()).toBe(true);
});

test('crédito sin abono se amplía; con abono rechaza todo sin consumir stock', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 4, '10');
  const sale = await commercialSale(request, customer, rule, 1);
  const input = {
    expectedVersion: 0,
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '45' }],
  };
  const changed = await commercePost<SaleDetail>(
    request,
    `/api/sales/${sale.id}/add-products`,
    input,
  );
  expect(changed).toMatchObject({
    seller: null,
    version: 1,
    totalUsd: '85.00',
    paidUsd: '0.00',
    balanceUsd: '85.00',
  });
  await commercePost(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '10',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  });
  expect(
    (
      await request.post(`/api/sales/${sale.id}/add-products`, {
        headers: commerceHeaders(),
        data: { ...input, expectedVersion: 1 },
      })
    ).status(),
  ).toBe(409);
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(current).toMatchObject({
    totalUsd: '85.00',
    paidUsd: '10.00',
    balanceUsd: '75.00',
    version: 1,
  });
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.closedBoxes).toBe(2);
});

test('anular una venta anterior devuelve solo sus cajas y conserva la venta posterior', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 3, '10');
  const first = await commercialSale(request, customer, rule, 1),
    second = await commercialSale(request, customer, rule, 1);
  const key = randomUUID(),
    body = { reason: 'Pedido cancelado antes de salir' };
  const cancelled = await commercePost<SaleDetail>(
    request,
    `/api/sales/${first.id}/cancel`,
    body,
    key,
  );
  expect(cancelled.status).toBe('cancelled');
  expect(await commercePost(request, `/api/sales/${first.id}/cancel`, body, key)).toEqual(
    cancelled,
  );
  expect(await (await request.get(`/api/sales/${second.id}`)).json()).toEqual(second);
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.closedBoxes).toBe(2);
  await commercialSale(request, customer, rule, 2);
});

test('anulación de media con cinco blísteres conserva fracciones después de otra salida', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 1, '10');
  const first = await commercialSale(request, customer, rule, 1, '20', 'half_box');
  await commercialSale(request, customer, rule, 1, '8', 'blister');
  await commercePost(request, `/api/sales/${first.id}/cancel`, {
    reason: 'El cliente canceló esta media caja',
  });
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.equivalentBoxes).toBe(0.8);
  expect(lot.lot.closedBoxes).toBe(0);
  await commercialSale(request, customer, rule, 1, '20', 'half_box');
});

test('resumen separa vendedores y anteriores, excluye anulación y suma ampliaciones una vez', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 6, '10');
  const from = '2095-01-01',
    to = '2095-01-02';
  const empty: SellerReport = await (
    await request.get(`/api/sales/sellers/summary?from=${from}&to=${to}`)
  ).json();
  expect(empty.rows).toHaveLength(3);
  expect(empty.rows.every((r) => r.count === 0)).toBe(true);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const endpoint = `/api/sales/sellers/summary?from=${day}&to=${day}`;
  const before: SellerReport = await (await request.get(endpoint)).json();
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller: 'carlos',
    clientId: customer.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    dateMode: 'automatic',
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
  });
  await commercePost(request, `/api/sales/${sale.id}/add-products`, {
    expectedVersion: 0,
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '25' }],
  });
  const after: SellerReport = await (await request.get(endpoint)).json();
  expect(Number(after.rows[0].totalUsd) - Number(before.rows[0].totalUsd)).toBe(65);
  expect(after.rows[0].count - before.rows[0].count).toBe(1);
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'Cancelación completa del pedido',
  });
  const final: SellerReport = await (await request.get(endpoint)).json();
  expect(final).toEqual(before);
});

test('dos ampliaciones compiten por la última caja: una sola confirma y crédito anulado no admite cambios', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 2, '10');
  const sale = await commercialSale(request, customer, rule, 1);
  const input = {
    expectedVersion: 0,
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      request.post(`/api/sales/${sale.id}/add-products`, {
        headers: commerceHeaders(),
        data: input,
      }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(current.totalUsd).toBe('80.00');
  expect(current.version).toBe(1);
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'Pedido completo cancelado',
  });
  expect(
    (
      await request.post(`/api/sales/${sale.id}/add-products`, {
        headers: commerceHeaders(),
        data: { ...input, expectedVersion: 1 },
      })
    ).status(),
  ).toBe(409);
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.closedBoxes).toBe(2);
});

test('contado no cobra nuevamente lo anterior ni admite excedentes; rechazo deja venta y stock intactos', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 3, '10');
  const initial = {
    currency: 'USD',
    amount: '40',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
  };
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller: 'carlos',
    clientId: customer.id,
    condition: 'cash',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    dateMode: 'automatic',
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
    initialPayment: initial,
  });
  for (const amount of ['0', '10', '60']) {
    expect(
      (
        await request.post(`/api/sales/${sale.id}/add-products`, {
          headers: commerceHeaders(),
          data: {
            expectedVersion: 0,
            lines: [
              {
                configurationId: rule.id,
                presentation: 'half_box',
                quantity: 1,
                agreedUnitUsd: '20',
              },
            ],
            payment: { ...initial, amount },
          },
        })
      ).status(),
    ).toBe(400);
  }
  expect(await (await request.get(`/api/sales/${sale.id}`)).json()).toEqual(sale);
  const lot: LotDetail = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json();
  expect(lot.lot.closedBoxes).toBe(2);
});

test('PostgreSQL conserva originales y rechaza una ampliación sin mercancía; abono y anulación se excluyen', async ({
  request,
}) => {
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 3, '10');
  const sale = await commercialSale(request, customer, rule, 1);
  await commercePost(request, `/api/sales/${sale.id}/add-products`, {
    expectedVersion: 0,
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '25' }],
  });
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.pathname = '/manzanas_maracay_test';
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432')
    throw new Error('Solo QA local');
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    expect(
      (await db.query('select total_usd::text,seller from sales where id=$1', [sale.id])).rows,
    ).toEqual([{ total_usd: '40.00', seller: null }]);
    await db.query('begin');
    await db.query(
      "insert into sale_additions(sale_id,total_usd,cost_usd,actor) values($1,5,1,'QA')",
      [sale.id],
    );
    await expect(db.query('commit')).rejects.toMatchObject({ code: '23514' });
    await db.query('rollback');
    expect(
      (
        await db.query('select count(*)::integer as n from sale_additions where sale_id=$1', [
          sale.id,
        ])
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await db.end();
  }
  const results = await Promise.all([
    request.post(`/api/sales/${sale.id}/cancel`, {
      headers: commerceHeaders(),
      data: { reason: 'Pedido cancelado en tienda' },
    }),
    request.post('/api/payments', {
      headers: commerceHeaders(),
      data: {
        clientId: customer.id,
        currency: 'USD',
        amount: '10',
        method: 'usd_cash',
        receivedAt: new Date().toISOString(),
        applications: [{ saleId: sale.id, amountUsd: '10' }],
      },
    }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  const current: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(
    current.status === 'cancelled'
      ? current.paidUsd === '0.00' && current.balanceUsd === '0.00'
      : current.paidUsd === '10.00' && current.balanceUsd === '55.00',
  ).toBe(true);
});
