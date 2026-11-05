import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { Client } from 'pg';
import type { Catalog, SaleDetail } from '../../packages/domain/src/index';
import { databaseTarget } from '../../packages/database/src/environment';
import { assertIsolatedProduction, assertNoDocumentOverflow, loginProduction } from './ui-helpers';

// Run after the closed-gate empty checks and the LOCAL activation fixture, before other writes.
// The harness owns creation/activation/cleanup of the unique production_regression database.
test.beforeEach(async ({}, testInfo) => assertIsolatedProduction(testInfo));

async function assertNoPersistedPrices() {
  const fixture = JSON.parse(
    fs.readFileSync(
      process.env.MM_PRODUCTION_QA_STATE_FILE ?? path.resolve('.local/production-qa/current.json'),
      'utf8',
    ),
  );
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.MM_APP_ENV !== 'production' ||
    fixture.runId !== process.env.MM_QA_RUN_ID ||
    fixture.database !== process.env.MM_PRODUCTION_TEST_DATABASE ||
    !/^[a-f0-9]{24}$/.test(fixture.runId) ||
    !/^manzanas_maracay_production_test_[a-f0-9]{12}$/.test(fixture.database) ||
    new URL(fixture.ownerUrl).hostname !== '127.0.0.1'
  )
    throw new Error('La consulta de precios solo admite el fixture local de producción QA.');
  const target = databaseTarget(fixture.ownerUrl, {
    environment: 'production',
    role: 'owner',
    nodeEnvironment: 'test',
    productionTestDatabase: fixture.database,
  });
  if (target.purpose !== 'production_regression')
    throw new Error('La consulta no admite una base operativa.');
  const client = new Client({ connectionString: fixture.ownerUrl, statement_timeout: 10000 });
  await client.connect();
  try {
    await client.query('begin read only');
    const binding = (
      await client.query(
        "select e.*,shobj_description(d.oid,'pg_database') as marker from runtime_environment e join pg_database d on d.datname=current_database() where singleton",
      )
    ).rows[0];
    if (
      binding?.database_name !== fixture.database ||
      binding.database_instance_id !== fixture.databaseInstanceId ||
      binding.purpose !== 'production_regression' ||
      binding.marker !== fixture.marker
    )
      throw new Error('El binding no coincide con el ensayo aislado.');
    expect(
      (await client.query('select count(*)::int as total from price_items')).rows[0].total,
    ).toBe(0);
  } finally {
    await client.end();
  }
}

async function activateProduct(page: Page, template: string, caliber: string) {
  const panel = page.getByRole('region', { name: 'Plantillas de productos habituales' });
  await panel.getByLabel('Plantilla de empaque').selectOption(template);
  await panel.getByRole('checkbox', { name: caliber, exact: true }).check();
  await panel.getByRole('button', { name: 'Agregar productos seleccionados', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Productos disponibles');
  return (await (await page.request.get('/api/catalog')).json()) as Catalog;
}

test('QA V4 vacía real: preparar catálogo, confirmar lote al recibir y primera venta sin otra salida', async ({
  browser,
}) => {
  test.setTimeout(240000);
  fs.mkdirSync('docs/capturas/catalogo-v4', { recursive: true });
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
    recordVideo: {
      dir: '.local/production-qa/catalogo-v4-videos',
      size: { width: 390, height: 844 },
    },
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
    await page.screenshot({
      path: 'docs/capturas/catalogo-v4/catalogo-vacio-real.png',
      fullPage: true,
    });
    await page
      .getByRole('button', { name: 'Preparar catálogo de Manzanas Maracay', exact: true })
      .click();
    await page.getByRole('button', { name: 'Revisar catálogo seleccionado', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Revisa lo que se guardará' })).toBeVisible();
    const prepare = page.getByRole('region', { name: 'Preparación del catálogo' });
    await expect(
      prepare.getByRole('button', { name: 'Confirmar y preparar catálogo' }),
    ).toBeDisabled();
    expect(await (await page.request.get('/api/catalog')).json()).toEqual(catalog);
    await prepare.getByRole('checkbox', { name: /Confirmo los nombres y borradores/ }).check();
    await prepare.getByRole('button', { name: 'Confirmar y preparar catálogo' }).click();
    await expect(prepare.getByRole('heading', { name: 'Catálogo preparado' })).toBeVisible();
    const prepared: Catalog = await (await page.request.get('/api/catalog')).json();
    expect(prepared.fruits.map((row) => row.name).sort()).toEqual([
      'Kiwi',
      'Mandarina',
      'Manzana',
      'Pera',
      'Uva',
    ]);
    expect(prepared.configurations).toHaveLength(3);
    for (const row of prepared.configurations) {
      expect(row.confirmationStatus).toBe('pending');
      expect(row.prices.map((price) => price.presentation)).toEqual(row.allowedPresentations);
      for (const price of row.prices) {
        expect(price.promoUsd).toBeNull();
        expect(price.regularUsd).toBeNull();
      }
    }
    await assertNoPersistedPrices();
    expect(prepared.varieties.filter((row) => row.name === 'Amarilla')).toHaveLength(1);
    expect(prepared.varieties.filter((row) => row.name === 'Gala')).toHaveLength(1);
    expect(prepared.configurations.find((row) => row.fruit === 'Kiwi')).toMatchObject({
      varietyId: null,
      caliberId: null,
      allowedPresentations: ['box', 'half_box'],
    });
    expect(
      new Decimal(prepared.configurations.find((row) => row.fruit === 'Kiwi')!.boxWeightKg!).eq(
        '10',
      ),
    ).toBe(true);
    expect(
      prepared.configurations
        .filter((row) => row.fruit === 'Uva')
        .every(
          (row) =>
            row.packingModel === 'whole' &&
            row.allowedPresentations.join() === 'box' &&
            row.boxWeightKg === null,
        ),
    ).toBe(true);
    await prepare.getByRole('button', { name: 'Elegir mi primer producto' }).click();
    const afterApple = await activateProduct(page, 'apple_traditional', '100');
    const apple = afterApple.configurations.find(
      (row) => row.fruit === 'Manzana' && row.variety === 'Gala' && row.caliber === '100',
    )!;
    expect(apple.confirmationStatus).toBe('pending');
    expect(apple.blistersPerBox).toBeNull();
    const afterPear = await activateProduct(page, 'pear', '110');
    const pear = afterPear.configurations.find(
      (row) => row.fruit === 'Pera' && row.variety === 'Forelle' && row.caliber === '110',
    )!;
    expect(pear.confirmationStatus).toBe('pending');
    expect(pear.blistersPerBox).toBeNull();
    const afterCatalog = await (await page.request.get('/api/operations/overview')).json();
    expect(afterCatalog.inventory.sealedBoxes).toBe(0);
    await page.screenshot({
      path: 'docs/capturas/catalogo-v4/catalogo-preparado.png',
      fullPage: false,
    });

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
    await page.getByLabel('Costo por caja (USD)').fill('25');
    await expect(page.getByText('Confirmar el empaque pendiente', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Cantidad sugerida según audio: 5; verificar.', { exact: false }),
    ).toBeVisible();
    await page.getByLabel('Blíster por caja', { exact: true }).fill('5');
    await page.getByRole('checkbox', { name: 'Media caja', exact: true }).uncheck();
    await expect(page.getByRole('checkbox', { name: 'Blíster', exact: true })).toBeChecked();
    await page.getByRole('checkbox', { name: /Verifiqué este empaque/ }).check();
    await page.getByRole('radio', { name: 'Actualizar precios', exact: true }).check();
    await page.getByLabel('Promocional divisa', { exact: true }).first().fill('40');
    await page.getByLabel('Regular · Bs. BCV', { exact: true }).first().fill('48');
    await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Mercancía recibida', exact: true }),
    ).toBeVisible();
    const confirmedCatalog: Catalog = await (await page.request.get('/api/catalog')).json();
    expect(confirmedCatalog.configurations.find((row) => row.id === apple.id)).toMatchObject({
      confirmationStatus: 'confirmed',
      blistersPerBox: 5,
      allowedPresentations: ['box', 'blister'],
      version: apple.version + 1,
    });
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
    await page.getByLabel('Presentación', { exact: true }).selectOption('box');
    await page.getByLabel('Cantidad', { exact: true }).fill('1');
    await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
    await expect(page.getByLabel('Presentación', { exact: true })).toHaveValue('box');
    await expect(page.getByLabel('Fecha acordada (opcional)', { exact: true })).toHaveCount(0);
    await expect(page.getByLabel('Recordar cobrar (opcional)', { exact: true })).toHaveCount(0);
    await expect(page.locator('input#sale-paid')).toHaveCount(0);
    await expect(page.locator('input#sale-method')).toHaveCount(0);
    await expect(page.getByLabel('Método de cobro', { exact: true })).toHaveValue('usd_cash');
    await expect(page.getByLabel('Total de la venta', { exact: true })).toHaveText('USD 40,00');
    await assertNoDocumentOverflow(page);
    await page.screenshot({
      path: 'docs/capturas/catalogo-v4/vacio-primera-venta-contado.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('USD 40,00');
    await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    const saleId = page.url().split('/').at(-1)!;
    const sale: SaleDetail = await (await page.request.get('/api/sales/' + saleId)).json();
    expect(sale.condition).toBe('cash');
    expect(sale.totalUsd).toBe('40.00');
    expect(sale.paidUsd).toBe('40.00');
    expect(sale.balanceUsd).toBe('0.00');
    expect(new Decimal(sale.costUsd).eq('25')).toBe(true);
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
    await page.goto('/ventas/nueva');
    await page
      .getByLabel('Cliente', { exact: true })
      .selectOption({ label: 'Cliente QA contado vacío' });
    await page.getByLabel('Producto', { exact: true }).selectOption(apple.id);
    await page.getByLabel('Presentación', { exact: true }).selectOption('box');
    await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
    await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
    await page.getByRole('button', { name: '7 días', exact: true }).click();
    const due = await page.locator('#sale-due').inputValue();
    await page.locator('#sale-reminder').fill(due);
    await expect(
      page.getByRole('checkbox', { name: 'Registrar un abono ahora' }),
    ).not.toBeChecked();
    await expect(page.locator('#sale-method')).toHaveCount(0);
    await page.getByRole('button', { name: 'Revisar y registrar crédito' }).click();
    await page.getByRole('button', { name: 'Confirmar venta', exact: true }).click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
    const creditId = page.url().split('/').at(-1)!;
    const credit: SaleDetail = await (await page.request.get('/api/sales/' + creditId)).json();
    expect(credit).toMatchObject({
      totalUsd: '40.00',
      balanceUsd: '40.00',
      dueDate: due,
      reminderDate: due,
      payments: [],
    });
    for (const amount of ['10', '30']) {
      await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
      await page.getByLabel('Monto recibido · USD', { exact: true }).fill(amount);
      await page.getByRole('button', { name: 'Revisar abono' }).click();
      await page.getByRole('button', { name: 'Confirmar abono' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      const current: SaleDetail = await (await page.request.get('/api/sales/' + creditId)).json();
      expect(current.balanceUsd).toBe(amount === '10' ? '30.00' : '0.00');
    }
    const paidCredit: SaleDetail = await (await page.request.get('/api/sales/' + creditId)).json();
    expect(paidCredit.payments).toHaveLength(2);
    expect(paidCredit.dueStatus).toBe('paid');
    const collections = await (await page.request.get('/api/collections')).json();
    expect(collections.invoices.some((invoice: { id: string }) => invoice.id === creditId)).toBe(
      false,
    );
    const finalInventory = await (await page.request.get('/api/inventory')).json();
    expect(finalInventory.lots.find((row: { id: string }) => row.id === lot.id).closedBoxes).toBe(
      0,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
  }
  await video?.saveAs('docs/capturas/catalogo-v4/catalogo-vacio-y-venta-qa.webm');
});
