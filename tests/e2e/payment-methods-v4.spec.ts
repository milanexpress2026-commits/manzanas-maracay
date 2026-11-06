import { chooseSaleClient } from './helpers/sale-client';
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { loginPage } from './helpers/auth';
import {
  commercePost,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSaleInput,
} from './helpers/commerce';
import { syntheticPaymentRates } from './helpers/rates';
import type { SaleDetail, PaymentDetail } from '../../packages/domain/src/commerce';

for (const agreement of ['divisa', 'bcv'] as const) {
  test(`cuatro métodos V4: ${agreement} cobra VES en venta y abono con su snapshot exacto`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await loginPage(page);
    const product = await commercialProduct(page.request, 'whole');
    const client = await commercialCustomer(page.request);
    const receipt = await commercialReceipt(
      page.request,
      product,
      4,
      '25',
      new Date(Date.now() - 60000).toISOString(),
    );
    const rates = await syntheticPaymentRates();
    // The UI feed is scoped to these synthetic IDs; the real API resolves and validates each immutable row.
    await page.route('**/api/rates/current', (route) => route.fulfill({ json: rates.status }));
    const quote = agreement === 'divisa' ? rates.usdt : rates.bcv;
    const price = agreement === 'divisa' ? '40' : '50';
    const basis = agreement === 'divisa' ? 'usd_cash_promo' : 'ves_regular';
    const method = agreement === 'divisa' ? 'ves_usdt' : 'ves_bcv';
    await page.goto('/ventas/nueva');
    await chooseSaleClient(page, client);
    await page.getByLabel('Producto', { exact: true }).selectOption(product.id);
    await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption(agreement);
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill(price);
    const selector = page.getByLabel('Método de cobro', { exact: true });
    await expect(selector.getByRole('option')).toHaveText([
      'Efectivo USD',
      'Bolívares a tasa BCV',
      'USDT',
      'Bolívares a tasa Binance/USDT compra',
    ]);
    await expect(page.locator('#sale-currency')).toHaveCount(0);
    await selector.selectOption(method);
    await expect(page.getByLabel('Total de la venta')).toHaveText(`USD ${price},00`);
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText(
      agreement === 'divisa' ? 'Binance P2P' : 'BCV oficial',
    );
    await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    const saleId = page.url().split('/').at(-1)!;
    const sale: SaleDetail = await (await page.request.get('/api/sales/' + saleId)).json();
    expect(sale).toMatchObject({
      settlementBasis: agreement,
      totalUsd: price + '.00',
      balanceUsd: '0.00',
      dueDate: null,
      reminderDate: null,
    });
    expect(sale.payments).toHaveLength(1);
    const payment: PaymentDetail = await (
      await page.request.get('/api/payments/' + sale.payments[0]!.id)
    ).json();
    expect(payment).toMatchObject({
      currency: 'VES',
      method: 'bolivares',
      amount: agreement === 'divisa' ? '2000.00' : '3000.00',
      amountUsd: price + '.00',
    });
    expect(agreement === 'divisa' ? payment.usdtRate : payment.bcvRate).toMatchObject({
      id: quote.id,
      rate: quote.rate,
    });
    expect(agreement === 'divisa' ? payment.bcvRate : payment.usdtRate).toBeNull();
    const input = commercialSaleInput(client, product, 1, price);
    const credit = await commercePost<SaleDetail>(page.request, '/api/sales', {
      ...input,
      lines: input.lines.map((line) => ({ ...line, priceBasis: basis })),
    });
    await page.goto('/ventas/' + credit.id);
    await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
    await expect(page.locator('#payment-currency')).toHaveCount(0);
    await page.getByLabel('Método de pago', { exact: true }).selectOption(method);
    await page
      .getByLabel('Monto recibido · VES', { exact: true })
      .fill(agreement === 'divisa' ? '500' : '600');
    await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const updated: SaleDetail = await (await page.request.get('/api/sales/' + credit.id)).json();
    expect(updated).toMatchObject({
      settlementBasis: agreement,
      totalUsd: price + '.00',
      balanceUsd: agreement === 'divisa' ? '30.00' : '40.00',
    });
    expect(updated.payments).toHaveLength(1);
    const abono: PaymentDetail = await (
      await page.request.get('/api/payments/' + updated.payments[0]!.id)
    ).json();
    expect(agreement === 'divisa' ? abono.usdtRate : abono.bcvRate).toMatchObject({
      id: quote.id,
      rate: quote.rate,
    });
    for (const path of [
      '/api/sales/' + saleId + '/document',
      '/api/payments/' + abono.id + '/document',
    ]) {
      const pdf = await page.request.get(path);
      expect(pdf.status()).toBe(200);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    const lot = await (await page.request.get('/api/inventory/lots/' + receipt.lots[0]!.id)).json();
    expect(lot.lot.closedBoxes).toBe(2);
  });
}

test('cuatro métodos V4: elección explícita, crédito optativo y accesibilidad en cuatro anchos', async ({
  page,
}) => {
  test.setTimeout(120000);
  await loginPage(page);
  const product = await commercialProduct(page.request, 'whole');
  const client = await commercialCustomer(page.request);
  await commercialReceipt(
    page.request,
    product,
    2,
    '25',
    new Date(Date.now() - 60000).toISOString(),
  );
  const rates = await syntheticPaymentRates();
  await page.route('**/api/rates/current', (route) => route.fulfill({ json: rates.status }));
  await page.goto('/ventas/nueva');
  await chooseSaleClient(page, client);
  await page.getByLabel('Producto', { exact: true }).selectOption(product.id);
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('38');
  const method = page.getByLabel('Método de cobro', { exact: true });
  await expect(
    method.getByRole('option', { name: 'Bolívares a tasa BCV', exact: true }),
  ).toBeDisabled();
  await method.selectOption('usdt_transfer');
  await expect(page.getByLabel('Total de la venta')).toHaveText('USD 38,00');
  await method.selectOption('ves_usdt');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('bcv');
  await expect(method).toHaveValue('ves_usdt');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Requiere un acuerdo promocional/divisa' }),
  ).toBeVisible();
  await expect(page.getByLabel('Precio por unidad (USD)', { exact: true })).toHaveValue('38');
  await method.selectOption('ves_bcv');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  fs.mkdirSync('docs/capturas/v4', { recursive: true });
  for (const width of [390, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `docs/capturas/v4/cuatro-metodos-${width}.png`, fullPage: true });
  }
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await expect(page.getByRole('checkbox', { name: 'Registrar un abono ahora' })).not.toBeChecked();
  await expect(page.locator('#sale-method, #sale-paid, #sale-currency')).toHaveCount(0);
  await page.getByRole('checkbox', { name: 'Registrar un abono ahora' }).check();
  await method.selectOption('ves_bcv');
  await page.getByLabel('Abono hoy (opcional) · VES', { exact: true }).fill('600');
  await page.getByRole('checkbox', { name: 'Registrar un abono ahora' }).uncheck();
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('Sin abono');
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  const sale: SaleDetail = await (
    await page.request.get('/api/sales/' + page.url().split('/').at(-1))
  ).json();
  expect(sale.payments).toEqual([]);
  expect(sale.balanceUsd).toBe('38.00');
});
