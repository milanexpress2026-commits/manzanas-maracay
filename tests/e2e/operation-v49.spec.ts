import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { SaleDetail, PaymentDetail, Catalog } from '../../packages/domain/src/index';
import { loginPage, loginRequest } from './helpers/auth';
import { commerceHeaders, commercePost, commercialCustomer } from './helpers/commerce';
import { unpricedProduct, receiveUnknown, manualSaleInput } from './helpers/operation-v45';
import { chooseSaleClient } from './helpers/sale-client';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

test('V4.9 hora automática: reloj adelantado/atrasado, stock recibido después del borrador y replay estable', async ({
  request,
}) => {
  await loginRequest(request);
  const product = await unpricedProduct(request),
    client = await commercialCustomer(request);
  const old = new Date(Date.now() - 86_400_000).toISOString();
  await receiveUnknown(request, product, 4);
  const future = new Date(Date.now() + 7_200_000).toISOString();
  for (const soldAt of [future, old]) {
    const preview = await request.post('/api/inventory/sale-preview', {
      headers: commerceHeaders(),
      data: {
        soldAt,
        dateMode: 'automatic',
        lines: [
          { lineKey: randomUUID(), configurationId: product.id, presentation: 'box', quantity: 1 },
        ],
      },
    });
    expect(preview.status(), await preview.text()).toBe(200);
    expect((await preview.json()).valid).toBe(true);
    const body = {
      ...manualSaleInput(client, product, 1),
      soldAt,
      dateMode: 'automatic',
      initialPayment: {
        currency: 'USD',
        amount: '10',
        method: 'usd_cash',
        receivedAt: future,
        dateMode: 'automatic',
      },
    };
    const key = randomUUID(),
      before = Date.now();
    const sale = await commercePost<SaleDetail>(request, '/api/sales', body, key);
    expect(Date.parse(sale.soldAt)).toBeGreaterThanOrEqual(before - 2000);
    expect(Date.parse(sale.soldAt)).toBeLessThanOrEqual(Date.now() + 2000);
    expect(sale.balanceUsd).toBe('30.00');
    expect(await commercePost(request, '/api/sales', body, key)).toEqual(sale);
    const paymentBody = {
      clientId: client.id,
      currency: 'USD',
      amount: '30',
      method: 'usd_cash',
      receivedAt: old,
      dateMode: 'automatic',
      applications: [{ saleId: sale.id, amountUsd: '30' }],
    };
    const paymentKey = randomUUID();
    const paid = await commercePost<PaymentDetail>(
      request,
      '/api/payments',
      paymentBody,
      paymentKey,
    );
    expect(Date.parse(paid.receivedAt)).toBeGreaterThanOrEqual(Date.parse(sale.soldAt));
    expect(await commercePost(request, '/api/payments', paymentBody, paymentKey)).toEqual(paid);
  }
  // Explicit manual time still means what the operator entered; no silent rewrite.
  const rejected = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: {
      ...manualSaleInput(client, product, 1),
      soldAt: future,
      dateMode: 'manual',
    },
  });
  expect(rejected.status()).toBe(400);
});

test('V4.9 celular: preparar y revisar con reloj adelantado y esperar un minuto permite cobrar', async ({
  page,
}) => {
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request);
  await receiveUnknown(page.request, product, 2);
  await page.clock.install({ time: new Date(Date.now() + 7_200_000) });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ventas/nueva');
  await expect(page.locator('input[type="datetime-local"]')).toHaveCount(0);
  await chooseSaleClient(page, client);
  const line = page.getByRole('region', { name: 'Producto 1', exact: true });
  await line.getByLabel('Producto', { exact: true }).selectOption(product.id);
  await line.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
  await page.clock.fastForward(65_000);
  await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
  await page.clock.fastForward(65_000);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+\?guardada=1$/);
});

for (const width of [390, 800])
  test(`V4.9 catálogo ${width}: agregar calibre conserva producto y permite completar todo en un formulario`, async ({
    page,
  }) => {
    await loginPage(page);
    const product = await unpricedProduct(page.request, 'blister');
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/catalogo?producto=' + product.id);
    await page
      .getByRole('button', { name: 'Agregar calibre a este producto', exact: true })
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Fruta', { exact: true })).toHaveValue(product.fruitId);
    await expect(dialog.getByLabel('Presentación de la caja', { exact: true })).toBeVisible();
    const label = 'QA-' + randomUUID().slice(0, 8);
    await dialog.getByRole('button', { name: 'Crear calibre', exact: true }).click();
    await dialog.getByLabel('Nuevo calibre', { exact: true }).fill(label);
    await dialog.getByRole('button', { name: 'Guardar calibre', exact: true }).click();
    await dialog.getByLabel('Blíster por caja', { exact: true }).fill('5');
    await dialog
      .getByLabel('Confirmo que este empaque y sus presentaciones son correctos.')
      .check();
    await noHorizontalOverflow(page);
    expect(
      (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
    ).toEqual([]);
    fs.mkdirSync('docs/capturas/operacion-v4-9', { recursive: true });
    await page.screenshot({ path: `docs/capturas/operacion-v4-9/calibre-${width}.png` });
    await dialog.getByRole('button', { name: 'Revisar producto', exact: true }).click();
    await expect(dialog).toContainText(label);
    await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Producto guardado' })).toBeVisible();
    const catalog = (await (await page.request.get('/api/catalog')).json()) as Catalog;
    const added = catalog.configurations.find(
      (item) => item.fruitId === product.fruitId && item.caliber === label,
    );
    expect(added?.blistersPerBox).toBe(5);
    expect(added?.confirmationStatus).toBe('confirmed');
    expect(catalog.configurations.find((item) => item.id === product.id)?.blistersPerBox).toBe(4);
  });
