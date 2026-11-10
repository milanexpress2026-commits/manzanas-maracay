import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { Configuration, LotDetail, SaleDetail } from '../../packages/domain/src/index';
import { loginRequest, loginPage } from './helpers/auth';
import { chooseSaleClient } from './helpers/sale-client';
import {
  commerceHeaders,
  commercePost,
  commercialCustomer,
  commercialReceipt,
} from './helpers/commerce';
import { manualSaleInput, receiveUnknown, unpricedProduct } from './helpers/operation-v45';
import { receiptDatabase } from './helpers/receipt-v42';
async function product(request: APIRequestContext, b: number) {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO medias V4.12 ${randomUUID()}`,
  });
  return commercePost<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    commercialLine: 'Tradicional',
    packingModel: 'blister',
    halfPreparation: 'counted',
    allowedPresentations: ['box', 'half_box', 'blister'],
    blistersPerBox: b,
    confirmationStatus: 'confirmed',
  });
}
async function detail(request: APIRequestContext, id: string): Promise<LotDetail> {
  return (await request.get('/api/inventory/lots/' + id)).json();
}
async function preview(
  request: APIRequestContext,
  c: Configuration,
  p: 'box' | 'half_box' | 'blister',
  quantity = 1,
) {
  const r = await request.post('/api/inventory/sale-preview', {
    headers: { Origin: 'http://127.0.0.1:3200' },
    data: {
      soldAt: new Date().toISOString(),
      dateMode: 'automatic',
      lines: [{ lineKey: randomUUID(), configurationId: c.id, presentation: p, quantity }],
    },
  });
  expect(r.status(), await r.text()).toBe(200);
  return r.json();
}
test.beforeEach(async ({ request }) => loginRequest(request));
for (const b of [4, 5])
  test(`V4.12 ${b} blíster: primera media directa, remanente, segunda media, idempotencia y rechazo real`, async ({
    request,
  }) => {
    const rule = await product(request, b),
      customer = await commercialCustomer(request),
      received = await receiveUnknown(request, rule, 1),
      lotId = received.lots[0]!.id;
    expect((await preview(request, rule, 'half_box')).lines[0].maxQuantity).toBe(2);
    const before = await detail(request, lotId),
      body = manualSaleInput(customer, rule, 1, '20', 'half_box'),
      key = randomUUID();
    const first = await commercePost<SaleDetail>(request, '/api/sales', body, key);
    expect(first.lines[0]).toMatchObject({
      presentation: 'half_box',
      quantity: 1,
      totalUsd: '20.00',
    });
    expect((await detail(request, lotId)).lot).toMatchObject({
      closedBoxes: 0,
      fractionalBoxes: 0.5,
      equivalentBoxes: 0.5,
      loosePieces: 0,
    });
    expect((await preview(request, rule, 'half_box')).lines[0].maxQuantity).toBe(1);
    expect(await commercePost(request, '/api/sales', body, key)).toEqual(first);
    expect((await detail(request, lotId)).lot.version).toBe(before.lot.version + 1);
    await commercePost(request, '/api/sales', manualSaleInput(customer, rule, 1, '21', 'half_box'));
    const exhausted = await detail(request, lotId);
    expect(exhausted.lot.equivalentBoxes).toBe(0);
    const rejected = await request.post('/api/sales', {
      headers: commerceHeaders(),
      data: manualSaleInput(customer, rule, 1, '20', 'half_box'),
    });
    expect(rejected.status()).toBe(409);
    expect(await detail(request, lotId)).toEqual(exhausted);
    const pdf = await request.get(`/api/sales/${first.id}/delivery-note?size=letter`);
    expect(pdf.status()).toBe(200);
  });
test('V4.12 media y blíster juntos conservan costo histórico, medio blíster restante y reversa', async ({
  request,
}) => {
  const rule = await product(request, 5),
    customer = await commercialCustomer(request),
    received = await commercialReceipt(request, rule, 1, '20'),
    lotId = received.lots[0]!.id;
  const body = manualSaleInput(customer, rule, 1, '20', 'half_box');
  body.lines.push({ ...body.lines[0]!, presentation: 'blister', quantity: 2, agreedUnitUsd: '8' });
  const sale = await commercePost<SaleDetail>(request, '/api/sales', body);
  expect((await detail(request, lotId)).lot).toMatchObject({
    equivalentBoxes: 0.1,
    fractionalBoxes: 0.1,
  });
  await receiptDatabase(async (db) => {
    const costs = (
      await db.query(
        'select a.cost_usd,dispatched_container_cost(a.movement_id,a.container_id) source_cost from sale_allocations a join sale_lines l on l.id=a.sale_line_id where l.sale_id=$1',
        [sale.id],
      )
    ).rows;
    expect(costs.every((c) => c.cost_usd === c.source_cost)).toBe(true);
    expect(costs.map((c) => c.cost_usd).sort()).toEqual(['10.0000', '4.0000', '4.0000']);
  });
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'DEMO verificar reversa de media comercial',
  });
  expect((await detail(request, lotId)).lot).toMatchObject({
    closedBoxes: 1,
    equivalentBoxes: 1,
    fractionalBoxes: 0,
  });
});
test('V4.12 media seguida de blíster conserva el remanente y recupera cada venta sin duplicar', async ({
  request,
}) => {
  const rule = await product(request, 5),
    customer = await commercialCustomer(request),
    received = await commercialReceipt(request, rule, 1, '25'),
    id = received.lots[0]!.id;
  await commercePost(request, '/api/sales', manualSaleInput(customer, rule, 1, '20', 'half_box'));
  const second = await commercePost<SaleDetail>(
    request,
    '/api/sales',
    manualSaleInput(customer, rule, 2, '8', 'blister'),
  );
  expect((await detail(request, id)).lot.equivalentBoxes).toBe(0.1);
  await commercePost(request, `/api/sales/${second.id}/cancel`, {
    reason: 'DEMO revertir solo los blíster',
  });
  expect((await detail(request, id)).lot.equivalentBoxes).toBe(0.5);
  expect((await preview(request, rule, 'half_box')).lines[0].maxQuantity).toBe(1);
});
test('V4.12 dos socios venden las dos últimas medias; una tercera no puede duplicar stock', async ({
  request,
}) => {
  const rule = await product(request, 5),
    customer = await commercialCustomer(request),
    received = await receiveUnknown(request, rule, 1);
  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      request.post('/api/sales', {
        headers: commerceHeaders(),
        data: manualSaleInput(customer, rule, 1, '20', 'half_box'),
      }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([201, 201, 409]);
  expect((await detail(request, received.lots[0]!.id)).lot.equivalentBoxes).toBe(0);
});
test('V4.12 catálogo anterior sin media habilitada: venta automática sin cambiar empaque ni snapshot', async ({
  request,
}) => {
  const rule = await unpricedProduct(request, 'blister'),
    customer = await commercialCustomer(request),
    received = await receiveUnknown(request, rule, 1),
    id = received.lots[0]!.id;
  expect(rule.allowedPresentations).not.toContain('half_box');
  const availability = await (await request.get('/api/inventory/sale-availability')).json();
  expect(
    availability.items.find(
      (r: { configurationId: string; presentation: string }) =>
        r.configurationId === rule.id && r.presentation === 'half_box',
    ).availableQuantity,
  ).toBe(2);
  expect((await preview(request, rule, 'half_box')).valid).toBe(true);
  await commercePost(request, '/api/sales', manualSaleInput(customer, rule, 1, '20', 'half_box'));
  const after = await detail(request, id);
  expect(after.lot.equivalentBoxes).toBe(0.5);
  expect(after.lot.allowedPresentations).toEqual(rule.allowedPresentations);
  expect(after.lot.halfPreparation).toBe('none');
});
test('V4.12 granel/kiwi: dos medias comerciales sin contar frutas', async ({ request }) => {
  const rule = await unpricedProduct(request, 'halves'),
    customer = await commercialCustomer(request),
    received = await receiveUnknown(request, rule, 1),
    id = received.lots[0]!.id;
  for (const remaining of [0.5, 0]) {
    await commercePost(request, '/api/sales', manualSaleInput(customer, rule, 1, '20', 'half_box'));
    expect((await detail(request, id)).lot).toMatchObject({
      equivalentBoxes: remaining,
      loosePieces: 0,
    });
  }
});
for (const width of [390, 800])
  test(`V4.12 interfaz ${width}px: vender media desde una caja sin prepararla`, async ({
    page,
  }) => {
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    const rule = await product(page.request, 5),
      customer = await commercialCustomer(page.request),
      received = await receiveUnknown(page.request, rule, 1);
    await page.goto('/ventas/nueva');
    await chooseSaleClient(page, customer);
    await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
    const row = page.getByRole('region', { name: 'Producto 1', exact: true });
    await row.getByLabel('Producto', { exact: true }).selectOption(rule.id);
    await row.getByLabel('Presentación', { exact: true }).selectOption('half_box');
    await row.getByLabel('Precio por unidad (USD)', { exact: true }).fill('20');
    await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
    await expect(row).toContainText('Disponible para esta venta: 2');
    await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+\?guardada=1$/);
    expect((await detail(page.request, received.lots[0]!.id)).lot.equivalentBoxes).toBe(0.5);
    await expect(page.getByText('Media caja', { exact: true }).first()).toBeVisible();
  });
