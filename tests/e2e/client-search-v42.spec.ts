import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type { ClientSummary, SaleDetail } from '../../packages/domain/src/index';
import { loginPage } from './helpers/auth';
import { commercePost, commercialProduct, commercialReceipt } from './helpers/commerce';
import { receiptCounts } from './helpers/receipt-v42';
import { chooseSaleClient } from './helpers/sale-client';

test('cliente fuera de los primeros 200: búsqueda, paginación, borrador y enlace conservan la selección', async ({
  page,
}) => {
  test.setTimeout(120000);
  await loginPage(page);
  await receiptCounts(); // Verifies the local test database binding before adding QA fixtures.
  const list = async (offset = 0): Promise<ClientSummary[]> => {
    const response = await page.request.get('/api/clients', { params: { limit: 200, offset } });
    expect(response.status()).toBe(200);
    return response.json();
  };
  let first = await list();
  const suffix = randomUUID().slice(0, 8);
  // A fresh QA database may have fewer rows. Keep every existing fixture and add only the gap.
  for (let index = first.length; index < 200; index++)
    await commercePost(page.request, '/api/clients', {
      name: `DEMO paginación ${suffix} ${index}`,
    });
  first = await list();
  expect(first).toHaveLength(200);
  const target = await commercePost<ClientSummary>(page.request, '/api/clients', {
    name: `${first.at(-1)!.name} · QA búsqueda ${suffix}`,
    taxId: `QA-RIF-${randomUUID().slice(0, 16)}`,
  });
  expect((await list()).some((row) => row.id === target.id)).toBe(false);
  expect(target.name).not.toContain(target.taxId!);
  expect(target.phone).toBeNull();
  const rif = await page.request.get('/api/clients', { params: { search: target.taxId! } });
  expect(rif.status()).toBe(200);
  expect((await rif.json()).map((client: ClientSummary) => client.id)).toEqual([target.id]);
  expect(
    await (
      await page.request.get('/api/clients', { params: { search: target.taxId + '-ausente' } })
    ).json(),
  ).toEqual([]);
  const anonymous = await page
    .context()
    .browser()!
    .newContext({ baseURL: 'http://127.0.0.1:3200' });
  try {
    expect(
      (await anonymous.request.get('/api/clients', { params: { search: target.taxId! } })).status(),
    ).toBe(401);
  } finally {
    await anonymous.close();
  }
  const second = await list(200);
  expect(second.length).toBeGreaterThan(0);
  const product = await commercialProduct(page.request, 'whole');
  await commercialReceipt(
    page.request,
    product,
    1,
    '25',
    new Date(Date.now() - 60000).toISOString(),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/clientes');
  await page.getByLabel('Buscar clientes', { exact: true }).fill(target.taxId!);
  await expect(page.getByRole('link', { name: target.name, exact: true })).toBeVisible();
  await page.goto('/ventas/nueva');
  await expect(page.getByLabel('Cliente', { exact: true }).locator('option')).toHaveCount(
    first.filter((client) => client.active).length + 1,
  );
  const nextPage = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/clients' && url.searchParams.get('offset') === '200';
  });
  await page.getByRole('button', { name: 'Cargar más clientes', exact: true }).click();
  expect((await nextPage).status()).toBe(200);
  const activeNext = second.find((row) => row.active)!;
  expect(activeNext).toBeDefined();
  await expect(
    page.getByLabel('Cliente', { exact: true }).locator(`option[value="${activeNext.id}"]`),
  ).toHaveText(activeNext.name);
  await chooseSaleClient(page, target);
  const missing = `Sin coincidencias QA ${suffix}`;
  const filtered = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === '/api/clients' && url.searchParams.get('search') === missing;
  });
  await page.getByLabel('Buscar cliente', { exact: true }).fill(missing);
  expect(await (await filtered).json()).toEqual([]);
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(target.id);
  await page.getByLabel('Producto', { exact: true }).selectOption(product.id);
  await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByRole('link', { name: 'Registrar recepción', exact: true }).click();
  await page.getByRole('link', { name: 'Volver a la venta guardada', exact: true }).click();
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(target.id);
  await page.goto(`/ventas/nueva?cliente=${target.id}`);
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(target.id);
  await page.reload();
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(target.id);
  await page.getByLabel('Producto', { exact: true }).selectOption(product.id);
  await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
  await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(target.name);
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  const sale: SaleDetail = await (
    await page.request.get(`/api/sales/${page.url().split('/').at(-1)}`)
  ).json();
  expect(sale).toMatchObject({ clientId: target.id, totalUsd: '40.00', balanceUsd: '0.00' });
});
