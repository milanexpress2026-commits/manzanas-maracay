import { historicalSaleCost } from './helpers/historical-cost';
import { chooseSaleClient } from './helpers/sale-client';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { loginPage } from './helpers/auth';

const origin = { Origin: 'http://127.0.0.1:3200' };
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { ...origin, 'Idempotency-Key': randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}
async function fixture(page: Page) {
  await loginPage(page);
  const tag = randomUUID().slice(0, 8);
  const client = await post(page, '/api/clients', { name: 'DEMO caja rápida ' + tag });
  const supplier = await post(page, '/api/suppliers', { name: 'DEMO proveedor caja ' + tag });
  const products = [];
  for (const [fruitName, price, cost] of [
    ['Manzana QA', '40', '25'],
    ['Pera QA', '20', '5'],
  ]) {
    const fruit = await post(page, '/api/catalog/fruits', { name: fruitName + ' ' + tag });
    const product = await post(page, '/api/catalog/configurations', {
      fruitId: fruit.id,
      varietyId: null,
      caliberId: null,
      commercialLine: 'Caja QA',
      packingModel: 'whole',
      halfPreparation: 'none',
      blistersPerBox: null,
      allowedPresentations: ['box'],
      confirmationStatus: 'confirmed',
    });
    await post(page, '/api/receipts', {
      supplierId: supplier.id,
      reference: fruitName + ' ' + tag,
      receivedAt: new Date(Date.now() - 60_000).toISOString(),
      isDemo: true,
      lines: [
        {
          configurationId: product.id,
          boxes: 10,
          unitCostUsd: cost,
          priceAction: 'update',
          prices: [{ presentation: 'box', promoUsd: price, regularUsd: String(Number(price) + 5) }],
        },
      ],
    });
    products.push(product);
  }
  await page.goto('/ventas/nueva');
  await chooseSaleClient(page, client);
  await page.getByLabel('Producto', { exact: true }).selectOption(products[0].id);
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  return { client, products };
}
async function stock(page: Page, id: string) {
  const availability = await (await page.request.get('/api/inventory/sale-availability')).json();
  return availability.items.find(
    (item: { configurationId: string; presentation: string }) =>
      item.configurationId === id && item.presentation === 'box',
  ).availableQuantity;
}
async function capture(page: Page, name: string) {
  fs.mkdirSync('docs/capturas/hotfix-ux-v3', { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.screenshot({ path: 'docs/capturas/hotfix-ux-v3/' + name + '.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const result = await new AxeBuilder({ page }).analyze();
  expect(result.violations).toEqual([]);
  const measurement = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    documentHeight: document.documentElement.scrollHeight,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  fs.writeFileSync(
    'docs/capturas/hotfix-ux-v3/' + name + '.json',
    JSON.stringify(
      {
        ...measurement,
        browser: 'Chromium desktop emulation',
        physicalDevice: false,
        axeViolations: result.violations.length,
      },
      null,
      2,
    ) + '\n',
  );
}

for (const width of [390, 800, 1024, 1440]) {
  test(`venta rápida ${width}: total actual, precio negociado, contado sin fechas y una sola salida`, async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width, height: 900 });
    const { products } = await fixture(page);
    await expect(page.getByRole('radio', { name: 'Contado', exact: true })).toBeChecked();
    await expect(page.locator('#sale-due, #sale-reminder, #sale-paid')).toHaveCount(0);
    await expect(page.locator('input#sale-method')).toHaveCount(0);
    await expect(page.getByLabel('Método de cobro')).toHaveValue('usd_cash');
    await expect(page.getByLabel('Presentación', { exact: true })).toHaveValue('box');
    await page.getByRole('button', { name: 'Aumentar cantidad del producto 1' }).click();
    await expect(page.getByLabel('Total de la venta')).toHaveText('USD 80,00');
    await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
    await page.getByLabel('Producto', { exact: true }).nth(1).selectOption(products[1].id);
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).nth(1).fill('20');
    await expect(page.getByLabel('Total de la venta')).toHaveText('USD 100,00');
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).first().fill('38');
    await expect(page.getByLabel('Total de la venta')).toHaveText('USD 96,00');
    await page.getByRole('button', { name: 'Quitar producto 2' }).click();
    await expect(page.getByLabel('Total de la venta')).toHaveText('USD 76,00');
    await capture(page, 'contado-' + width);
    await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
    await page.getByRole('button', { name: '15 días', exact: true }).click();
    const due = await page.locator('#sale-due').inputValue();
    const reminder = new Date(Date.parse(due + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
    await page.locator('#sale-reminder').fill(reminder);
    await expect(page.getByLabel('Método de cobro')).toHaveCount(0);
    await expect(page.locator('#sale-currency')).toHaveCount(0);
    await capture(page, 'credito-' + width);
    expect(due).not.toBe(reminder);
    await page.getByRole('radio', { name: 'Contado', exact: true }).check();
    await expect(page.locator('#sale-due, #sale-reminder')).toHaveCount(0);
    await expect(page.getByLabel('Precio por unidad (USD)')).toHaveValue('38');
    let payload: Record<string, unknown> | undefined;
    let posts = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname === '/api/sales' && request.method() === 'POST') {
        posts++;
        payload = request.postDataJSON();
      }
    });
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('USD 76,00');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    expect(posts).toBe(1);
    expect(payload).toMatchObject({
      condition: 'cash',
      dueDate: null,
      reminderDate: null,
      initialPayment: { currency: 'USD', amount: '76.00', method: 'usd_cash' },
    });
    const id = page.url().split('/').at(-1);
    const sale = await (await page.request.get('/api/sales/' + id)).json();
    expect(sale.totalUsd).toBe('76.00');
    expect(sale.balanceUsd).toBe('0.00');
    expect(sale.costUsd).toBeNull();
    await historicalSaleCost(sale.id, '50.0000');
    expect(await stock(page, products[0].id)).toBe(8);
    for (let count = 0; count < 2; count++) {
      const pdf = await page.request.get('/api/sales/' + id + '/document');
      expect(pdf.headers()['content-type']).toContain('application/pdf');
      expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    expect(await stock(page, products[0].id)).toBe(8);
  });
}

test('crédito cero y abono completo conservan acuerdo, fechas independientes y cero mensajes automáticos', async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { client } = await fixture(page);
  const messages: string[] = [];
  page.on('request', (request) => {
    if (/wa\.me|whatsapp/.test(request.url())) messages.push(request.url());
  });
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await page.getByRole('button', { name: '7 días', exact: true }).click();
  const due = await page.locator('#sale-due').inputValue();
  const reminder = new Date(Date.parse(due + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10);
  await page.locator('#sale-reminder').fill(reminder);
  await expect(page.locator('#sale-currency, #sale-method')).toHaveCount(0);
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  const id = page.url().split('/').at(-1);
  const before = await (await page.request.get('/api/sales/' + id)).json();
  expect(before).toMatchObject({
    balanceUsd: '40.00',
    settlementBasis: 'divisa',
    dueDate: due,
    reminderDate: reminder,
    payments: [],
  });
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await page.getByLabel('Método de pago').selectOption('usdt_transfer');
  await expect(page.getByLabel('Método de pago')).toHaveValue('usdt_transfer');
  await page.getByRole('button', { name: 'Cobrar saldo completo', exact: true }).click();
  await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const after = await (await page.request.get('/api/sales/' + id)).json();
  expect(after).toMatchObject({
    totalUsd: '40.00',
    balanceUsd: '0.00',
    settlementBasis: 'divisa',
    dueStatus: 'paid',
  });
  expect(after.payments).toHaveLength(1);
  expect(after.payments[0]).toMatchObject({
    currency: 'USDT',
    method: 'usdt_transfer',
    amount: '40.00',
  });
  const account = await (await page.request.get('/api/clients/' + client.id)).json();
  expect(account.payments).toHaveLength(1);
  expect(messages).toEqual([]);
  await expect(page.getByRole('button', { name: 'Cambiar fechas', exact: true })).toHaveCount(0);
  const collections = await (await page.request.get('/api/collections')).json();
  expect(collections.invoices.some((invoice: { id: string }) => invoice.id === id)).toBe(false);
});

test('crédito con abono inicial registra saldo real y no recupera fechas borradas al pagar completo', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { products } = await fixture(page);
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await page.getByRole('button', { name: '7 días', exact: true }).click();
  await page.locator('#sale-reminder').fill(await page.locator('#sale-due').inputValue());
  await page.getByRole('checkbox', { name: 'Registrar un abono ahora' }).check();
  await page.locator('#sale-paid').fill('40');
  await expect(page.locator('#sale-due, #sale-reminder')).toHaveCount(0);
  await page.locator('#sale-paid').fill('10');
  await expect(page.locator('#sale-due')).toHaveValue('');
  await expect(page.locator('#sale-reminder')).toHaveValue('');
  await page.getByRole('button', { name: '15 días', exact: true }).click();
  const due = await page.locator('#sale-due').inputValue();
  await expect(page.getByLabel('Método de cobro')).toHaveValue('usd_cash');
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('USD 30,00');
  await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  const id = page.url().split('/').at(-1);
  const sale = await (await page.request.get('/api/sales/' + id)).json();
  expect(sale).toMatchObject({
    condition: 'credit',
    totalUsd: '40.00',
    balanceUsd: '30.00',
    settlementBasis: 'divisa',
    dueDate: due,
    reminderDate: null,
  });
  expect(sale.payments).toHaveLength(1);
  expect(sale.payments[0]).toMatchObject({ currency: 'USD', amount: '10.00', method: 'usd_cash' });
  expect(await stock(page, products[0].id)).toBe(9);
  for (const path of [
    '/api/sales/' + id + '/document',
    '/api/payments/' + sale.payments[0].id + '/document',
  ]) {
    const pdf = await page.request.get(path);
    expect(pdf.ok(), await pdf.text()).toBe(true);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  expect(await stock(page, products[0].id)).toBe(9);
});

test('el borrador vuelve desde recepción sin guardar datos privados en Web Storage', async ({
  page,
}) => {
  const { client } = await fixture(page);
  await page.getByLabel('Cantidad', { exact: true }).fill('11');
  await page.getByRole('link', { name: 'Registrar recepción', exact: true }).click();
  await page.getByRole('link', { name: 'Volver a la venta guardada', exact: true }).click();
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(client.id);
  await expect(page.getByLabel('Cantidad', { exact: true })).toHaveValue('11');
  await expect(page.getByLabel('Acuerdo de cobro')).toHaveValue('divisa');
  expect(
    await page.evaluate(() =>
      [...Object.values(sessionStorage), ...Object.values(localStorage)].some(
        (value) => String(value).includes('clientId') || String(value).includes('agreedUnitUsd'),
      ),
    ),
  ).toBe(false);
});

test('revisión conserva cotización, vencimiento exige refrescar y API rechaza una tasa de prueba no registrada', async ({
  page,
}) => {
  test.setTimeout(90000);
  const { client, products } = await fixture(page);
  const clock = new Date();
  await page.clock.install({ time: clock });
  const firstId = randomUUID();
  const secondId = randomUUID();
  let quoteCount = 0;
  await page.route('**/api/rates/current', (route) => {
    quoteCount++;
    return route.fulfill({
      json: {
        status: 'unavailable',
        rate: null,
        usdt: {
          status: 'available',
          rate: {
            id: quoteCount === 1 ? firstId : secondId,
            rate: quoteCount === 1 ? '50.000000' : '60.000000',
            source: 'BINANCE_P2P_BUY',
            sourceUrl: 'https://www.binance.com/',
            verifiedAt: clock.toISOString(),
            validFrom: new Date(clock.valueOf() - 60000).toISOString(),
            validUntil: new Date(
              clock.valueOf() + (quoteCount === 1 ? 10000 : 300000),
            ).toISOString(),
          },
        },
      },
    });
  });
  await page.reload();
  await chooseSaleClient(page, client);
  const product = products[0];
  await page.getByLabel('Producto', { exact: true }).selectOption(product.id);
  await page.getByLabel('Acuerdo de cobro').selectOption('divisa');
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByLabel('Método de cobro').selectOption('ves_usdt');
  await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('VES 2.000,00');
  await page.clock.fastForward(11000);
  await expect(dialog).toContainText('VES 2.000,00');
  await expect(dialog).toContainText('USD 0,00');
  await dialog.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('La cotización venció');
  await dialog.getByRole('button', { name: 'Volver a editar', exact: true }).click();
  // Browser-only time travel must not submit a future commercial timestamp to the real API.
  await page.clock.setSystemTime(new Date());
  await page.getByRole('button', { name: 'Actualizar tasa', exact: true }).click();
  await expect(
    page
      .getByText('Binance P2P · compra · referencia general: 60.000000', { exact: false })
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
  await expect(dialog).toContainText('VES 2.400,00');
  const response = page.waitForResponse(
    (res) => new URL(res.url()).pathname === '/api/sales' && res.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  const rejected = await response;
  expect(rejected.status()).toBe(503);
  expect((await rejected.json()).message).toContain('tasa USDT de compra seleccionada');
  expect(rejected.request().postDataJSON().initialPayment.rateId).toBe(secondId);
  expect(await stock(page, product.id)).toBe(10);
});

test('vídeo QA de venta de contado desde cliente y producto hasta comprobante', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3200',
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: '.local/ux-v3/sales-video', size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await fixture(page);
    await page.getByRole('button', { name: 'Aumentar cantidad del producto 1' }).click();
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    await expect(page.getByRole('link', { name: 'Descargar PDF', exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
  fs.mkdirSync('docs/capturas/hotfix-ux-v3', { recursive: true });
  await video!.saveAs('docs/capturas/hotfix-ux-v3/venta-contado-390.webm');
});
