import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Catalog } from '@mm/domain';
import { loginPage, loginRequest } from './helpers/auth';

const headers = (key = randomUUID()) => ({
  Origin: 'http://127.0.0.1:3200',
  'Idempotency-Key': key,
});
const captures = 'docs/capturas/ux-v3';
test('lectura del catálogo recupera un 503, limita fallos persistentes y permite Reintentar', async ({
  page,
}) => {
  await loginPage(page);
  let requests = 0;
  await page.route('**/api/catalog', async (route) => {
    requests++;
    if (requests === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Conexión temporalmente ocupada en QA.' }),
      });
    else await route.continue();
  });
  await page.goto('/catalogo');
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeEnabled();
  expect(requests).toBe(2);
  await page.unroute('**/api/catalog');
  requests = 0;
  await page.route('**/api/catalog', async (route) => {
    requests++;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Conexión de QA aún no disponible.' }),
    });
  });
  await page.reload();
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Conexión de QA aún no disponible.',
  );
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeDisabled();
  expect(requests).toBe(2);
  await page.unroute('**/api/catalog');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeEnabled();
  await expect(page.getByRole('main').getByRole('alert')).toHaveCount(0);
});
test('calibres por lote: simultaneidad, reintento, reutilización por fruta y rechazo atómico', async ({
  request,
}) => {
  await loginRequest(request);
  const fruitResponse = await request.post('/api/catalog/fruits', {
    headers: headers(),
    data: { name: `Calibres UX ${randomUUID().slice(0, 8)}` },
  });
  expect(fruitResponse.status()).toBe(201);
  const fruit = await fruitResponse.json();
  const key = randomUUID();
  const data = { fruitId: fruit.id, labels: ['100', '110', '120'] };
  const concurrent = await Promise.all(
    [1, 2].map(() => request.post('/api/catalog/calibers/batch', { headers: headers(key), data })),
  );
  expect(concurrent.map((response) => response.status())).toEqual([201, 201]);
  const first = await concurrent[0].json();
  expect(await concurrent[1].json()).toEqual(first);
  expect(first.createdCount).toBe(3);
  expect(first.reusedCount).toBe(0);
  expect(first.calibers).toHaveLength(3);
  const repeat = await request.post('/api/catalog/calibers/batch', {
    headers: headers(),
    data: { fruitId: fruit.id, labels: ['100', '110', '135'] },
  });
  expect(repeat.status()).toBe(201);
  const reused = await repeat.json();
  expect(reused.createdCount).toBe(1);
  expect(reused.reusedCount).toBe(2);
  expect(reused.calibers.find((row: { label: string }) => row.label === '100').id).toBe(
    first.calibers.find((row: { label: string }) => row.label === '100').id,
  );
  expect(
    (
      await request.post('/api/catalog/calibers/batch', {
        headers: headers(key),
        data: { fruitId: fruit.id, labels: ['150'] },
      })
    ).status(),
  ).toBe(409);
  expect(
    (
      await request.post('/api/catalog/calibers/batch', {
        headers: headers(),
        data: { fruitId: fruit.id, labels: ['150', ''] },
      })
    ).status(),
  ).toBe(400);
  const otherResponse = await request.post('/api/catalog/fruits', {
    headers: headers(),
    data: { name: `Otra fruta UX ${randomUUID().slice(0, 8)}` },
  });
  const other = await otherResponse.json();
  const otherBatch = await request.post('/api/catalog/calibers/batch', {
    headers: headers(),
    data: { fruitId: other.id, labels: ['100'] },
  });
  expect(otherBatch.status()).toBe(201);
  expect((await otherBatch.json()).calibers[0].id).not.toBe(first.calibers[0].id);
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  expect(
    catalog.calibers
      .filter((row) => row.fruitId === fruit.id)
      .map((row) => row.label)
      .sort(),
  ).toEqual(['100', '110', '120', '135']);
  expect(catalog.configurations.some((row) => row.fruitId === fruit.id)).toBe(false);
});

async function beginProduct(
  page: Page,
  fruit: string,
  variety: string,
  caliber: string,
  family: string,
) {
  await page.goto('/catalogo?returnTo=/ventas/nueva');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Crear fruta', exact: true }).click();
  await dialog.getByLabel('Nombre de la fruta', { exact: true }).fill(fruit);
  await dialog.getByRole('button', { name: 'Guardar fruta', exact: true }).click();
  await expect(dialog.getByLabel('Fruta', { exact: true })).not.toHaveValue('');
  await dialog.getByRole('button', { name: 'Crear variedad', exact: true }).click();
  await dialog.getByLabel('Nombre de la variedad', { exact: true }).fill(variety);
  await dialog.getByRole('button', { name: 'Guardar variedad', exact: true }).click();
  await dialog.getByLabel('Tipo de producto', { exact: true }).selectOption(family);
  await dialog.getByRole('button', { name: 'Crear calibre', exact: true }).click();
  await dialog.getByLabel('Nuevo calibre', { exact: true }).fill(caliber);
  await dialog.getByRole('button', { name: 'Guardar calibre', exact: true }).click();
  await expect(dialog.getByLabel('Calibre', { exact: true }).locator('option:checked')).toHaveText(
    caliber,
  );
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await dialog.getByRole('button', { name: 'Continuar al empaque' }).click();
  return dialog;
}

test('alta contextual de dos frutas, tres pasos, reintento estable y recepción preseleccionada', async ({
  page,
}) => {
  await loginPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const suffix = randomUUID().slice(0, 8);
  const fruit = `Manzana UX ${suffix}`;
  const dialog = await beginProduct(page, fruit, 'Gala', '100', 'apple');
  await dialog.getByLabel('Presentación de la caja').selectOption('blister');
  await expect(dialog.getByLabel('Blíster por caja')).toHaveValue('');
  await dialog.getByLabel('Blíster por caja').fill('5');
  await dialog.getByLabel('Confirmo que este empaque y sus presentaciones son correctos.').check();
  await dialog.getByRole('button', { name: 'Revisar producto' }).click();
  await expect(dialog).toContainText('Gala · Calibre 100');
  const keys: string[] = [];
  let fail = true;
  await page.route('**/api/catalog/configurations', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    if (fail) {
      fail = false;
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Interrupción de prueba: reintenta.' }),
      });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Interrupción de prueba');
  await expect(dialog).toContainText('Gala · Calibre 100');
  await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Producto guardado', exact: true }),
  ).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  await page.unroute('**/api/catalog/configurations');
  const catalog: Catalog = await (await page.request.get('/api/catalog')).json();
  const created = catalog.configurations.filter((row) => row.fruit === fruit);
  expect(created).toHaveLength(1);
  expect(created[0]).toMatchObject({
    variety: 'Gala',
    caliber: '100',
    blistersPerBox: 5,
    confirmationStatus: 'confirmed',
  });
  await dialog.getByRole('link', { name: 'Registrar entrada de mercancía' }).click();
  await expect(page).toHaveURL(new RegExp(`producto=${created[0].id}`));
  const receivedProduct = page.getByRole('region', { name: 'Producto 1', exact: true });
  await expect(receivedProduct.getByRole('heading')).toContainText(fruit);
  await expect(receivedProduct.getByLabel('Costo real por caja · USD')).toHaveValue('');
  await expect(page.getByRole('link', { name: 'Volver a la venta guardada' })).toHaveAttribute(
    'href',
    '/ventas/nueva',
  );
  const pearDialog = await beginProduct(page, `Pera UX ${suffix}`, 'Forelle', '110', 'pear');
  await pearDialog.getByLabel('Presentación de la caja').selectOption('blister');
  await expect(pearDialog.getByLabel('Blíster por caja')).toHaveValue('');
  await pearDialog.getByRole('button', { name: 'Revisar producto' }).click();
  await expect(pearDialog).toContainText('Pendiente de confirmar');
  await pearDialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(
    pearDialog.getByRole('heading', { name: 'Producto guardado', exact: true }),
  ).toBeVisible();
  const updated: Catalog = await (await page.request.get('/api/catalog')).json();
  const pear = updated.configurations.find((row) => row.fruit === `Pera UX ${suffix}`);
  expect(pear).toMatchObject({
    variety: 'Forelle',
    caliber: '110',
    blistersPerBox: null,
    confirmationStatus: 'pending',
  });
});

test('sugerencias separadas por familia y alta sin desplazamiento horizontal en cinco tamaños', async ({
  page,
}) => {
  test.setTimeout(150000);
  await loginPage(page);
  fs.mkdirSync(captures, { recursive: true });
  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Fruta', { exact: true }).selectOption({ label: 'Manzana' });
  await dialog.getByLabel('Variedad', { exact: true }).selectOption({ label: 'Gala' });
  for (const [family, expected] of [
    ['apple', ['80', '88', '100', '113', '125', '135', '150', '163', '175', '198', '216']],
    ['bulk', ['150', '163', '175', '198', '216', '232']],
    ['pear', ['70', '80', '90', '100', '110', '120', '135']],
  ] as const) {
    await dialog.getByLabel('Tipo de producto', { exact: true }).selectOption(family);
    await dialog.locator('summary').filter({ hasText: 'Calibres habituales' }).click();
    await expect(dialog.locator('details input[type="checkbox"]')).toHaveCount(expected.length);
    for (const label of expected)
      await expect(dialog.getByRole('checkbox', { name: label, exact: true })).toBeChecked();
  }
  for (const width of [390, 800, 1024, 1366, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(
      true,
    );
    await expect(dialog.getByRole('button', { name: 'Continuar al empaque' })).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    // Capture the visible modal, not the entire growing catalog behind its overlay.
    await page.screenshot({ path: `${captures}/catalogo-alta-${width}.png` });
  }
});

test('vídeo QA del alta y llegada a recepción con el producto elegido', async ({ browser }) => {
  test.setTimeout(60000);
  fs.mkdirSync(captures, { recursive: true });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3200',
    viewport: { width: 800, height: 1024 },
    recordVideo: { dir: '.local/ux-v3/videos', size: { width: 800, height: 1024 } },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    await loginPage(page);
    const dialog = await beginProduct(
      page,
      `Fruta vídeo QA ${randomUUID().slice(0, 8)}`,
      'Variedad QA',
      '100',
      'other',
    );
    await dialog.getByLabel('Presentación de la caja').selectOption('whole');
    await dialog
      .getByLabel('Confirmo que este empaque y sus presentaciones son correctos.')
      .check();
    await dialog.getByRole('button', { name: 'Revisar producto' }).click();
    await dialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
    await dialog.getByRole('link', { name: 'Registrar entrada de mercancía' }).click();
    await expect(
      page.getByRole('region', { name: 'Producto 1', exact: true }).getByRole('heading'),
    ).toContainText('Fruta vídeo QA');
    await expect(
      page
        .getByRole('region', { name: 'Producto 1', exact: true })
        .getByLabel('Costo real por caja · USD'),
    ).toHaveValue('');
    await expect(page.getByRole('heading', { name: 'Recepción rápida' })).toBeVisible();
  } finally {
    await context.close();
  }
  await video?.saveAs(`${captures}/alta-producto-qa.webm`);
});
