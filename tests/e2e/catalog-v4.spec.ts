import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { getCatalogPreparationDefaults, type Catalog } from '@mm/domain';
import { loginPage } from './helpers/auth';

test('preparación revisable en catálogo parcial: editar, excluir, revisar y reintentar sin duplicar', async ({
  page,
}) => {
  await loginPage(page);
  await page.goto('/catalogo');
  const before: Catalog = await (await page.request.get('/api/catalog')).json();
  expect(before.fruits.length).toBeGreaterThan(0);
  const name = `Mandarina QA revisión ${randomUUID().slice(0, 8)}`;
  await page.getByText('Preparar y editar maestros', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Preparar catálogo de Manzanas Maracay', exact: true })
    .click();
  const panel = page.getByRole('region', { name: 'Preparación del catálogo' });
  for (const fruit of getCatalogPreparationDefaults()
    .fruits.map((row) => row.name)
    .filter((name) => name !== 'Mandarina'))
    await panel.getByRole('checkbox', { name: `Incluir ${fruit}`, exact: true }).uncheck();
  await panel
    .getByRole('group', { name: 'Incluir Mandarina', exact: true })
    .getByLabel('Nombre de la fruta', { exact: true })
    .fill(name);
  await panel.getByRole('button', { name: 'Revisar catálogo seleccionado' }).click();
  await expect(panel.getByRole('heading', { name: 'Revisa lo que se guardará' })).toBeVisible();
  await expect(panel).toContainText(name);
  await expect(panel).toContainText('0 productos concretos');
  expect(await (await page.request.get('/api/catalog')).json()).toEqual(before);
  const confirm = panel.getByRole('button', { name: 'Confirmar y preparar catálogo' });
  await expect(confirm).toBeDisabled();
  await panel.getByRole('checkbox', { name: /Confirmo los nombres y borradores/ }).check();
  const keys: string[] = [];
  let calls = 0;
  await page.route('**/api/catalog/preparation', async (route) => {
    keys.push(route.request().headers()['idempotency-key']);
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    calls++;
    if (calls === 1)
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Respuesta perdida después del commit de QA; reintenta.' }),
      });
    else await route.fulfill({ response });
  });
  await confirm.click();
  await expect(panel.getByRole('alert')).toContainText('Respuesta perdida');
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(panel.getByRole('heading', { name: 'Catálogo preparado' })).toBeVisible();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
  const after: Catalog = await (await page.request.get('/api/catalog')).json();
  expect(after.fruits.filter((row) => row.name === name)).toHaveLength(1);
  expect(after.configurations).toEqual(before.configurations);
  expect(after.varieties).toEqual(before.varieties);
  expect(after.calibers).toEqual(before.calibers);
});

test('plantillas activan solo calibres elegidos, conservan selección y aceptan excepcionales sin inferir blíster', async ({
  page,
}) => {
  test.setTimeout(150000);
  await loginPage(page);
  const prepared = await page.request.post('/api/catalog/preparation', {
    headers: { Origin: 'http://127.0.0.1:3200', 'Idempotency-Key': randomUUID() },
    data: { ...getCatalogPreparationDefaults(), confirmed: true },
  });
  expect(prepared.status()).toBe(201);
  const before = await (await page.request.get('/api/operations/overview')).json();
  const beforeCatalog: Catalog = await (await page.request.get('/api/catalog')).json();
  await page.goto('/catalogo');
  await page.getByText('Preparar y editar maestros', { exact: true }).click();
  const panel = page.getByRole('region', { name: 'Plantillas de productos habituales' });
  await panel.getByLabel('Plantilla de empaque').selectOption('apple_traditional');
  await panel.getByLabel('Variedad', { exact: true }).selectOption({ label: 'Gala' });
  for (const caliber of ['100', '113'])
    await panel.getByRole('checkbox', { name: caliber, exact: true }).check();
  const batchRequest = page.waitForRequest(
    (request) =>
      request.method() === 'POST' && request.url().endsWith('/api/catalog/configurations/batch'),
  );
  await panel.getByRole('button', { name: 'Agregar productos seleccionados' }).click();
  const sent = (await batchRequest).postDataJSON() as {
    configurations: { caliberId: string }[];
  };
  expect(
    sent.configurations
      .map((row) => beforeCatalog.calibers.find((caliber) => caliber.id === row.caliberId)?.label)
      .sort(),
  ).toEqual(['100', '113']);
  await expect(panel.getByRole('status')).toContainText('Productos disponibles');
  const catalog: Catalog = await (await page.request.get('/api/catalog')).json();
  const gala = catalog.configurations.filter(
    (row) =>
      row.fruit === 'Manzana' && row.variety === 'Gala' && row.commercialLine === 'Tradicional',
  );
  for (const caliber of ['100', '113'])
    expect(gala.filter((row) => row.caliber === caliber)).toHaveLength(1);
  const added = catalog.configurations.filter(
    (row) => !beforeCatalog.configurations.some((previous) => previous.id === row.id),
  );
  const missingBefore = ['100', '113'].filter(
    (caliber) =>
      !beforeCatalog.configurations.some(
        (row) =>
          row.fruit === 'Manzana' &&
          row.variety === 'Gala' &&
          row.commercialLine === 'Tradicional' &&
          row.caliber === caliber,
      ),
  );
  expect(added.map((row) => row.caliber).sort()).toEqual(missingBefore);
  expect(
    added.every((row) => row.confirmationStatus === 'pending' && row.blistersPerBox === null),
  ).toBe(true);
  for (const previous of beforeCatalog.configurations)
    expect(catalog.configurations.find((row) => row.id === previous.id)).toEqual(previous);
  await panel.getByLabel('Variedad', { exact: true }).selectOption({ label: 'Amarilla' });
  await expect(panel.getByRole('checkbox', { name: '100', exact: true })).toBeChecked();
  await expect(panel.getByRole('checkbox', { name: '113', exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Agregar productos seleccionados' }).click();
  await expect(panel.getByRole('status')).toContainText('Amarilla');
  await panel.getByText('+ Calibre no habitual', { exact: true }).click();
  await panel.getByLabel('Nuevo calibre', { exact: true }).fill('90');
  await panel.getByRole('button', { name: 'Guardar y seleccionar calibre' }).click();
  await expect(panel.getByRole('checkbox', { name: '90', exact: true })).toBeChecked();
  const afterRare: Catalog = await (await page.request.get('/api/catalog')).json();
  const apple = afterRare.fruits.find((row) => row.name === 'Manzana')!;
  expect(
    afterRare.calibers.filter((row) => row.fruitId === apple.id && row.label === '90'),
  ).toHaveLength(1);
  await panel.getByLabel('Variedad', { exact: true }).selectOption({ label: 'Gala' });
  await panel.getByRole('button', { name: 'Agregar productos seleccionados' }).click();
  await expect(panel.getByRole('status')).toContainText('90');
  const withRare: Catalog = await (await page.request.get('/api/catalog')).json();
  expect(
    withRare.configurations.find(
      (row) =>
        row.fruitId === apple.id &&
        row.variety === 'Gala' &&
        row.caliber === '90' &&
        row.commercialLine === 'Tradicional',
    ),
  ).toMatchObject({ confirmationStatus: 'pending', blistersPerBox: null });
  await panel.getByLabel('Plantilla de empaque').selectOption('apple_bulk');
  await panel.getByText('+ Calibre no habitual', { exact: true }).click();
  await panel.getByLabel('Nuevo calibre', { exact: true }).fill('216');
  await panel.getByRole('button', { name: 'Guardar y seleccionar calibre' }).click();
  await expect(panel.getByRole('checkbox', { name: '216', exact: true })).toBeChecked();
  await panel.getByRole('button', { name: 'Agregar productos seleccionados' }).click();
  await expect(panel.getByRole('status')).toContainText('216');
  const bulk: Catalog = await (await page.request.get('/api/catalog')).json();
  expect(
    bulk.configurations.find(
      (row) => row.fruitId === apple.id && row.commercialLine === 'Granel' && row.caliber === '216',
    ),
  ).toMatchObject({
    packingModel: 'halves',
    blistersPerBox: null,
    halfPreparation: 'commercial',
    allowedPresentations: ['box', 'half_box'],
  });
  expect(
    bulk.calibers.filter((row) => row.fruitId === apple.id && row.label === '216'),
  ).toHaveLength(1);
  const after = await (await page.request.get('/api/operations/overview')).json();
  expect(after.inventory).toEqual(before.inventory);
  fs.mkdirSync('docs/capturas/catalogo-v4', { recursive: true });
  for (const width of [390, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await panel.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((issue) => ({
        id: issue.id,
        nodes: issue.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
    await page.screenshot({
      path: `docs/capturas/catalogo-v4/plantillas-${width}.png`,
      fullPage: false,
    });
  }
});
