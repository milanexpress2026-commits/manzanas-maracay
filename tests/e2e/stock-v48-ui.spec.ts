import { test, expect, type Page, type Route } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import type {
  Configuration,
  ClientSummary,
  SaleDetail,
  SalePreviewResult,
} from '../../packages/domain/src/index';
import { loginPage } from './helpers/auth';
import { commercialCustomer, commercePost } from './helpers/commerce';
import { chooseSaleClient } from './helpers/sale-client';
import { manualSale, receiveUnknown, unpricedProduct } from './helpers/operation-v45';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

const reviewButton = (page: Page) =>
  page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true });
const row = (page: Page, index = 1) =>
  page.getByRole('region', { name: 'Producto ' + index, exact: true });
async function openSale(page: Page, client: ClientSummary, product: Configuration) {
  await page.goto('/ventas/nueva');
  await chooseSaleClient(page, client);
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await row(page).getByLabel('Producto', { exact: true }).selectOption(product.id);
  await row(page).getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('divisa');
}
async function available(page: Page, product: Configuration) {
  const response = await page.request.get('/api/inventory/sale-availability');
  expect(response.ok()).toBe(true);
  return (
    (await response.json()).items.find(
      (item: { configurationId: string; presentation: string }) =>
        item.configurationId === product.id && item.presentation === 'box',
    )?.availableQuantity ?? 0
  );
}
async function clientSales(page: Page, client: ClientSummary) {
  const response = await page.request.get('/api/clients/' + client.id);
  expect(response.ok()).toBe(true);
  return (await response.json()).sales as SaleDetail[];
}
async function confirm(page: Page) {
  await reviewButton(page).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+\?guardada=1$/);
}

test('V4.8 T01/T18: recepción abierta 5 + 4, exceso inmediato 10/25/1000 y máximo sin duplicar salida', async ({
  page,
}) => {
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request);
  const firstReceipt = await receiveUnknown(page.request, product, 5);
  await openSale(page, client, product);
  await expect(row(page)).toContainText('Disponible para esta venta: 5');
  const secondReceipt = await receiveUnknown(page.request, product, 4);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(row(page)).toContainText('Disponible para esta venta: 9');
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(client.id);
  await expect(row(page).getByLabel('Precio por unidad (USD)', { exact: true })).toHaveValue('40');
  for (const quantity of ['10', '25', '1000']) {
    let release!: () => void;
    let arrived!: () => void;
    const waiting = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handler = async (route: Route) => {
      arrived();
      await held;
      await route.continue();
    };
    await page.route('**/api/inventory/sale-preview', handler);
    const response = page.waitForResponse(
      (result) =>
        new URL(result.url()).pathname === '/api/inventory/sale-preview' &&
        result.request().postDataJSON().lines[0].quantity === Number(quantity),
    );
    try {
      await row(page).getByLabel('Cantidad', { exact: true }).fill(quantity);
      await waiting;
      // No server response can supply this warning: its request is explicitly held above.
      await expect(row(page).getByLabel('Cantidad', { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(row(page)).toContainText(
        'Supera la última disponibilidad comprobada (9). Actualizando existencias',
      );
      await expect(reviewButton(page)).toBeDisabled();
      await expect(
        row(page).getByRole('button', { name: 'Usar máximo disponible (9)', exact: true }),
      ).toHaveCount(0);
    } finally {
      release();
    }
    expect((await response).ok()).toBe(true);
    await expect(
      row(page).getByRole('button', { name: 'Usar máximo disponible (9)', exact: true }),
    ).toBeVisible();
    await page.unroute('**/api/inventory/sale-preview', handler);
  }
  expect(await available(page, product)).toBe(9);
  expect(await clientSales(page, client)).toHaveLength(0);
  await row(page).getByRole('button', { name: 'Usar máximo disponible (9)', exact: true }).click();
  await expect(row(page).getByLabel('Cantidad', { exact: true })).toHaveValue('9');
  await expect(
    row(page).getByRole('button', { name: 'Aumentar cantidad del producto 1' }),
  ).toBeDisabled();
  await confirm(page);
  const sales = await clientSales(page, client);
  expect(sales).toHaveLength(1);
  const detail: SaleDetail = await (await page.request.get('/api/sales/' + sales[0].id)).json();
  expect(detail.lines[0].quantity).toBe(9);
  const byLot = Object.fromEntries(
    [firstReceipt, secondReceipt].map((receipt) => [
      receipt.lots[0].id,
      detail.lines[0].allocations
        .filter((item) => item.lotId === receipt.lots[0].id)
        .reduce((sum, item) => sum + item.quantity, 0),
    ]),
  );
  expect(byLot).toEqual({ [firstReceipt.lots[0].id]: 5, [secondReceipt.lots[0].id]: 4 });
  expect(await available(page, product)).toBe(0);
});

test('V4.8 T04: dos líneas del mismo producto comparten las 9 cajas y conservan precios distintos', async ({
  page,
}) => {
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request);
  await receiveUnknown(page.request, product, 9);
  await openSale(page, client, product);
  await row(page).getByLabel('Cantidad', { exact: true }).fill('6');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  await row(page, 2).getByLabel('Producto', { exact: true }).selectOption(product.id);
  await row(page, 2).getByLabel('Cantidad', { exact: true }).fill('4');
  await row(page, 2).getByLabel('Precio por unidad (USD)', { exact: true }).fill('43');
  await expect(row(page, 2)).toContainText('Disponible para esta venta: 3');
  await expect(row(page)).toContainText('Disponible para esta venta: 5');
  await expect(reviewButton(page)).toBeDisabled();
  expect(await available(page, product)).toBe(9);
  await row(page, 2)
    .getByRole('button', { name: 'Usar máximo disponible (3)', exact: true })
    .click();
  await expect(row(page)).toContainText('Disponible para esta venta: 6');
  await confirm(page);
  const sales = await clientSales(page, client);
  const detail: SaleDetail = await (await page.request.get('/api/sales/' + sales[0].id)).json();
  expect(detail.totalUsd).toBe('369.00');
  expect(
    detail.lines.map((item) => ({ quantity: item.quantity, price: item.agreedUnitUsd })),
  ).toEqual([
    { quantity: 6, price: '40.0000' },
    { quantity: 3, price: '43.0000' },
  ]);
  expect(await available(page, product)).toBe(0);
});

test('V4.8 T13: stock cambia de 9 a 2 mientras se revisa; primera confirmación vuelve a consultar sin enviar la venta', async ({
  page,
}) => {
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request),
    other = await commercialCustomer(page.request);
  await receiveUnknown(page.request, product, 9);
  await openSale(page, client, product);
  await row(page).getByLabel('Cantidad', { exact: true }).fill('4');
  await reviewButton(page).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('button', { name: 'Confirmar venta', exact: true })).toBeEnabled();
  await manualSale(page.request, other, product, 7);
  let posts = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sales' && request.method() === 'POST') posts++;
  });
  await dialog.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Las existencias cambiaron',
  );
  await expect(row(page)).toContainText('Disponible para esta venta: 2');
  await expect(row(page).getByLabel('Cantidad', { exact: true })).toHaveValue('4');
  await expect(row(page).getByLabel('Precio por unidad (USD)', { exact: true })).toHaveValue('40');
  await expect(page.getByLabel('Cliente', { exact: true })).toHaveValue(client.id);
  expect(posts).toBe(0);
  expect(await clientSales(page, client)).toHaveLength(0);
  await row(page).getByRole('button', { name: 'Usar máximo disponible (2)', exact: true }).click();
  const refreshed = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/inventory/sale-preview' && response.ok(),
  );
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await refreshed;
  await confirm(page);
  expect(posts).toBe(1);
});

for (const width of [390, 800])
  test(`V4.8 T14/T15 ${width}px: presentación obligatoria, cantidad estricta y cero existencias accesibles`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const product = await unpricedProduct(page.request, 'halves'),
      empty = await unpricedProduct(page.request),
      client = await commercialCustomer(page.request);
    const pending = await commercePost<Configuration>(page.request, '/api/catalog/configurations', {
      fruitId: product.fruitId,
      commercialLine: 'Empaque sin confirmar QA',
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      blistersPerBox: null,
      confirmationStatus: 'pending',
    });
    await receiveUnknown(page.request, product, 9);
    await openSale(page, client, product);
    await expect(
      row(page).getByLabel('Producto', { exact: true }).locator(`option[value="${pending.id}"]`),
    ).toBeDisabled();
    await expect(
      row(page).getByLabel('Producto', { exact: true }).locator(`option[value="${pending.id}"]`),
    ).toContainText('Empaque pendiente');
    await expect(
      page.getByRole('link', { name: 'Revisar empaques en catálogo', exact: true }),
    ).toBeVisible();
    const quantity = row(page).getByLabel('Cantidad', { exact: true });
    await expect(quantity).toBeDisabled();
    await expect(row(page)).toContainText('Elige la presentación');
    await expect(reviewButton(page)).toBeDisabled();
    await row(page).getByLabel('Presentación', { exact: true }).selectOption('box');
    await row(page).getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
    await expect(quantity).toBeEnabled();
    for (const text of ['0', '-1', '1.5', '1e3', 'NaN', '1001', '']) {
      await quantity.fill(text);
      await expect(quantity).toHaveValue(text);
      await expect(quantity).toHaveAttribute('aria-invalid', 'true');
      await expect(row(page)).toContainText('cantidad entera');
      await expect(reviewButton(page)).toBeDisabled();
    }
    await quantity.fill('10');
    await expect(
      row(page).getByRole('button', { name: 'Usar máximo disponible (9)' }),
    ).toBeVisible();
    await quantity.focus();
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const inputBounds = await quantity.boundingBox();
    expect(inputBounds!.height).toBeGreaterThanOrEqual(44);
    fs.mkdirSync('docs/capturas/existencias-v4-8', { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `docs/capturas/existencias-v4-8/cantidad-${width}.png`,
      fullPage: true,
    });
    await row(page).getByLabel('Producto', { exact: true }).selectOption(empty.id);
    await quantity.fill('1');
    await row(page).getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
    await expect(row(page).getByLabel('Presentación', { exact: true })).toHaveValue('box');
    await expect(row(page)).toContainText('Disponible para esta venta: 0');
    await expect(reviewButton(page)).toBeDisabled();
    await expect(
      row(page).getByRole('button', { name: 'Aumentar cantidad del producto 1' }),
    ).toBeDisabled();
    expect(await clientSales(page, client)).toHaveLength(0);
    expect(await available(page, product)).toBe(9);
  });

test('V4.8 T18: otra venta consume la última línea después del preview; rollback conserva la primera y permite corregir', async ({
  page,
}) => {
  await loginPage(page);
  const first = await unpricedProduct(page.request),
    last = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request),
    other = await commercialCustomer(page.request);
  await receiveUnknown(page.request, first, 2);
  await receiveUnknown(page.request, last, 1);
  await openSale(page, client, first);
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  await row(page, 2).getByLabel('Producto', { exact: true }).selectOption(last.id);
  await row(page, 2).getByLabel('Precio por unidad (USD)', { exact: true }).fill('20');
  await reviewButton(page).click();
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Confirmar venta', exact: true }),
  ).toBeEnabled();
  let intercepted = false;
  await page.route('**/api/inventory/sale-preview', async (route) => {
    const response = await route.fetch();
    const data: SalePreviewResult = await response.json();
    if (!intercepted) {
      intercepted = true;
      expect(data.valid).toBe(true);
      await manualSale(page.request, other, last, 1);
    }
    await route.fulfill({ response });
  });
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible();
  expect(intercepted).toBe(true);
  expect(await available(page, first)).toBe(2);
  expect(await available(page, last)).toBe(0);
  expect(await clientSales(page, client)).toHaveLength(0);
  await expect(row(page).getByLabel('Precio por unidad (USD)', { exact: true })).toHaveValue('40');
  await expect(row(page, 2).getByLabel('Precio por unidad (USD)', { exact: true })).toHaveValue(
    '20',
  );
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith('mm.commerce.pending.v1:') && key.endsWith(':sale'),
      ),
    ),
  ).toEqual([]);
});

test('V4.8 recuperación: COMMIT perdido con stock cero se recupera sin consultar ni exigir un nuevo preview', async ({
  page,
}) => {
  await loginPage(page);
  const product = await unpricedProduct(page.request),
    client = await commercialCustomer(page.request);
  await receiveUnknown(page.request, product, 1);
  await openSale(page, client, product);
  const sent: Array<{ key: string; body: string }> = [];
  let originalId = '';
  await page.route('**/api/sales', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    sent.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (sent.length === 1) {
      originalId = (await response.json()).id;
      return route.fulfill({
        status: 503,
        json: { message: 'Respuesta perdida después del COMMIT.' },
      });
    }
    return route.fulfill({ response });
  });
  await reviewButton(page).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Respuesta perdida');
  expect(await available(page, product)).toBe(0);
  let previews = 0;
  await page.route('**/api/inventory/sale-preview', (route) => {
    previews++;
    return route.fulfill({
      status: 503,
      json: { message: 'Esta consulta no debe bloquear el reintento.' },
    });
  });
  await page.reload();
  await expect(page.getByRole('dialog')).toContainText('Solicitud conservada');
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp('/ventas/' + originalId + '\\?guardada=1$'));
  expect(previews).toBe(0);
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(sent[0]);
  expect(await clientSales(page, client)).toHaveLength(1);
  expect(await available(page, product)).toBe(0);
});
