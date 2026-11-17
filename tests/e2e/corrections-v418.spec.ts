import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { syntheticPaymentRates } from './helpers/rates';
import { Client } from 'pg';

test('devolución compartida no cambia la otra factura; el crédito utilizado se reintegra una sola vez', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request, 'halves'),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 6, '10');
  const a = await commercialSale(request, customer, rule, 2, '20', 'half_box'),
    b = await commercialSale(request, customer, rule, 1, '40');
  const paid = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '80',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [
      { saleId: a.id, amountUsd: '40' },
      { saleId: b.id, amountUsd: '40' },
    ],
  });
  await commercePost(request, `/api/sales/${a.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: a.lines[0]!.id, quantity: 1 }],
    resolution: 'credit',
    reason: 'Devuelve una media caja comercial',
    stockReturned: true,
  });
  expect((await (await request.get('/api/sales/' + b.id)).json()).paidUsd).toBe('40.00');
  expect((await (await request.get('/api/payments/' + paid.id)).json()).amount).toBe('60.00');
  const next = await commercialSale(request, customer, rule, 2, '10', 'half_box');
  await commercePost(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '20',
    method: 'client_credit',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: next.id, amountUsd: '20' }],
  });
  const changed = await commercePost<SaleDetail>(request, `/api/sales/${next.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: next.lines[0]!.id, quantity: 1 }],
    resolution: 'credit',
    reason: 'Devuelve otra media caja comercial',
    stockReturned: true,
  });
  expect((await (await request.get('/api/clients/' + customer.id)).json()).client.creditUsd).toBe(
    '10.00',
  );
  await commercePost(request, `/api/sales/${next.id}/reduce`, {
    expectedVersion: 1,
    lines: [{ lineId: changed.lines[0]!.id, quantity: 1 }],
    resolution: 'refund',
    reason: 'Se devuelve el dinero restante',
    stockReturned: true,
  });
  expect((await (await request.get('/api/clients/' + customer.id)).json()).client.creditUsd).toBe(
    '10.00',
  );
  expect((await (await request.get('/api/sales/' + next.id)).json()).status).toBe('cancelled');
});

test('reducciones sucesivas conservan céntimos y anular no devuelve unidades dos veces', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 2, '10');
  const sale = await commercialSale(request, customer, rule, 3, '0.3333', 'blister');
  const one = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: sale.lines[0]!.id, quantity: 1 }],
    resolution: 'none',
    reason: 'Ajusta la cantidad del pedido',
    stockReturned: true,
  });
  expect(one.totalUsd).toBe('0.67');
  const two = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/reduce`, {
    expectedVersion: 1,
    lines: [{ lineId: sale.lines[0]!.id, quantity: 1 }],
    resolution: 'none',
    reason: 'Ajusta otra unidad del pedido',
    stockReturned: true,
  });
  expect(two.totalUsd).toBe('0.33');
  expect(two.reductions?.map((r) => r.reductionUsd)).toEqual(['0.33', '0.34']);
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'El cliente cancela lo restante',
  });
  const lot = await (await request.get('/api/inventory/lots/' + receipt.lots[0]!.id)).json();
  const quantity = lot.containers
    .filter((s: { quantity: number }) => s.quantity > 0)
    .reduce(
      (n: number, s: { unit: string; quantity: number }) =>
        n + s.quantity * (s.unit === 'sealed_box' ? 5 : 1),
      0,
    );
  expect(quantity).toBe(10);
});

test('corrección VES conserva tasa histórica aun vencida y devolución registra bolívares exactos', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 3, '10');
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller: 'carlos',
    clientId: customer.id,
    condition: 'credit',
    settlementBasis: 'bcv',
    dateMode: 'automatic',
    soldAt: new Date().toISOString(),
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 2, agreedUnitUsd: '20' }],
  });
  const quotes = await syntheticPaymentRates({ bcv: '239.12345678', validForMs: 2500 });
  const paid = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'VES',
    amount: '9564.94',
    method: 'bolivares',
    rateId: quotes.bcv.id,
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '40' }],
  });
  await new Promise((resolve) => setTimeout(resolve, 2600));
  const changed = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: sale.lines[0]!.id, quantity: 1 }],
    resolution: 'refund',
    reason: 'El cliente devuelve una caja',
    stockReturned: true,
  });
  expect(changed.paidUsd).toBe('20.00');
  const payment: PaymentDetail = await (await request.get('/api/payments/' + paid.id)).json();
  expect(payment).toMatchObject({
    amount: '4782.47',
    amountUsd: '20.00',
    bcvRate: { id: quotes.bcv.id },
  });
  await commercePost(request, `/api/payments/${paid.id}/correct`, {
    expectedVersion: 1,
    amount: '2391.23',
    applications: [{ saleId: sale.id, amountUsd: '10' }],
    reason: 'Corrige el importe escrito en bolívares',
  });
  expect((await (await request.get('/api/sales/' + sale.id)).json()).balanceUsd).toBe('10.00');
});

test('dos dispositivos no retiran dos veces y SQL no inventa crédito ni reduce sin devolver stock', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 3, '10');
  const sale = await commercialSale(request, customer, rule, 2, '20');
  const body = {
    expectedVersion: 0,
    lines: [{ lineId: sale.lines[0]!.id, quantity: 1 }],
    resolution: 'none',
    reason: 'Cliente devuelve una caja',
    stockReturned: true,
  };
  const results = await Promise.all(
    [1, 2].map(() =>
      request.post(`/api/sales/${sale.id}/reduce`, { headers: commerceHeaders(), data: body }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.username !== 'mm_owner'
  )
    throw new Error('Solo QA local');
  url.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    expect(
      (await db.query('select environment from runtime_environment where singleton')).rows[0]
        .environment,
    ).toBe('test');
    await db.query('begin');
    await db.query(
      `insert into sale_reductions(sale_id,expected_version,reduction_usd,excess_usd,resolution,reason,actor) values($1,1,20,0,'none','Sin mercancía devuelta','qa')`,
      [sale.id],
    );
    await expect(db.query('commit')).rejects.toMatchObject({ code: '23514' });
    await db.query('rollback');
    await expect(
      db.query('update sale_reductions set reduction_usd=1 where sale_id=$1', [sale.id]),
    ).rejects.toBeTruthy();
    await db.query('begin');
    const id = randomUUID();
    await db.query(
      `insert into payments(id,client_id,currency,amount,amount_usd,received_at,idempotency_key,method,is_demo) values($1,$2,'USD',20,20,now(),$3,'client_credit',true)`,
      [id, customer.id, randomUUID()],
    );
    await db.query(
      'insert into payment_applications(payment_id,sale_id,client_id,amount_usd) values($1,$2,$3,20)',
      [id, sale.id, customer.id],
    );
    await expect(db.query('commit')).rejects.toMatchObject({ code: '23514' });
    await db.query('rollback');
  } finally {
    await db.end();
  }
});
import type { SaleDetail, PaymentDetail, ClientAccount } from '../../packages/domain/src';
import { loginRequest } from './helpers/auth';
import {
  commercePost,
  commerceHeaders,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSale,
} from './helpers/commerce';

test('quitar una unidad de precio fraccionario conserva el stock aunque la reducción redondee a cero', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 4, '10');
  const sale = await commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller: 'randy',
    clientId: customer.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    dateMode: 'automatic',
    soldAt: new Date().toISOString(),
    lines: [
      { configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '20' },
      { configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '0.001' },
    ],
  });
  const changed = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: sale.lines[1]!.id, quantity: 1 }],
    resolution: 'none',
    reason: 'Retira la línea con precio fraccionario',
    stockReturned: true,
  });
  expect(changed).toMatchObject({ version: 1, totalUsd: '20.00' });
  expect(changed.reductions?.[0]?.reductionUsd).toBe('0.00');
  expect(changed.lines.filter((line) => line.quantity > 0)).toHaveLength(1);
  await commercialSale(request, customer, rule, 3, '20');
});

for (const resolution of ['refund', 'credit'] as const)
  test(`pedido pagado: quitar producto, ${resolution}, inventario y reintento`, async ({
    request,
  }) => {
    await loginRequest(request);
    const product = await commercialProduct(request),
      customer = await commercialCustomer(request);
    await commercialReceipt(request, product, 5, '10');
    const sale = await commercialSale(request, customer, product, 3, '20', 'half_box');
    const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
      clientId: customer.id,
      currency: 'USD',
      amount: '60',
      method: 'usd_cash',
      receivedAt: new Date().toISOString(),
      dateMode: 'automatic',
      applications: [{ saleId: sale.id, amountUsd: '60' }],
    });
    const key = randomUUID(),
      body = {
        expectedVersion: 0,
        lines: [{ lineId: sale.lines[0]!.id, quantity: 1 }],
        resolution,
        reason: 'Cliente quita un producto al salir',
        stockReturned: true,
      };
    const changed = await commercePost<SaleDetail>(
      request,
      `/api/sales/${sale.id}/reduce`,
      body,
      key,
    );
    expect(changed).toMatchObject({
      version: 1,
      totalUsd: '40.00',
      paidUsd: '40.00',
      balanceUsd: '0.00',
    });
    expect(changed.lines[0]!.quantity).toBe(2);
    expect(changed.reductions).toHaveLength(1);
    expect(await commercePost(request, `/api/sales/${sale.id}/reduce`, body, key)).toEqual(changed);
    const account: ClientAccount = await (await request.get('/api/clients/' + customer.id)).json();
    expect(account.client.creditUsd).toBe(resolution === 'credit' ? '20.00' : '0.00');
    const current: PaymentDetail = await (await request.get('/api/payments/' + payment.id)).json();
    expect(current).toMatchObject({
      version: 1,
      amount: '40.00',
      amountUsd: '40.00',
      reversed: false,
    });
    expect(current.corrections?.[0]?.kind).toBe(resolution);
    // Returned half is a physical sellable package, even after other lot movements.
    await commercialSale(request, customer, product, 1, '20', 'half_box');
    if (resolution === 'credit') {
      const next = await commercialSale(request, customer, product, 1, '20', 'half_box');
      await commercePost(request, '/api/payments', {
        clientId: customer.id,
        currency: 'USD',
        amount: '20',
        method: 'client_credit',
        receivedAt: new Date().toISOString(),
        dateMode: 'automatic',
        applications: [{ saleId: next.id, amountUsd: '20' }],
      });
      expect(
        (await (await request.get('/api/clients/' + customer.id)).json()).client.creditUsd,
      ).toBe('0.00');
      const over = await request.post('/api/payments', {
        headers: commerceHeaders(),
        data: {
          clientId: customer.id,
          currency: 'USD',
          amount: '1',
          method: 'client_credit',
          receivedAt: new Date().toISOString(),
          applications: [{ saleId: sale.id, amountUsd: '1' }],
        },
      });
      expect(over.status()).toBe(409);
    }
  });

test('corregir importe mal escrito conserva otras facturas, permite corregir otra vez y evita sobrepago', async ({
  request,
}) => {
  await loginRequest(request);
  const product = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, product, 6, '10');
  const a = await commercialSale(request, customer, product, 1, '40'),
    b = await commercialSale(request, customer, product, 1, '40');
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '60',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [
      { saleId: a.id, amountUsd: '40' },
      { saleId: b.id, amountUsd: '20' },
    ],
  });
  const corrected = await commercePost<PaymentDetail>(
    request,
    `/api/payments/${payment.id}/correct`,
    {
      expectedVersion: 0,
      amount: '50',
      reason: 'El importe anotado tenía un error',
      applications: [
        { saleId: a.id, amountUsd: '30' },
        { saleId: b.id, amountUsd: '20' },
      ],
    },
  );
  expect(corrected).toMatchObject({ version: 1, amount: '50.00' });
  expect((await (await request.get('/api/sales/' + a.id)).json()).balanceUsd).toBe('10.00');
  expect((await (await request.get('/api/sales/' + b.id)).json()).balanceUsd).toBe('20.00');
  const reject = await request.post(`/api/payments/${payment.id}/correct`, {
    headers: commerceHeaders(),
    data: {
      expectedVersion: 1,
      amount: '90',
      reason: 'El importe anotado tenía un error',
      applications: [
        { saleId: a.id, amountUsd: '70' },
        { saleId: b.id, amountUsd: '20' },
      ],
    },
  });
  expect(reject.status()).toBe(409);
  await commercePost(request, `/api/payments/${payment.id}/correct`, {
    expectedVersion: 1,
    amount: '60',
    reason: 'Corrección revisada con el cliente',
    applications: [
      { saleId: a.id, amountUsd: '40' },
      { saleId: b.id, amountUsd: '20' },
    ],
  });
  expect(
    (await (await request.get('/api/payments/' + payment.id)).json()).corrections,
  ).toHaveLength(2);
});
