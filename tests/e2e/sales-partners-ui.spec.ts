import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { SaleDetail } from '../../packages/domain/src';
import { loginPage } from './helpers/auth';
import { commercialCustomer, commercePost } from './helpers/commerce';
import { unpricedProduct, receiveUnknown } from './helpers/operation-v45';
import { chooseSaleClient } from './helpers/sale-client';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';
for (const width of [390, 800, 1440])
  test(`vendedor, ampliación y resumen a ${width}px`, async ({ page }) => {
    test.setTimeout(90000);
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    const rule = await unpricedProduct(page.request),
      customer = await commercialCustomer(page.request);
    await receiveUnknown(page.request, rule, 4);
    await page.goto('/ventas/nueva');
    await expect(page.getByLabel('Vendedor', { exact: true })).toHaveValue('');
    await chooseSaleClient(page, customer);
    await page.getByLabel('Vendedor', { exact: true }).selectOption('randy');
    fs.mkdirSync('../../work/v417-ui', { recursive: true });
    await page.screenshot({ path: `../../work/v417-ui/seller-${width}.png`, fullPage: true });
    await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
    await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Vendedor: Randy');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+\?guardada=1$/);
    const id = new URL(page.url()).pathname.split('/').at(-1)!;
    await expect(page.getByRole('button', { name: 'Anular venta', exact: true })).toBeEnabled();
    await page.getByRole('link', { name: 'Agregar productos', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Agregar productos', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Vendedor', { exact: true })).toHaveCount(0);
    await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('45');
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    fs.mkdirSync('../../work/v417-ui', { recursive: true });
    await page.screenshot({ path: `../../work/v417-ui/add-${width}.png`, fullPage: true });
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    const review = page.getByRole('dialog');
    await expect(review).toContainText('USD 85,00');
    await expect(review).toContainText('USD 45,00');
    await expect(
      review.getByRole('button', { name: 'Guardar productos extra', exact: true }),
    ).toBeEnabled();
    await page.screenshot({
      path: `../../work/v417-ui/review-${width}.png`,
      animations: 'disabled',
    });
    let sent = 0;
    if (width === 800)
      await page.route(`**/api/sales/${id}/add-products`, async (route) => {
        sent++;
        if (sent === 1) {
          const response = await route.fetch();
          expect(response.status()).toBe(201);
          await route.abort('failed');
        } else await route.continue();
      });
    await review.getByRole('button', { name: 'Guardar productos extra', exact: true }).click();
    if (width === 800) {
      await expect(review).toContainText('No llegó una confirmación verificable');
      await page.reload();
      await expect(page.getByRole('dialog')).toContainText('Recuperando la solicitud pendiente');
      await expect(page.getByRole('dialog')).not.toContainText('Nuevo total de la nota');
      await page.screenshot({ path: '../../work/v417-ui/recovery-800.png' });
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Guardar productos extra', exact: true })
        .click();
    }
    await expect(page).toHaveURL(new RegExp(`/ventas/${id}\\?ampliada=1$`));
    const sale: SaleDetail = await (await page.request.get(`/api/sales/${id}`)).json();
    expect(sale).toMatchObject({
      seller: 'randy',
      totalUsd: '85.00',
      paidUsd: '85.00',
      version: 1,
    });
    expect(sale.lines).toHaveLength(2);
    await page.screenshot({ path: `../../work/v417-ui/detail-${width}.png`, fullPage: true });
    await page.goto('/ventas');
    await page.getByRole('link', { name: 'Resumen por vendedor', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Importes por vendedor' })).toContainText('Randy');
    await expect(page.getByRole('table', { name: 'Importes por vendedor' })).toContainText(
      'Sin vendedor asignado',
    );
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `../../work/v417-ui/summary-${width}.png`, fullPage: true });
  });

test('anular desde detalle muestra impacto, restaura stock y conserva nota anulada', async ({
  page,
}) => {
  await loginPage(page);
  const rule = await unpricedProduct(page.request),
    customer = await commercialCustomer(page.request);
  await receiveUnknown(page.request, rule, 1);
  const sale = await commercePost<SaleDetail>(page.request, '/api/sales', {
    schemaVersion: 2,
    seller: 'carlos',
    clientId: customer.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    dateMode: 'automatic',
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '40' }],
  });
  await page.goto('/ventas/' + sale.id);
  await page.getByRole('button', { name: 'Anular venta', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('mercancía quedó en el local');
  for (const width of [390, 800]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.screenshot({ path: `../../work/v417-ui/cancel-${width}.png` });
  }
  await page.getByLabel('La mercancía quedó en el local o fue devuelta.').check();
  await page.getByRole('button', { name: 'Confirmar anulación', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('Anulada', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Agregar productos', exact: true })).toHaveCount(0);
});
