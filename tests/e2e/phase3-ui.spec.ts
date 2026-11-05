import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { loginPage } from './helpers/auth';
import type { SaleDetail, ClientAccount } from '../../packages/domain/src/index';

const origin = { Origin: 'http://127.0.0.1:3200' };
const publicRoutes = [
  '/',
  '/demo',
  '/demo/catalogo',
  '/demo/inventario',
  '/demo/recepciones',
  '/demo/ventas',
  '/demo/cobranza',
];

test('demo anónima completa sin API privada, escritura ni sesión compartida', async ({
  page,
  browser,
  request,
}) => {
  const apiCalls: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) apiCalls.push(r.url());
  });
  for (const route of publicRoutes) {
    await page.goto(route);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText(/solo lectura/i).first()).toBeVisible();
  }
  expect(apiCalls).toEqual([]);
  expect((await page.context().cookies()).some((c) => c.name === 'mm_session')).toBe(false);
  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  try {
    await page.goto('/demo/catalogo');
    await page
      .getByRole('textbox', { name: 'Buscar productos de ejemplo' })
      .fill('sin-coincidencia-demo');
    await expect(page.getByText('No hay coincidencias. Prueba con otra fruta.')).toBeVisible();
    await secondPage.goto('http://127.0.0.1:3200/demo/catalogo');
    await expect(
      secondPage.getByRole('textbox', { name: 'Buscar productos de ejemplo' }),
    ).toHaveValue('');
    await expect(secondPage.getByText('Kiwi', { exact: true })).toBeVisible();
  } finally {
    await secondContext.close();
  }
  for (const path of [
    'catalog',
    'inventory',
    'clients',
    'sales',
    'payments',
    'collections',
    'prices',
    'rates/current',
    'push/status',
  ])
    expect((await request.get('/api/' + path)).status(), path).toBe(401);
  expect(
    (
      await request.post('/api/sales', {
        headers: { ...origin, 'Idempotency-Key': randomUUID() },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.patch('/api/clients/' + randomUUID(), {
        headers: { ...origin, 'Idempotency-Key': randomUUID() },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect((await request.delete('/api/sales/' + randomUUID(), { headers: origin })).status()).toBe(
    403,
  );
  expect((await request.get('/api/sales/' + randomUUID() + '/document')).status()).toBe(401);
});

for (const width of [390, 800, 1024, 1440]) {
  test(`demo responsive ${width}px, accesibilidad, foco y movimiento reducido`, async ({
    page,
  }) => {
    test.setTimeout(150000);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    fs.mkdirSync('docs/capturas/fase3', { recursive: true });
    for (const route of ['/', '/demo', '/demo/catalogo', '/demo/ventas', '/demo/cobranza']) {
      await page.goto(route);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        route,
      ).toBe(true);
      if (width === 390 || width === 1440) {
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(
          audit.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) })),
          route,
        ).toEqual([]);
      }
      await page.screenshot({
        path: `docs/capturas/fase3/${route === '/' ? 'inicio' : route.slice(1).replaceAll('/', '-')}-${width}.png`,
        fullPage: true,
      });
    }
    await page.goto('/demo/ventas');
    const trigger = page.getByRole('button', { name: 'Ver comprobante de ejemplo' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(
      await page
        .getByRole('dialog')
        .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration)),
    ).toBeLessThan(0.01);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (
      width < 1100 &&
      (await page.getByRole('button', { name: 'Abrir navegación' }).isVisible())
    ) {
      await page.getByRole('button', { name: 'Abrir navegación' }).click();
      await page.getByRole('dialog').getByRole('link', { name: 'Inventario', exact: true }).click();
      await expect(page).toHaveURL(/\/demo\/inventario$/);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, {
    headers: { ...origin, 'Idempotency-Key': randomUUID() },
    data,
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response.json();
}

test('venta UI a crédito sin asiento cero, reintento idempotente, abono elegido y PDF', async ({
  page,
}) => {
  test.setTimeout(150000);
  await loginPage(page);
  const suffix = randomUUID().slice(0, 8);
  const client = await post(page, '/api/clients', { name: 'DEMO cliente UI ' + suffix });
  const fruit = await post(page, '/api/catalog/fruits', { name: 'DEMO fruta UI ' + suffix });
  const config = await post(page, '/api/catalog/configurations', {
    fruitId: fruit.id,
    varietyId: null,
    caliberId: null,
    commercialLine: 'Caja',
    packingModel: 'whole',
    halfPreparation: 'none',
    blistersPerBox: null,
    allowedPresentations: ['box'],
    confirmationStatus: 'confirmed',
  });
  const supplier = await post(page, '/api/suppliers', {
    name: 'DEMO proveedor comercial UI ' + suffix,
  });
  await post(page, '/api/receipts', {
    supplierId: supplier.id,
    reference: 'DEMO UI ' + suffix,
    receivedAt: '2026-11-01T10:00:00-04:00',
    isDemo: true,
    lines: [
      {
        configurationId: config.id,
        boxes: 10,
        unitCostUsd: '25',
        priceAction: 'update',
        prices: [{ presentation: 'box', promoUsd: '40', regularUsd: '45' }],
      },
    ],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/ventas/nueva');
  await page.getByLabel('Cliente', { exact: true }).selectOption(client.id);
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await page.getByLabel('Producto', { exact: true }).selectOption(config.id);
  await expect(page.getByLabel('Presentación', { exact: true })).toBeDisabled();
  await expect(page.getByLabel('Presentación', { exact: true })).toHaveValue('box');
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByLabel('Precio acordado').selectOption('usd_cash_promo');
  await expect(page.getByLabel('Precio unitario (USD)')).toHaveValue(/^40(?:\.0+)?$/);
  await page.getByLabel('Abono hoy (opcional) · USD', { exact: true }).fill('00,00');
  const keys: string[] = [];
  let saved: SaleDetail | undefined;
  await page.route('**/api/sales', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    keys.push(route.request().headers()['idempotency-key']);
    expect(route.request().postDataJSON()).not.toHaveProperty('initialPayment');
    if (keys.length === 1) {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      saved = await response.json();
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Confirmación perdida de prueba. Reintenta.' }),
      });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText('Confirmación perdida');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  expect(keys).toHaveLength(2);
  expect(keys[1]).toBe(keys[0]);
  expect(saved?.payments).toEqual([]);
  expect(saved?.totalUsd).toBe('80.00');
  expect(Number(saved?.costUsd)).toBe(50);
  const saleId = page.url().split('/').at(-1)!;
  await expect(page.getByRole('button', { name: 'Cobrar por WhatsApp' })).toBeDisabled();
  // This UI scenario explicitly exercises unavailable quotes, independent of provider/network state.
  await page.route('**/api/rates/current', (route) =>
    route.fulfill({
      json: { status: 'unavailable', rate: null, usdt: { status: 'unavailable', rate: null } },
    }),
  );
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await page.getByLabel('Monto recibido').fill('30');
  await expect(page.getByRole('option', { name: 'Bolívares · tasa del acuerdo' })).toBeDisabled();
  const paymentKeys: string[] = [];
  let recordedPaymentId = '';
  await page.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    paymentKeys.push(route.request().headers()['idempotency-key']);
    if (paymentKeys.length === 1) {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      recordedPaymentId = (await response.json()).id;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Confirmación del abono perdida. Reintenta.' }),
      });
    }
    return route.continue();
  });
  await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Confirmación del abono perdida');
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(paymentKeys).toHaveLength(2);
  expect(paymentKeys[1]).toBe(paymentKeys[0]);
  const accountResponse = await page.request.get('/api/clients/' + client.id);
  const account = (await accountResponse.json()) as ClientAccount;
  expect(account.sales.find((s) => s.id === saleId)?.balanceUsd).toBe('50.00');
  expect(account.payments).toHaveLength(1);
  expect(account.payments[0].id).toBe(recordedPaymentId);
  for (const path of [
    '/api/sales/' + saleId + '/document',
    '/api/payments/' + account.payments[0].id + '/document',
  ]) {
    const pdf = await page.request.get(path);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  fs.mkdirSync('docs/capturas/fase3', { recursive: true });
  await page.screenshot({ path: 'docs/capturas/fase3/venta-interna-390.png', fullPage: true });
});

test('precios parciales: configurar solo caja y conservar presentaciones pendientes', async ({
  page,
}) => {
  test.setTimeout(120000);
  await loginPage(page);
  const suffix = randomUUID().slice(0, 8);
  const fruit = await post(page, '/api/catalog/fruits', { name: 'DEMO precio parcial ' + suffix });
  const config = await post(page, '/api/catalog/configurations', {
    fruitId: fruit.id,
    varietyId: null,
    caliberId: null,
    commercialLine: 'Estándar',
    packingModel: 'blister',
    halfPreparation: 'pending',
    blistersPerBox: null,
    allowedPresentations: ['box', 'half_box', 'blister'],
    confirmationStatus: 'pending',
  });
  const supplier = await post(page, '/api/suppliers', { name: 'DEMO precio proveedor ' + suffix });
  await page.goto('/catalogo');
  await page.getByRole('textbox', { name: 'Buscar en el catálogo' }).fill(fruit.name);
  await page.getByRole('button', { name: 'Ver ' + fruit.name, exact: true }).click();
  await page.getByRole('button', { name: 'Editar precios', exact: true }).click();
  const priceDialog = page.getByRole('dialog');
  await priceDialog.getByLabel('Promocional divisa', { exact: true }).first().fill('40');
  await priceDialog.getByLabel('Regular · Bs. BCV', { exact: true }).first().fill('45');
  await expect(priceDialog.getByLabel('Promocional divisa', { exact: true }).nth(1)).toHaveValue(
    '',
  );
  await priceDialog.getByRole('button', { name: 'Actualizar precios', exact: true }).click();
  await expect(priceDialog).toHaveCount(0);
  const catalog = await (await page.request.get('/api/catalog')).json();
  const prices = catalog.configurations.find((c: { id: string }) => c.id === config.id).prices;
  expect(
    Number(prices.find((p: { presentation: string }) => p.presentation === 'box')?.promoUsd),
  ).toBe(40);
  expect(
    prices
      .filter(
        (p: { presentation: string; promoUsd: string | null; regularUsd: string | null }) =>
          p.presentation !== 'box',
      )
      .every(
        (p: { promoUsd: string | null; regularUsd: string | null }) =>
          p.promoUsd === null && p.regularUsd === null,
      ),
  ).toBe(true);
  await page.goto('/recepciones');
  await page.getByLabel('Proveedor', { exact: true }).selectOption(supplier.id);
  await page.getByLabel('Referencia del documento').fill('DEMO precios ' + suffix);
  await page.getByLabel('Fruta, variedad y calibre').selectOption(config.id);
  await page.getByLabel('Cajas cerradas recibidas').fill('1');
  await page.getByLabel('Costo por caja (USD)').fill('25');
  await page.getByRole('radio', { name: 'Actualizar precios', exact: true }).check();
  await page.getByLabel('Promocional divisa', { exact: true }).first().fill('42');
  const receiptKeys: string[] = [];
  let receivedLotId = '';
  await page.route('**/api/receipts', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    receiptKeys.push(route.request().headers()['idempotency-key']);
    if (receiptKeys.length === 1) {
      const response = await route.fetch();
      expect(response.ok(), await response.text()).toBe(true);
      receivedLotId = (await response.json()).lots[0].id;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Confirmación de recepción perdida. Reintenta.' }),
      });
    }
    return route.continue();
  });
  await expect(page.getByLabel('Fecha y hora de recepción')).not.toHaveValue('');
  await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const received = page.waitForRequest(
    (r) => r.url().endsWith('/api/receipts') && r.method() === 'POST',
  );
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar recepción', exact: true })
    .click();
  expect((await received).postDataJSON().lines[0].prices).toHaveLength(1);
  await expect(page.getByRole('alert')).toContainText('Confirmación de recepción perdida');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar recepción', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mercancía recibida', exact: true }),
  ).toBeVisible();
  expect(receiptKeys).toHaveLength(2);
  expect(receiptKeys[1]).toBe(receiptKeys[0]);
  const receivedLot = await (await page.request.get('/api/inventory/lots/' + receivedLotId)).json();
  expect(receivedLot.lot.closedBoxes).toBe(1);
  const updated = await (await page.request.get('/api/catalog')).json();
  expect(
    Number(
      updated.configurations
        .find((c: { id: string }) => c.id === config.id)
        .prices.find((p: { presentation: string }) => p.presentation === 'box').promoUsd,
    ),
  ).toBe(42);
});
