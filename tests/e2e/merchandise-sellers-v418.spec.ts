import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { SellerReport, SaleDetail, Presentation } from '../../packages/domain/src';
import { loginRequest, loginPage } from './helpers/auth';
import {
  commercePost,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSale,
} from './helpers/commerce';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

test('mercancía por vendedor separa presentaciones, suma ampliaciones y excluye anulaciones', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request),
    customer = await commercialCustomer(request);
  await commercialReceipt(request, rule, 12, '10');
  const sell = (
    seller: 'carlos' | 'randy',
    lines: { presentation: Presentation; quantity: number; agreedUnitUsd: string }[],
  ) =>
    commercePost<SaleDetail>(request, '/api/sales', {
      schemaVersion: 2,
      seller,
      clientId: customer.id,
      condition: 'credit',
      settlementBasis: 'divisa',
      dateMode: 'automatic',
      soldAt: new Date().toISOString(),
      lines: lines.map((line) => ({ configurationId: rule.id, ...line })),
    });
  const carlos = await sell('carlos', [
    { presentation: 'box', quantity: 2, agreedUnitUsd: '40' },
    { presentation: 'half_box', quantity: 1, agreedUnitUsd: '23' },
  ]);
  await commercePost(request, `/api/sales/${carlos.id}/add-products`, {
    expectedVersion: 0,
    lines: [
      { configurationId: rule.id, presentation: 'blister', quantity: 3, agreedUnitUsd: '8' },
      { configurationId: rule.id, presentation: 'box', quantity: 1, agreedUnitUsd: '45' },
    ],
  });
  await sell('randy', [{ presentation: 'box', quantity: 1, agreedUnitUsd: '50' }]);
  await commercialSale(request, customer, rule, 1, '21', 'half_box');
  const cancelled = await sell('carlos', [
    { presentation: 'box', quantity: 1, agreedUnitUsd: '99' },
  ]);
  await commercePost(request, `/api/sales/${cancelled.id}/cancel`, {
    reason: 'Pedido cancelado antes de entregar',
  });
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date());
  const report: SellerReport = await (
    await request.get(`/api/sales/sellers/summary?from=${day}&to=${day}`)
  ).json();
  const products = (seller: 'carlos' | 'randy' | null) =>
    report.rows
      .find((row) => row.seller === seller)!
      .merchandise.filter((row) => row.variantId === rule.variantId);
  expect(
    products('carlos').map(({ presentation, quantity, totalUsd }) => ({
      presentation,
      quantity,
      totalUsd,
    })),
  ).toEqual([
    { presentation: 'blister', quantity: 3, totalUsd: '24.00' },
    { presentation: 'box', quantity: 3, totalUsd: '125.00' },
    { presentation: 'half_box', quantity: 1, totalUsd: '23.00' },
  ]);
  expect(products('randy')).toMatchObject([
    { presentation: 'box', quantity: 1, totalUsd: '50.00' },
  ]);
  expect(products(null)).toMatchObject([
    { presentation: 'half_box', quantity: 1, totalUsd: '21.00' },
  ]);
  const empty: SellerReport = await (
    await request.get('/api/sales/sellers/summary?from=2098-01-01&to=2098-01-02')
  ).json();
  expect(empty.rows.every((row) => row.count === 0 && row.merchandise.length === 0)).toBe(true);
});

for (const width of [390, 800, 1440])
  test(`mercancía legible y selector de socio a ${width}px`, async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    const rule = await commercialProduct(page.request),
      customer = await commercialCustomer(page.request);
    await commercialReceipt(page.request, rule, 2, '10');
    await commercePost(page.request, '/api/sales', {
      schemaVersion: 2,
      seller: 'randy',
      clientId: customer.id,
      condition: 'credit',
      settlementBasis: 'divisa',
      dateMode: 'automatic',
      soldAt: new Date().toISOString(),
      lines: [
        { configurationId: rule.id, presentation: 'half_box', quantity: 1, agreedUnitUsd: '25' },
      ],
    });
    await page.goto('/ventas/resumen');
    const region = page.getByRole('region', { name: 'Mercancía vendida', exact: true });
    await region.getByRole('button', { name: 'Randy', exact: true }).click();
    await expect(region.getByRole('button', { name: 'Randy', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    const table = region.getByRole('table', { name: 'Productos vendidos por Randy' });
    await expect(table).toContainText('Media caja');
    await expect(table).toContainText('USD 25,00');
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
    fs.mkdirSync('../../work/v418-ui', { recursive: true });
    await page.screenshot({
      path: `../../work/v418-ui/merchandise-${width}.png`,
      fullPage: true,
      animations: 'disabled',
    });
    await page.getByLabel('Desde', { exact: true }).fill('2098-01-01');
    await page.getByLabel('Hasta', { exact: true }).fill('2098-01-02');
    await page.getByRole('button', { name: 'Ver resumen', exact: true }).click();
    await expect(region).toContainText('No hay mercancía vendida por Randy');
  });
