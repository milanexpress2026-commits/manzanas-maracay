import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { loginPage } from './helpers/auth';
test.beforeEach(async ({ page }) => {
  await loginPage(page);
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`catálogo a ${viewport.width}px: carga real, accesibilidad y captura`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    fs.mkdirSync('docs/capturas', { recursive: true });
    await page.setViewportSize(viewport);
    await page.goto('/catalogo');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { name: 'Catálogo de productos' })).toBeVisible();
    await expect(page.getByText('Catálogo actualizado')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Ver Manzana Gala calibre 80', exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (const tab of await page.getByRole('tab').all()) {
      const bounds = await tab.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    }
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
    ).toEqual([]);
    await page.screenshot({
      path: `docs/capturas/catalogo-${viewport.width === 1440 ? 'escritorio' : 'movil'}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test('crear fruta, variedad, calibre y empaque; editar y persistir al recargar', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/catalogo');
  await expect(page.getByText('Catálogo actualizado')).toBeVisible();
  const suffix = Date.now().toString().slice(-7),
    fruit = `Mango ${suffix}`,
    variety = `Kent ${suffix}`;
  await page.getByRole('tab', { name: /Frutas/ }).click();
  await page.getByRole('button', { name: 'Crear fruta', exact: true }).click();
  await page.getByLabel('Nombre de la fruta').fill(fruit);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('tabpanel', { name: 'Frutas', exact: true }).getByText(fruit, { exact: true }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Variedades/ }).click();
  await page.getByRole('button', { name: 'Crear variedad', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Fruta', { exact: false })
    .selectOption({ label: fruit });
  await page.getByLabel('Nombre de la variedad').fill(variety);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: /Calibres/ }).click();
  await page.getByRole('button', { name: 'Crear calibre', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Fruta', { exact: false })
    .selectOption({ label: fruit });
  await page.getByLabel('Nombre del calibre').fill('70/75');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: /Empaques/ }).click();
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Fruta', { exact: true })
    .selectOption({ label: fruit });
  await page
    .getByRole('dialog')
    .getByLabel('Variedad', { exact: true })
    .selectOption({ label: variety });
  await page
    .getByRole('dialog')
    .getByLabel('Calibre', { exact: true })
    .selectOption({ label: '70/75' });
  await page.getByRole('dialog').getByLabel('Presentación de la caja').selectOption('blister');
  await page.getByRole('dialog').getByLabel('Blíster por caja').fill('6');
  await page.getByText('Más opciones', { exact: true }).click();
  await page.getByLabel('Notas del empaque').fill('Prueba aislada; conteo de fruta pendiente.');
  await page.screenshot({ path: 'docs/capturas/formulario-movil.png' });
  await page.getByRole('button', { name: 'Revisar producto' }).click();
  await page.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Producto guardado', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Volver al catálogo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: `Editar ${variety} calibre 70/75` }).click();
  await expect(page.getByRole('dialog').getByLabel('Blíster por caja')).toHaveValue('6');
  await page.getByRole('dialog').getByLabel('Blíster por caja').fill('7');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.reload();
  await page.getByRole('button', { name: `Ver ${fruit} ${variety} calibre 70/75` }).click();
  await expect(page.getByLabel('7 blíster en una caja')).toBeVisible();
});
test('búsqueda vacía, limpiar filtros y navegación por teclado', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByText('Catálogo actualizado')).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar en el catálogo' }).fill('inexistente-xyz');
  await expect(page.getByText('No encontramos coincidencias')).toBeVisible();
  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(
    page.getByRole('button', { name: 'Ver Manzana Gala calibre 80', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeFocused();
});
test('error del servidor conserva el formulario y permite reintentar', async ({ page }) => {
  await page.goto('/catalogo');
  await expect(page.getByText('Catálogo actualizado')).toBeVisible();
  await page.getByRole('tab', { name: /Frutas/ }).click();
  await page.getByRole('button', { name: 'Crear fruta', exact: true }).click();
  await page.getByLabel('Nombre de la fruta').fill(`Piña ${Date.now()}`);
  await page.route('**/api/catalog/fruits', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Servidor de prueba no disponible.' }),
    }),
  );
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('alert')).toContainText('Servidor de prueba no disponible');
  await expect(page.getByLabel('Nombre de la fruta')).not.toHaveValue('');
  await page.unroute('**/api/catalog/fruits');
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('error de carga explícito y recuperación', async ({ page }) => {
  await page.route('**/api/catalog', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"message":"Servidor no disponible."}',
    }),
  );
  await page.goto('/catalogo');
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo actualizar' })).toContainText(
    'No se pudo actualizar',
  );
  await page.unroute('**/api/catalog');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText('Catálogo actualizado')).toBeVisible();
});
test('PWA: manifiesto, iconos y página sin conexión', async ({ page, context, request }) => {
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest.display).toBe('standalone');
  expect((await request.get('/icons/icon-192.png')).status()).toBe(200);
  await page.goto('/catalogo');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);
  await page.goto('/catalogo?offline-test=1');
  await expect(page.getByRole('heading', { name: 'Necesitas conexión' })).toBeVisible();
  const logo = page.getByRole('img', { name: 'Manzanas Maracay · Frutas importadas' });
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate(
        (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
      ),
    )
    .toBe(true);
  await context.setOffline(false);
});
