import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { loginPage } from './helpers/auth';
import type { Catalog, LotDetail, ReceiptResult, Supplier } from '../../packages/domain/src/index';

test.beforeEach(async ({ page }) => loginPage(page));

async function demoSupplier(page: Page) {
  const response = await page.request.post('/api/suppliers', {
    headers: { Origin: 'http://127.0.0.1:3200', 'Idempotency-Key': randomUUID() },
    data: {
      name: `DEMO interfaz ${randomUUID()}`,
      notes: 'Solo pruebas automatizadas de interfaz',
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<Supplier>;
}
async function lotState(page: Page, id: string): Promise<LotDetail> {
  const response = await page.request.get(`/api/inventory/lots/${id}`);
  expect(response.ok()).toBe(true);
  return response.json();
}
async function confirmMovement(page: Page, name: string) {
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Revisar movimiento', exact: true })
    .click();
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Movimiento guardado' })).toBeVisible();
}

test('proveedor: alta, edición y desactivación conservadas al recargar', async ({ page }) => {
  const name = `DEMO proveedor UI ${randomUUID()}`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/proveedores');
  await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  await page.getByLabel('Nombre del proveedor').fill(name);
  await page.getByLabel('RIF o identificación').fill('DEMO-UI');
  await page.getByLabel('Teléfono').fill('000-0000000');
  await page
    .getByLabel('Observaciones', { exact: true })
    .fill('Proveedor ficticio para prueba de interfaz.');
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByLabel('Buscar proveedores').fill(name);
  await page.getByRole('button', { name: `Editar proveedor ${name}`, exact: true }).click();
  await page.getByLabel('Teléfono').fill('000-1111111');
  await page.getByLabel('Proveedor activo', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name, exact: true })).toHaveCount(0);
  await page.reload();
  await page.getByLabel('Mostrar inactivos', { exact: true }).check();
  await page.getByLabel('Buscar proveedores').fill(name);
  const supplier = page
    .getByRole('article')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(supplier).toContainText('Inactivo');
  await expect(supplier).toContainText('000-1111111');
});

test('recepción multilínea con reintento seguro, apertura, 37 = 18 + 19, ajuste y reversa', async ({
  page,
}) => {
  test.setTimeout(120000);
  const supplier = await demoSupplier(page);
  const catalog = (await (await page.request.get('/api/catalog')).json()) as Catalog;
  const configs = ['80', '180'].map((caliber) =>
    catalog.configurations.find((c) => c.variety === 'Gala' && c.caliber === caliber)!,
  );
  await page.goto('/recepciones');
  await page.getByLabel('Proveedor', { exact: true }).selectOption(supplier.id);
  await page.getByLabel('Referencia del documento').fill(`DEMO-${randomUUID()}`);
  await page.getByLabel('Fecha y hora de recepción').fill('2026-11-04T10:30');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  for (let i = 0; i < configs.length; i++) {
    const line = page.getByRole('region', { name: `Producto ${i + 1}`, exact: true });
    await line.getByLabel('Fruta, variedad y calibre').selectOption(configs[i].id);
    await line.getByLabel('Cajas cerradas recibidas').fill('1');
    await line.getByLabel('Costo por caja (USD)').fill('0,10');
    await line.getByLabel('Blíster por caja en este lote').fill('4');
  }
  const commandKeys: string[] = [];
  let serverReceipt: ReceiptResult | undefined;
  await page.route('**/api/receipts', async (route) => {
    commandKeys.push(route.request().headers()['idempotency-key']);
    if (commandKeys.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      serverReceipt = await response.json();
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Se perdió la confirmación de prueba. Reintenta sin cambiar los datos.',
        }),
      });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('USD 0,1000');
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'Se perdió la confirmación de prueba',
  );
  await expect(page.getByRole('dialog')).toContainText(supplier.name);
  await page.getByRole('button', { name: 'Confirmar recepción', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Mercancía recibida', exact: true }),
  ).toBeVisible();
  expect(commandKeys).toHaveLength(2);
  expect(commandKeys[1]).toBe(commandKeys[0]);
  expect(serverReceipt!.lots).toHaveLength(2);
  const lot = serverReceipt!.lots[0];
  await page
    .getByRole('region', { name: 'Recepción confirmada' })
    .getByRole('link', { name: lot.code, exact: true })
    .click();
  await expect(page.getByRole('heading', { name: `Detalle del lote ${lot.code}` })).toBeVisible();
  const detail = page.getByRole('region', { name: `Detalle del lote ${lot.code}`, exact: true });
  await expect(detail.getByText('DEMO', { exact: true })).toBeVisible();
  expect((await lotState(page, lot.id)).lot.closedBoxes).toBe(1);
  await detail.getByRole('button', { name: 'Abrir caja', exact: true }).click();
  await page.getByLabel('Motivo del movimiento').fill('Apertura física DEMO desde la interfaz');
  await confirmMovement(page, 'Confirmar apertura');
  const opened = await lotState(page, lot.id);
  expect(opened.lot.intactBlisters).toBe(4);
  const blister = opened.containers.find((c) => c.unit === 'intact_blister' && c.quantity === 1)!;
  const blisterRow = detail.getByRole('article').filter({
    has: page.getByRole('heading', { name: `Blíster · ${blister.id.slice(0, 8)}`, exact: true }),
  });
  await blisterRow.getByRole('button', { name: 'Abrir blíster', exact: true }).click();
  await page.getByLabel('Frutas contadas al abrir el blíster').fill('37');
  await page
    .getByLabel('Motivo del movimiento')
    .fill('Conteo físico DEMO de treinta y siete frutas');
  await confirmMovement(page, 'Confirmar apertura');
  await blisterRow.getByRole('button', { name: 'Preparar mitad', exact: true }).click();
  await expect(page.getByLabel('Frutas contadas antes de preparar')).toHaveValue('37');
  await page.getByLabel('Frutas en la media caja preparada').fill('18');
  await page.getByLabel('Frutas que quedan sueltas').fill('20');
  await page.getByLabel('Motivo del movimiento').fill('Preparar media caja DEMO con conteo real');
  await page.getByRole('button', { name: 'Revisar movimiento', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await page.getByLabel('Frutas que quedan sueltas').fill('19');
  await confirmMovement(page, 'Confirmar media caja');
  await expect(detail.getByText('18 piezas contadas y preparadas', { exact: true })).toBeVisible();
  expect((await lotState(page, lot.id)).lot).toMatchObject({
    loosePieces: 19,
    preparedPieces: 18,
    preparedHalfBoxes: 1,
  });
  await detail.getByRole('button', { name: 'Ajustar inventario', exact: true }).click();
  await page.getByLabel('Contenedor de origen').selectOption(blister.id);
  await page.getByLabel('Cambio en piezas sueltas').fill('-1');
  await page.getByLabel('Motivo del movimiento').fill('Una fruta dañada DEMO de prueba');
  await confirmMovement(page, 'Confirmar ajuste');
  expect((await lotState(page, lot.id)).lot.loosePieces).toBe(18);
  await detail.getByRole('button', { name: 'Revertir', exact: true }).click();
  await page.getByLabel('Motivo del movimiento').fill('Corregir el ajuste DEMO de prueba');
  await confirmMovement(page, 'Confirmar reversa');
  await page.reload();
  await expect(page.getByRole('heading', { name: `Detalle del lote ${lot.code}` })).toBeVisible();
  const final = await lotState(page, lot.id);
  expect(final.lot.loosePieces + final.lot.preparedPieces).toBe(37);
  expect(final.movements[0].kind).toBe('reversal');
  expect(final.movements.find((m) => m.kind === 'adjustment')?.reversedBy).not.toBeNull();
});

test('navegación móvil, recuperación de carga y accesibilidad de los nuevos módulos', async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  for (const [label, path, heading] of [
    ['Inventario', '/inventario', 'Inventario'],
    ['Recepciones', '/recepciones', 'Recepción de mercancía'],
    ['Proveedores', '/proveedores', 'Proveedores'],
  ]) {
    await page.getByRole('button', { name: 'Abrir navegación', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true, level: 1 })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Cargando registros' })).toHaveCount(0);
    await expect(page.getByText('ENTORNO DE PRUEBAS', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
  }
  await page.route('**/api/inventory', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"Consulta DEMO no disponible."}',
    }),
  );
  await page.goto('/inventario');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Consulta DEMO no disponible',
  );
  await page.unroute('**/api/inventory');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Inventario por lote' })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(
    page
      .getByRole('navigation', { name: 'Módulos' })
      .getByRole('link', { name: 'Inventario', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  expect(errors).toEqual([]);
});
