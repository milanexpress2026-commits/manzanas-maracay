import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import Decimal from 'decimal.js';
import { Client } from 'pg';
import type { Catalog, HabitualCatalogOptions, SaleDetail } from '../../packages/domain/src/index';
import { databaseTarget } from '../../packages/database/src/environment';
import { assertIsolatedProduction, assertNoDocumentOverflow, loginProduction } from './ui-helpers';
import { chooseReceiptProduct, setReceiptPrice } from '../e2e/helpers/quick-receipt-ui';

// Run after the closed-gate empty checks and the LOCAL activation fixture, before other writes.
// The harness owns creation/activation/cleanup of the unique production_regression database.
test.beforeEach(async ({}, testInfo) => assertIsolatedProduction(testInfo));

async function assertOperationalCounts(expected: {
  prices: number;
  suppliers: number;
  purchases: number;
  lots: number;
}) {
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
      (
        await client.query(`select
      (select count(*)::int from price_items) prices,
      (select count(*)::int from suppliers) suppliers,
      (select count(*)::int from purchases) purchases,
      (select count(*)::int from lots) lots`)
      ).rows[0],
    ).toEqual(expected);
  } finally {
    await client.end();
  }
}

test('QA V4.2 vacía real: opciones habituales, tres productos sin proveedor, contado y crédito liquidado', async ({
  browser,
}) => {
  test.setTimeout(240000);
  fs.mkdirSync('docs/capturas/recepcion-v4-2', { recursive: true });
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
      dir: '.local/production-qa/recepcion-v4-2-videos',
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
    const options: HabitualCatalogOptions = await (
      await page.request.get('/api/catalog/options')
    ).json();
    expect(options.options.length).toBeGreaterThan(60);
    expect(await (await page.request.get('/api/catalog')).json()).toEqual(catalog);
    await assertOperationalCounts({ prices: 0, suppliers: 0, purchases: 0, lots: 0 });
    await page.goto('/catalogo');
    await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeVisible();
    await expect(page.getByLabel('Buscar producto', { exact: true })).toBeVisible();
    await page.getByLabel('Buscar producto', { exact: true }).fill('Gala 100');
    await expect(
      page.getByRole('button', { name: 'Recibir Manzana · Gala · 100', exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeEnabled();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/capturas/recepcion-v4-2/catalogo-virtual-vacio-390.png',
      fullPage: true,
    });
    const chosen = [
      options.options.find(
        (row) =>
          row.templateId === 'apple_traditional' &&
          row.varietyName === 'Gala' &&
          row.caliberLabel === '100',
      )!,
      options.options.find(
        (row) =>
          row.templateId === 'apple_traditional' &&
          row.varietyName === 'Roja normal' &&
          row.caliberLabel === '113',
      )!,
      options.options.find((row) => row.templateId === 'kiwi')!,
    ];
    expect(chosen[0]!.suggestedPacking?.blistersPerBox).toBe(4);
    expect(chosen[1]!.suggestedPacking?.blistersPerBox).toBe(5);
    expect(chosen[2]!.suggestedPacking).toMatchObject({
      blistersPerBox: null,
      allowedPresentations: ['box', 'half_box'],
    });
    expect(new Decimal(chosen[2]!.suggestedPacking!.boxWeightKg!).eq('10')).toBe(true);
    expect(chosen.every((row) => row.configurationId === null)).toBe(true);
    await page.goto('/recepciones');
    await expect(page.getByLabel('Proveedor (opcional)', { exact: true })).not.toBeVisible();
    await expect(
      page.getByLabel('Documento del proveedor (opcional)', { exact: true }),
    ).not.toBeVisible();
    await expect(
      page.getByLabel('Fecha y hora de recepción (opcional)', { exact: true }),
    ).not.toBeVisible();
    for (let index = 0; index < chosen.length; index++) {
      const line = await chooseReceiptProduct(
        page,
        chosen[index]!.label,
        index,
        ['Gala 100', 'Roja 113', 'Kiwi'][index],
      );
      await line.getByLabel('Cajas recibidas', { exact: true }).fill(['2', '6', '3'][index]!);
      await line
        .getByLabel('Costo real por caja · USD', { exact: true })
        .fill(['25', '27', '30'][index]!);
      if (index < 2)
        await expect(
          line.getByText(`${index === 0 ? 4 : 5} blíster por caja`, { exact: true }),
        ).toBeVisible();
      await expect(line.getByRole('checkbox', { name: /Verifiqué esta presentación/ })).toHaveCount(
        0,
      );
    }
    await setReceiptPrice(page, 0, '40', '48');
    await assertNoDocumentOverflow(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/capturas/recepcion-v4-2/vacio-tres-lineas-390.png',
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Sin proveedor indicado');
    await expect(page.getByRole('dialog')).toContainText('USD 302,00');
    await page.getByRole('button', { name: 'Guardar recepción', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Recepción guardada', exact: true }),
    ).toBeVisible();
    await assertOperationalCounts({ prices: 2, suppliers: 0, purchases: 1, lots: 3 });
    expect(await (await page.request.get('/api/suppliers')).json()).toEqual([]);
    const confirmedCatalog: Catalog = await (await page.request.get('/api/catalog')).json();
    expect(confirmedCatalog.configurations).toHaveLength(3);
    const apple = confirmedCatalog.configurations.find(
      (row) => row.fruit === 'Manzana' && row.variety === 'Gala' && row.caliber === '100',
    )!;
    expect(apple).toMatchObject({
      confirmationStatus: 'confirmed',
      blistersPerBox: 4,
      allowedPresentations: ['box', 'blister'],
    });
    expect(
      confirmedCatalog.configurations.find((row) => row.variety === 'Roja normal')?.blistersPerBox,
    ).toBe(5);
    const inventoryBefore = await (await page.request.get('/api/inventory')).json();
    expect(inventoryBefore.lots).toHaveLength(3);
    expect(
      inventoryBefore.lots.every(
        (row: { supplierId: string | null; supplier: string | null; isDemo: boolean }) =>
          row.supplierId === null && row.supplier === null && !row.isDemo,
      ),
    ).toBe(true);
    const lot = inventoryBefore.lots.find(
      (row: { configurationId: string }) => row.configurationId === apple.id,
    );
    expect(lot.closedBoxes).toBe(2);
    expect(lot.unitCostUsd).toBe('25.0000');
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
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: 'docs/capturas/recepcion-v4-2/vacio-primera-venta-contado.png',
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
    expect(new Date(sale.soldAt).getTime()).toBeGreaterThanOrEqual(
      new Date(lot.receivedAt).getTime(),
    );
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
  await video?.saveAs('docs/capturas/recepcion-v4-2/vacio-recepcion-venta-credito-qa.webm');
});
