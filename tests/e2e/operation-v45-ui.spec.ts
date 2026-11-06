import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import type { PaymentDetail, SaleDetail } from '../../packages/domain/src/index';
import { loginPage } from './helpers/auth';
import { commercialCustomer } from './helpers/commerce';
import { chooseSaleClient } from './helpers/sale-client';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';
import { receiveUnknown, unpricedProduct } from './helpers/operation-v45';
import { syntheticPaymentRates } from './helpers/rates';

for (const [width, method, agreement, currency, amount] of [
  [390, 'usd_cash', 'divisa', 'USD', '40.00'],
  [800, 'usdt_transfer', 'divisa', 'USDT', '40.00'],
  [1024, 'ves_usdt', 'divisa', 'VES', '2000.00'],
  [1440, 'ves_bcv', 'bcv', 'VES', '2400.00'],
] as const)
  test(`V4.5 venta manual ${width}px con ${method}: revisión, accesibilidad y moneda histórica`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rule = await unpricedProduct(page.request);
    const client = await commercialCustomer(page.request);
    await receiveUnknown(page.request, rule, 2);
    const rates = await syntheticPaymentRates();
    await page.route('**/api/rates/current', (route) => route.fulfill({ json: rates.status }));
    await page.goto('/ventas/nueva');
    await chooseSaleClient(page, client);
    await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
    const price = page.getByLabel('Precio por unidad (USD)', { exact: true });
    await expect(price).toHaveValue('');
    await price.fill('40');
    await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption(agreement);
    await page.getByLabel('Método de cobro', { exact: true }).selectOption(method);
    await expect(page.getByLabel('Total de la venta', { exact: true })).toHaveText('USD 40,00');
    await expect(page.locator('#sale-due, #sale-reminder, #sale-paid')).toHaveCount(0);
    await expect(page.getByRole('main')).not.toContainText(
      /Ganancia bruta|Costo de venta|Margen estimado/,
    );
    if (currency === 'USDT') {
      const reference = page.getByRole('region', {
        name: 'Referencia informativa USDT',
        exact: true,
      });
      const equivalent = reference
        .locator('p')
        .filter({ hasText: 'Equivalencia informativa en Bs.' });
      const panelBounds = await reference.boundingBox();
      const amountBounds = await equivalent.boundingBox();
      expect(panelBounds).not.toBeNull();
      expect(amountBounds).not.toBeNull();
      expect(amountBounds!.width).toBeGreaterThanOrEqual(panelBounds!.width * 0.8);
      await reference.getByText('Fuente y vigencia de la referencia', { exact: true }).click();
      await expect(
        reference.getByRole('link', { name: 'Consultar fuente', exact: true }),
      ).toBeVisible();
    }
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    fs.mkdirSync('docs/capturas/operacion-simple-v4-5', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `docs/capturas/operacion-simple-v4-5/venta-${width}-${method}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    const review = page.getByRole('dialog');
    await expect(review).toContainText('USD 40,00');
    const bounds = await review.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000);
    await page.screenshot({
      path: `docs/capturas/operacion-simple-v4-5/revision-${width}-${method}.png`,
    });
    await review.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    const sale: SaleDetail = await (
      await page.request.get('/api/sales/' + page.url().split('/').at(-1)!)
    ).json();
    expect(sale).toMatchObject({
      totalUsd: '40.00',
      balanceUsd: '0.00',
      settlementBasis: agreement,
      costUsd: null,
      grossProfitUsd: null,
      discountUsd: null,
    });
    expect(sale.lines[0]!.referenceUnitUsd).toBeNull();
    const payment: PaymentDetail = await (
      await page.request.get(`/api/payments/${sale.payments[0]!.id}`)
    ).json();
    expect(payment).toMatchObject({ currency, amount, amountUsd: '40.00' });
    if (currency === 'USDT')
      expect(payment.usdtReferenceRate).toMatchObject({
        id: rates.usdt.id,
        equivalentVes: '2000.00',
      });
    if (method === 'ves_usdt') expect(payment.usdtRate?.id).toBe(rates.usdt.id);
    if (method === 'ves_bcv') expect(payment.bcvRate?.id).toBe(rates.bcv.id);
    await expect(page.getByRole('link', { name: 'Descargar PDF', exact: true })).toBeVisible();
    await page.screenshot({
      path: `docs/capturas/operacion-simple-v4-5/comprobante-${width}-${method}.png`,
      fullPage: true,
    });
  });

test('V4.5 USDT sigue disponible con equivalencia Bs no disponible; no envía una tasa inventada', async ({
  page,
}) => {
  await loginPage(page);
  const rule = await unpricedProduct(page.request);
  const client = await commercialCustomer(page.request);
  await receiveUnknown(page.request, rule, 1);
  await page.route('**/api/rates/current', (route) =>
    route.fulfill({
      json: { status: 'unavailable', rate: null, usdt: { status: 'unavailable', rate: null } },
    }),
  );
  await page.goto('/ventas/nueva');
  await chooseSaleClient(page, client);
  await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
  await page.getByLabel('Método de cobro', { exact: true }).selectOption('usdt_transfer');
  await expect(page.getByRole('main')).toContainText(/equivalen.*no disponible/i);
  await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
  const sent = page.waitForRequest(
    (request) => new URL(request.url()).pathname === '/api/sales' && request.method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  const body = (await sent).postDataJSON();
  expect(body.initialPayment).toMatchObject({ currency: 'USDT', amount: '40.00' });
  expect(body.initialPayment.rateId).toBeUndefined();
  expect(body.initialPayment.informationalUsdtRateId).toBeUndefined();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
});
