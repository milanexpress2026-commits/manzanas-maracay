import { expect, test } from '@playwright/test';
import {
  businessDate,
  addBusinessDays,
  type SaleDetail,
  type SaleSummary,
  type ClientAccount,
  type CollectionsOverview,
} from '../../packages/domain/src/commerce';
import { loginPage } from './helpers/auth';
import {
  commercialCustomer,
  commercialProduct,
  commercialReceipt,
  commercialSaleInput,
  commercePost,
} from './helpers/commerce';

test.use({ actionTimeout: 15_000 });

test('V4.10: historial de más de 200 ventas, deuda antigua, agenda completa y abono sin perder selección', async ({
  page,
}) => {
  test.setTimeout(300_000);
  await loginPage(page);
  const request = page.request;
  const customer = await commercialCustomer(request);
  const product = await commercialProduct(request, 'whole', '1');
  const start = Date.now() - 3 * 86_400_000;
  const today = businessDate();
  const overdue = businessDate(new Date(Date.now() - 86_400_000));
  await commercialReceipt(request, product, 203, '1', new Date(start - 86_400_000).toISOString());
  const sales: SaleDetail[] = [];
  for (let index = 0; index < 202; index++) {
    sales.push(
      await commercePost<SaleDetail>(request, '/api/sales', {
        ...commercialSaleInput(customer, product, 1, '1'),
        soldAt: new Date(start + index * 1000).toISOString(),
        dueDate: index < 200 ? overdue : index === 200 ? today : addBusinessDays(today, 1),
      }),
    );
  }
  const oldest = sales[0]!,
    dueToday = sales[200]!,
    upcoming = sales[201]!;
  // Legacy response stays bounded; operational views must not rely on that first page.
  const account: ClientAccount = await (await request.get('/api/clients/' + customer.id)).json();
  expect(account.sales).toHaveLength(200);
  expect(account.sales.some((sale) => sale.id === oldest.id)).toBe(false);
  expect(account.client.balanceUsd).toBe('202.00');
  const pending: SaleSummary[] = await (
    await request.get(`/api/sales?clientId=${customer.id}&status=pending&limit=100`)
  ).json();
  expect(pending).toHaveLength(100);
  expect(pending[0]?.id).toBe(oldest.id);
  const pinned: SaleSummary[] = await (
    await request.get(
      `/api/sales?clientId=${customer.id}&status=pending&prioritizeId=${upcoming.id}&limit=1`,
    )
  ).json();
  expect(pinned[0]?.id).toBe(upcoming.id);
  const collections: CollectionsOverview = await (await request.get('/api/collections')).json();
  expect(collections.todayInvoices.some((sale) => sale.id === dueToday.id)).toBe(true);
  expect(collections.upcomingInvoices.some((sale) => sale.id === upcoming.id)).toBe(true);
  expect(collections.todayCount).toBeGreaterThanOrEqual(1);
  const todayRows = await (
    await request.get(`/api/sales?collection=today&clientId=${customer.id}`)
  ).json();
  expect(todayRows.map((sale: SaleSummary) => sale.id)).toEqual([dueToday.id]);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ventas');
  const search = page.getByRole('textbox', { name: 'Buscar ventas' });
  await search.fill(oldest.number);
  await expect(page.getByRole('link', { name: oldest.number, exact: true })).toBeVisible();
  await expect(search).toBeFocused();
  await page.goto('/clientes/' + customer.id);
  await expect(
    page.getByRole('button', { name: 'Cargar más comprobantes', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cargar más comprobantes', exact: true }).click();
  await expect(page.getByRole('link', { name: sales[2]!.number, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cargar más comprobantes', exact: true }).click();
  await expect(page.getByRole('link', { name: oldest.number, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await page.getByLabel('Monto recibido · USD', { exact: true }).fill('1');
  const application = page.getByLabel('Aplicar USD a ' + oldest.number, { exact: true });
  await application.fill('1');
  await page.getByRole('button', { name: 'Cargar más pendientes', exact: true }).click();
  await expect(application).toHaveValue('1');
  await expect(
    page.getByLabel('Aplicar USD a ' + sales[199]!.number, { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  let paymentRequests = 0;
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    paymentRequests++;
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    // A slow confirmation must survive the old browser deadline of 20 seconds.
    await new Promise((resolve) => setTimeout(resolve, 25_000));
    await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 40_000 });
  expect(paymentRequests).toBe(1);
  const paid: SaleDetail = await (await request.get('/api/sales/' + oldest.id)).json();
  expect(paid.balanceUsd).toBe('0.00');
  expect(paid.payments).toHaveLength(1);
  const after: ClientAccount = await (await request.get('/api/clients/' + customer.id)).json();
  expect(after.client.balanceUsd).toBe('201.00');
  const filtered: SaleSummary[] = await (
    await request.get(
      `/api/sales?status=pending&clientId=${customer.id}&prioritizeId=${oldest.id}&limit=100`,
    )
  ).json();
  expect(filtered.some((sale) => sale.id === oldest.id)).toBe(false);
  await page.goto('/cobranza');
  await expect(page.getByRole('link', { name: dueToday.number, exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Próximas', exact: true }).click();
  await expect(page.getByRole('link', { name: upcoming.number, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: dueToday.number, exact: true })).toHaveCount(0);
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByRole('tab', { name: 'Hoy', exact: true }).click();
  await expect(page.getByRole('link', { name: dueToday.number, exact: true })).toBeVisible();
});
