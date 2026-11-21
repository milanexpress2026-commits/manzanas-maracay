import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import Decimal from 'decimal.js';
import AxeBuilder from '@axe-core/playwright';
import {
  businessDate,
  type SalesStatistics,
  type SaleDetail,
  type Configuration,
  type ClientSummary,
  type Presentation,
  type ReceiptResult,
} from '../../packages/domain/src';
import { loginRequest, loginPage } from './helpers/auth';
import {
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercePost,
  commerceHeaders,
  commercialSale,
} from './helpers/commerce';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

async function sell(
  request: APIRequestContext,
  rule: Configuration,
  client: ClientSummary,
  seller: 'carlos' | 'randy',
  lines: { presentation: Presentation; quantity: number; agreedUnitUsd: string }[],
  soldAt?: string,
) {
  return commercePost<SaleDetail>(request, '/api/sales', {
    schemaVersion: 2,
    seller,
    clientId: client.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    dateMode: soldAt ? 'manual' : 'automatic',
    soldAt: soldAt ?? new Date().toISOString(),
    lines: lines.map((l) => ({ ...l, configurationId: rule.id })),
  });
}
async function report(request: APIRequestContext, extra: Record<string, string> = {}) {
  const day = businessDate(),
    query = new URLSearchParams({ from: day, to: day, ...extra });
  const response = await request.get('/api/sales/statistics?' + query);
  expect(response.status(), await response.text()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  return response.json() as Promise<SalesStatistics>;
}
test('estadísticas privadas, filtros validados y selección vacía', async ({ request, page }) => {
  expect((await request.get('/api/sales/statistics?from=2026-01-01&to=2026-01-01')).status()).toBe(
    401,
  );
  await page.goto('/estadisticas');
  await expect(page).toHaveURL(/login\?returnTo=%2Festadisticas/);
  await loginRequest(request);
  for (const query of [
    'from=2026-02-30&to=2026-03-01',
    'from=2026-03-02&to=2026-03-01',
    'from=2026-03-01&to=2026-03-01&seller=otro',
    'from=2026-03-01&to=2026-03-01&page=-1',
    'from=2026-03-01&to=2026-03-01&group=sales%3BDROP',
  ]) {
    expect((await request.get('/api/sales/statistics?' + query)).status()).toBe(400);
  }
  const empty = await report(request, { from: '2099-01-01', to: '2099-01-02' });
  expect(empty.totals).toEqual({
    boxes: '0',
    totalUsd: '0.00',
    saleCount: 0,
    clientCount: 0,
    unknownLines: 0,
  });
  expect(empty.rows).toEqual([]);
});
test('un único total de cajas, neto de ampliaciones/devoluciones; clientes y vendedores sin duplicar', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    client = await commercialCustomer(request),
    other = await commercialCustomer(request);
  await commercialReceipt(request, rule, 15, '10');
  const a = await sell(request, rule, client, 'carlos', [
    { presentation: 'box', quantity: 4, agreedUnitUsd: '40' },
    { presentation: 'half_box', quantity: 1, agreedUnitUsd: '20' },
  ]);
  const before = await report(request, { variantId: rule.variantId, seller: 'carlos' });
  expect(new Decimal(before.totals.boxes).eq('4.5')).toBe(true);
  expect(before.totals).toMatchObject({
    saleCount: 1,
    clientCount: 1,
    totalUsd: '180.00',
    unknownLines: 0,
  });
  await commercePost(request, `/api/sales/${a.id}/add-products`, {
    expectedVersion: 0,
    lines: [{ configurationId: rule.id, presentation: 'blister', quantity: 2, agreedUnitUsd: '8' }],
  });
  await commercePost(request, `/api/sales/${a.id}/reduce`, {
    expectedVersion: 1,
    lines: [{ lineId: a.lines.find((l) => l.presentation === 'half_box')!.id, quantity: 1 }],
    resolution: 'none',
    reason: 'El cliente retira la media caja',
    stockReturned: true,
  });
  await sell(request, rule, other, 'randy', [
    { presentation: 'half_box', quantity: 3, agreedUnitUsd: '20' },
  ]);
  const cancelled = await sell(request, rule, other, 'randy', [
    { presentation: 'box', quantity: 1, agreedUnitUsd: '40' },
  ]);
  await commercePost(request, `/api/sales/${cancelled.id}/cancel`, {
    reason: 'Pedido cancelado en QA',
  });
  await commercialSale(request, other, rule, 1, '40'); // Historical sale deliberately unassigned.
  const saleBefore = await (await request.get('/api/sales/' + a.id)).json();
  const all = await report(request, { variantId: rule.variantId });
  expect(new Decimal(all.totals.boxes).eq('6.9')).toBe(true);
  expect(all.totals).toMatchObject({
    totalUsd: '276.00',
    saleCount: 3,
    clientCount: 2,
    unknownLines: 0,
  });
  expect(all.rows).toHaveLength(1);
  for (const [seller, expected] of [
    ['carlos', '4.4'],
    ['randy', '1.5'],
    ['unassigned', '1'],
  ]) {
    const selected = await report(request, { variantId: rule.variantId, seller });
    expect(new Decimal(selected.totals.boxes).eq(expected)).toBe(true);
  }
  const clients = await report(request, { variantId: rule.variantId, group: 'clients' });
  expect(clients.rows.map((r) => r.clientName).sort()).toEqual([client.name, other.name].sort());
  const sales = await report(request, {
    variantId: rule.variantId,
    seller: 'carlos',
    group: 'sales',
    clientId: client.id,
  });
  expect(sales.rows).toHaveLength(1);
  expect(sales.rows[0]).toMatchObject({
    saleId: a.id,
    number: a.number,
    seller: 'carlos',
    clientName: client.name,
    description: a.lines[0].description,
  });
  expect(await (await request.get('/api/sales/' + a.id)).json()).toEqual(saleBefore);
});
test('blísteres de lotes de cuatro y cinco usan el empaque histórico, incluso después de devolver', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    client = await commercialCustomer(request);
  const first = await commercePost<ReceiptResult>(request, '/api/receipts', {
    supplierId: (
      await commercePost<{ id: string }>(request, '/api/suppliers', {
        name: 'DEMO proveedor ' + randomUUID(),
      })
    ).id,
    reference: 'DEMO-' + randomUUID(),
    receivedAt: new Date(Date.now() - 3000).toISOString(),
    isDemo: true,
    lines: [{ configurationId: rule.id, boxes: 1, unitCostUsd: '10', blistersPerBox: 4 }],
  });
  const second = await commercialReceipt(request, rule, 1, '10');
  const sale = await sell(request, rule, client, 'randy', [
    { presentation: 'blister', quantity: 6, agreedUnitUsd: '8' },
  ]);
  expect(
    new Decimal((await report(request, { variantId: rule.variantId })).totals.boxes).eq('1.4'),
  ).toBe(true);
  const patch = await request.patch('/api/catalog/configurations/' + rule.id, {
    headers: commerceHeaders(),
    data: { version: rule.version, blistersPerBox: 8 },
  });
  expect(patch.status(), await patch.text()).toBe(200);
  expect(
    new Decimal((await report(request, { variantId: rule.variantId })).totals.boxes).eq('1.4'),
  ).toBe(true);
  const changed = await commercePost<SaleDetail>(request, `/api/sales/${sale.id}/reduce`, {
    expectedVersion: 0,
    lines: [{ lineId: sale.lines[0].id, quantity: 1 }],
    resolution: 'none',
    reason: 'Retira un blíster',
    stockReturned: true,
  });
  const divisors = new Map([
    [first.lots[0].id, 4],
    [second.lots[0].id, 5],
  ]);
  const expected = changed.lines
    .flatMap((l) => l.allocations)
    .reduce((n, a) => n.add(new Decimal(a.quantity).div(divisors.get(a.lotId)!)), new Decimal(0));
  expect(
    new Decimal((await report(request, { variantId: rule.variantId })).totals.boxes).eq(expected),
  ).toBe(true);
});
test('el período sigue la medianoche de Venezuela, no UTC; granel y caja entera', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request, 'halves'),
    client = await commercialCustomer(request);
  const day = businessDate(new Date(Date.now() - 3 * 86400000));
  await commercialReceipt(request, rule, 2, '10', day + 'T00:00:00Z');
  await sell(
    request,
    rule,
    client,
    'carlos',
    [{ presentation: 'half_box', quantity: 1, agreedUnitUsd: '20' }],
    day + 'T03:59:59Z',
  );
  await sell(
    request,
    rule,
    client,
    'randy',
    [{ presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
    day + 'T04:00:00Z',
  );
  const result = await report(request, { from: day, to: day, variantId: rule.variantId });
  expect(new Decimal(result.totals.boxes).eq(1)).toBe(true);
  expect(result.sellers).toHaveLength(1);
  expect(result.sellers[0].seller).toBe('randy');
});
test('paginación conserva el total completo y no pierde ni duplica ventas', async ({ request }) => {
  test.setTimeout(120000);
  await loginRequest(request);
  const rule = await commercialProduct(request, 'halves'),
    client = await commercialCustomer(request);
  await commercialReceipt(request, rule, 13, '10');
  const ids = new Set<string>();
  for (let i = 0; i < 26; i++)
    ids.add(
      (
        await sell(request, rule, client, 'carlos', [
          { presentation: 'half_box', quantity: 1, agreedUnitUsd: '20' },
        ])
      ).id,
    );
  const a = await report(request, { variantId: rule.variantId, group: 'sales' });
  const b = await report(request, { variantId: rule.variantId, group: 'sales', page: '1' });
  expect(a.rows).toHaveLength(25);
  expect(b.rows).toHaveLength(1);
  expect(a.totals).toEqual(b.totals);
  expect(new Decimal(a.totals.boxes).eq(13)).toBe(true);
  expect(a.totals.totalUsd).toBe('520.00');
  expect(a.rowCount).toBe(26);
  expect(new Set([...a.rows, ...b.rows].map((r) => r.saleId))).toEqual(ids);
});
for (const width of [390, 800, 1440])
  test(`estadísticas en cajas y detalle de clientes accesible a ${width}px`, async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width, height: 1050 });
    const rule = await commercialProduct(page.request, 'halves'),
      client = await commercialCustomer(page.request);
    await commercialReceipt(page.request, rule, 5, '10');
    const sale = await sell(page.request, rule, client, 'randy', [
      { presentation: 'box', quantity: 4, agreedUnitUsd: '40' },
      { presentation: 'half_box', quantity: 1, agreedUnitUsd: '20' },
    ]);
    await page.goto('/estadisticas');
    await page
      .getByRole('group', { name: 'Vendedor', exact: true })
      .getByRole('button', { name: 'Randy', exact: true })
      .click();
    const row = page.getByRole('row').filter({ hasText: sale.lines[0].description });
    await expect(row).toContainText('4,5');
    await row.getByRole('button', { name: 'Ver ventas' }).click();
    await expect(page.getByRole('region', { name: 'Totales del período' })).toContainText(
      '4,5 cajas',
    );
    await expect(page.getByRole('table')).toContainText(client.name);
    await expect(page.getByRole('table')).toContainText(sale.lines[0].description);
    await expect(page.getByRole('table')).not.toContainText('Media caja');
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    fs.mkdirSync('apps/web/.impeccable/review', { recursive: true });
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    await page.screenshot({
      path: `apps/web/.impeccable/review/${width === 1440 ? 'desktop' : width === 390 ? 'mobile' : 'user-800'}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page
      .getByRole('group', { name: 'Ver detalle por' })
      .getByRole('button', { name: 'Clientes', exact: true })
      .click();
    await expect(page.getByRole('table')).toContainText(client.name);
    await page.getByLabel('Desde', { exact: true }).fill('2099-01-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2099-01-02');
    await page.getByRole('button', { name: 'Ver estadísticas' }).click();
    await expect(page.getByText('No hay ventas en esta selección')).toBeVisible();
  });
