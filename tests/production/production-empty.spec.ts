import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { assertIsolatedProduction, assertNoDocumentOverflow, loginProduction } from './ui-helpers';

test.beforeEach(async ({}, testInfo) => assertIsolatedProduction(testInfo));

test('producción sin activar: acceso privado y todo el recorrido demo cerrado', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByText('Acceso privado de los propietarios.', { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: /demostración/i })).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('ENTORNO DE PRUEBAS');
  for (const path of [
    '/demo',
    '/demo/catalogo',
    '/demo/inventario',
    '/demo/recepciones',
    '/demo/ventas',
    '/demo/cobranza',
    '/demo/inexistente',
    '/demo/catalogo/otra-ruta',
  ]) {
    for (const headers of [{}, { RSC: '1', 'Next-Router-Prefetch': '1' }]) {
      const response = await request.get(path + '?environment=staging', { headers });
      expect(response.status(), path).toBe(404);
      expect(response.headers()['cache-control']).toBe('no-store');
      expect(await response.text()).not.toContain('Bodega de ejemplo');
    }
  }
  for (const path of [
    'catalog',
    'inventory',
    'suppliers',
    'clients',
    'sales',
    'payments',
    'collections',
    'operations/overview',
    'rates/current',
    'push/status',
  ])
    expect((await request.get('/api/' + path)).status(), path).toBe(401);
  const headers = { Origin: 'https://localhost:3143', 'Idempotency-Key': randomUUID() };
  expect((await request.post('/api/receipts', { headers, data: {} })).status()).toBe(401);
  expect(
    (await request.patch('/api/clients/' + randomUUID(), { headers, data: {} })).status(),
  ).toBe(401);
  expect((await request.delete('/api/sales/' + randomUUID(), { headers })).status()).toBe(403);
  for (const invalidOrigin of [
    'http://localhost:3143',
    'https://otro.example',
    'https://localhost:3143.evil.example',
  ]) {
    expect(
      (
        await request.post('/api/auth/login', {
          headers: { Origin: invalidOrigin },
          data: { username: 'qa-propietarios', password: 'not-a-secret-fixture' },
        })
      ).status(),
    ).toBe(403);
  }
});

test('base nueva vacía, preparación privada y accesible en cuatro anchos', async ({ page }) => {
  test.setTimeout(150000);
  await loginProduction(page);
  const session = await (await page.request.get('/api/auth/me')).json();
  expect(session.environment).toBe('production');
  expect(session.operationsReady).toBe(false);
  const cookie = (await page.context().cookies()).find(
    (value) => value.name === '__Host-mm_session',
  );
  expect(!!cookie).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.path).toBe('/');
  const overview = await (await page.request.get('/api/operations/overview')).json();
  expect(overview.environment).toBe('production');
  expect(overview.ready).toBe(false);
  expect(Object.values(overview.counts)).toEqual(Array(8).fill(0));
  expect(overview.inventory.sealedBoxes).toBe(0);
  expect(overview.receivablesUsd).toBe('0.00');
  const catalog = await (await page.request.get('/api/catalog')).json();
  expect(catalog).toMatchObject({ fruits: [], varieties: [], calibers: [], configurations: [] });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  fs.mkdirSync('docs/capturas/fase4', { recursive: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [390, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: 'Prepara tu primera operación' })).toBeVisible();
    await expect(page.getByText('Operación en preparación', { exact: true })).toBeVisible();
    await expect(page.getByText('El inventario comienza vacío', { exact: true })).toBeVisible();
    await expect(page.locator('.operation-checklist li')).toHaveCount(7);
    await expect(page.locator('body')).not.toContainText(/DEMO|ENTORNO DE PRUEBAS|Vista previa/);
    await expect(page.getByRole('button', { name: 'Actualizar resumen' })).toBeDisabled();
    await assertNoDocumentOverflow(page);
    if (width === 390 || width === 1440) {
      const audit = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
      ).toEqual([]);
    }
    await page.screenshot({
      path: `docs/capturas/fase4/preparacion-vacia-${width}.png`,
      fullPage: true,
    });
  }
  await page.goto('/proveedores');
  await expect(page.getByRole('button', { name: 'Nuevo proveedor', exact: true })).toBeDisabled();
  const blocked = await page.request.post('/api/suppliers', {
    headers: { Origin: 'https://localhost:3143', 'Idempotency-Key': randomUUID() },
    data: { name: 'QA no debe registrarse' },
  });
  expect(blocked.status()).toBe(503);
  expect(await (await page.request.get('/api/suppliers')).json()).toEqual([]);
  const manifest = await (await page.request.get('/manifest.webmanifest')).json();
  expect(manifest.start_url).toBe('/');
  expect(manifest.description).not.toMatch(/demo|prueba|catálogo de frutas importadas/i);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await page.request.get('/api/operations/overview')).status()).toBe(401);
  expect(errors).toEqual([]);
});
