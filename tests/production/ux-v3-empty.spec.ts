import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import Decimal from 'decimal.js';
import type { Catalog, SaleDetail } from '../../packages/domain/src/index';
import { assertIsolatedProduction, assertNoDocumentOverflow, loginProduction } from './ui-helpers';

// Run after the closed-gate empty checks and the LOCAL activation fixture, before other writes.
// The harness owns creation/activation/cleanup of the unique production_regression database.
test.beforeEach(async ({}, testInfo) => assertIsolatedProduction(testInfo));

async function addProduct(
  page: Page,
  fruit: string,
  variety: string,
  caliber: string,
  confirmed: boolean,
) {
  await page.goto('/catalogo');
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  if (!(await dialog.getByLabel('Nombre de la fruta', { exact: true }).isVisible()))
    await dialog.getByRole('button', { name: 'Crear fruta', exact: true }).click();
  await dialog.getByLabel('Nombre de la fruta', { exact: true }).fill(fruit);
  await dialog.getByRole('button', { name: 'Guardar fruta', exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear variedad', exact: true }).click();
  await dialog.getByLabel('Nombre de la variedad', { exact: true }).fill(variety);
  await dialog.getByRole('button', { name: 'Guardar variedad', exact: true }).click();
  await dialog.getByRole('button', { name: 'Crear calibre', exact: true }).click();
  await dialog.getByLabel('Nuevo calibre', { exact: true }).fill(caliber);
  await dialog.getByRole('button', { name: 'Guardar calibre', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Continuar al empaque' }).click();
  await dialog.getByLabel('Presentación de la caja').selectOption('blister');
  await expect(dialog.getByLabel('Blíster por caja')).toHaveValue('');
  if (confirmed) {
    await dialog.getByLabel('Blíster por caja').fill('5');
    await dialog.getByRole('checkbox', { name: /Confirmo que este empaque/ }).check();
  }
  await dialog.getByRole('button', { name: 'Revisar producto' }).click();
  await expect(dialog).toContainText(`${fruit} · ${variety} · Calibre ${caliber}`);
  await assertNoDocumentOverflow(page);
  await page.screenshot({
    path: `docs/capturas/ux-v3/vacio-${fruit.toLowerCase()}-revision.png`,
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Producto guardado', exact: true }),
  ).toBeVisible();
  const catalog: Catalog = await (await page.request.get('/api/catalog')).json();
  const configuration = catalog.configurations.find(
    (row) => row.fruit === fruit && row.variety === variety && row.caliber === caliber,
  );
  expect(configuration).toBeDefined();
  expect(configuration?.confirmationStatus).toBe(confirmed ? 'confirmed' : 'pending');
  await dialog.getByRole('link', { name: 'Registrar entrada de mercancía' }).click();
  if (confirmed)
    await expect(page.getByLabel('Fruta, variedad y calibre', { exact: true })).toHaveValue(
      configuration!.id,
    );
  else
    await expect(
      page.getByText('Este producto tiene el empaque pendiente.', { exact: false }),
    ).toBeVisible();
  return configuration!;
}

test('QA vacía real: alta de Manzana y Pera, recepción 2 cajas, contado 1 caja y reimpresión sin otra salida', async ({
  browser,
}) => {
  test.setTimeout(240000);
  fs.mkdirSync('docs/capturas/ux-v3', { recursive: true });
  // Authenticate before recording. The session remains in RAM, never in an output artifact.
  const loginContext = await browser.newContext({
    baseURL: 'https://localhost:3143',
    ignoreHTTPSErrors: true,
  });
  const loginPage = await loginContext.newPage();
  await loginProduction(loginPage);
  const state = await loginContext.storageState();
  await loginContext.close();
  const context = await browser.newContext({
    baseURL: 'https://localhost:3143',
    ignoreHTTPSErrors: true,
    storageState: state,
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: '.local/production-qa/ux-v3-videos', size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const video = page.video();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const session = await (await page.request.get('/api/auth/me')).json();
    expect(session.environment).toBe('production');
    expect(session.operationsReady).toBe(true);
    const catalog: Catalog = await (await page.request.get('/api/catalog')).json();
    expect(catalog).toEqual({ fruits: [], varieties: [], calibers: [], configurations: [] });
    const overview = await (await page.request.get('/api/operations/overview')).json();
    expect(Object.values(overview.counts)).toEqual(Array(8).fill(0));
    await page.goto('/catalogo');
    await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeVisible();
    await page.screenshot({ path: 'docs/capturas/ux-v3/catalogo-vacio-real.png', fullPage: true });
    const apple = await addProduct(page, 'Manzana', 'Gala', '100', true);
    expect(apple.blistersPerBox).toBe(5);
    expect(apple.allowedPresentations).toEqual(['box']);
    const pear = await addProduct(page, 'Pera', 'Forelle', '110', false);
    expect(pear.blistersPerBox).toBeNull();
    expect((await (await page.request.get('/api/catalog')).json()).fruits).toHaveLength(2);
    const afterCatalog = await (await page.request.get('/api/operations/overview')).json();
    expect(afterCatalog.inventory.sealedBoxes).toBe(0);

    await page.goto('/proveedores');
    await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
    await page.getByLabel('Nombre del proveedor').fill('Proveedor QA catálogo vacío');
    await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/recepciones?producto=' + apple.id);
    await page
      .getByLabel('Proveedor', { exact: true })
      .selectOption({ label: 'Proveedor QA catálogo vacío' });
    await expect(page.getByLabel('Fruta, variedad y calibre', { exact: true })).toHaveValue(
      apple.id,
    );
    await page.getByLabel('Referencia del documento').fill('QA vacío · entrada 2 cajas');
    await page.getByLabel('Cajas cerradas recibidas').fill('2');
    await page.getByLabel('Costo por caja (USD)').fill('12');
    await page.getByRole('radio', { name: 'Actualizar precios', exact: true }).check();
    await page.getByLabel('Promocional divisa', { exact: true }).fill('20');
    await page.getByLabel('Regular · Bs. BCV', { exact: true }).fill('24');
    await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Mercancía recibida', exact: true }),
    ).toBeVisible();
    const inventoryBefore = await (await page.request.get('/api/inventory')).json();
    const lot = inventoryBefore.lots.find(
      (row: { configurationId: string }) => row.configurationId === apple.id,
    );
    expect(lot.closedBoxes).toBe(2);
    expect(lot.isDemo).toBe(false);

    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
    await page.getByLabel('Nombre del cliente').fill('Cliente QA contado vacío');
    await page.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.goto('/ventas/nueva');
    await expect(page.getByRole('radio', { name: 'Contado', exact: true })).toBeChecked();
    await page
      .getByLabel('Cliente', { exact: true })
      .selectOption({ label: 'Cliente QA contado vacío' });
    await page.getByLabel('Producto', { exact: true }).selectOption(apple.id);
    await page.getByLabel('Cantidad', { exact: true }).fill('1');
    await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
    await expect(page.getByLabel('Presentación', { exact: true })).toHaveValue('box');
    await expect(page.getByLabel('Fecha acordada (opcional)', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Recordar cobrar (opcional)', { exact: true })).toHaveCount(0);
    await expect(page.locator('input#sale-paid')).toHaveCount(0);
    await expect(page.locator('input#sale-method')).toHaveCount(0);
    await expect(page.getByLabel('Método de cobro', { exact: true })).toHaveValue('usd_cash');
    await expect(page.getByLabel('Total de la venta', { exact: true })).toHaveText('USD 20,00');
    await assertNoDocumentOverflow(page);
    await page.screenshot({
      path: 'docs/capturas/ux-v3/vacio-primera-venta-contado.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('USD 20,00');
    await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    const saleId = page.url().split('/').at(-1)!;
    const sale: SaleDetail = await (await page.request.get('/api/sales/' + saleId)).json();
    expect(sale.condition).toBe('cash');
    expect(sale.totalUsd).toBe('20.00');
    expect(sale.paidUsd).toBe('20.00');
    expect(sale.balanceUsd).toBe('0.00');
    expect(new Decimal(sale.costUsd).eq('12')).toBe(true);
    expect(sale.dueDate).toBeNull();
    expect(sale.reminderDate).toBeNull();
    expect(sale.payments).toHaveLength(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const pdf = await page.request.get('/api/sales/' + saleId + '/document');
      expect(pdf.status()).toBe(200);
      expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    await page.reload();
    const inventoryAfter = await (await page.request.get('/api/inventory')).json();
    expect(inventoryAfter.lots.find((row: { id: string }) => row.id === lot.id).closedBoxes).toBe(
      1,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
  await video?.saveAs('docs/capturas/ux-v3/catalogo-vacio-y-venta-qa.webm');
});
