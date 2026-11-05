import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type { Catalog, ClientSummary, SaleDetail } from '../../packages/domain/src/index';
import { assertIsolatedProduction, assertNoDocumentOverflow, loginProduction } from './ui-helpers';

test.beforeEach(async ({}, testInfo) => assertIsolatedProduction(testInfo));

test('mantener sesión conserva el acceso 30 días y cerrar sesión revoca la cookie guardada', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(
    page.getByRole('checkbox', { name: 'Mantener sesión activa', exact: true }),
  ).not.toBeChecked();
  await expect(page.getByText(/Conserva el acceso durante 30 días/)).toBeVisible();
  await assertNoDocumentOverflow(page);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  await loginProduction(page, { rememberSession: true });
  const cookie = (await page.context().cookies()).find(
    (value) => value.name === '__Host-mm_session',
  );
  expect(!!cookie).toBe(true);
  expect(cookie?.secure).toBe(true);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(cookie?.path).toBe('/');
  const remaining = (cookie?.expires ?? 0) - Date.now() / 1000;
  expect(remaining).toBeGreaterThan(29 * 24 * 60 * 60);
  expect(remaining).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 60);

  // La cookie se conserva solo en memoria del ensayo; no se escribe en archivos ni logs.
  const savedState = await page.context().storageState();
  const reopened = await browser.newContext({
    baseURL: 'https://localhost:3143',
    ignoreHTTPSErrors: true,
    storageState: savedState,
  });
  try {
    const reopenedPage = await reopened.newPage();
    await reopenedPage.goto('/');
    await expect(reopenedPage).toHaveURL(/\/inicio$/);
    expect((await reopened.request.get('/api/auth/me')).status()).toBe(200);
    await reopenedPage.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
    await expect(reopenedPage).toHaveURL(/\/login$/);
    expect((await reopened.cookies()).some((value) => value.name === '__Host-mm_session')).toBe(
      false,
    );
  } finally {
    await reopened.close();
  }

  const revoked = await browser.newContext({
    baseURL: 'https://localhost:3143',
    ignoreHTTPSErrors: true,
    storageState: savedState,
  });
  try {
    expect((await revoked.request.get('/api/auth/me')).status()).toBe(401);
    const revokedPage = await revoked.newPage();
    await revokedPage.goto('/inicio');
    await expect(revokedPage).toHaveURL(/\/login$/);
  } finally {
    await revoked.close();
  }
});

test('operación por UI: proveedor, producto confirmado, recepción, precios, cliente, crédito y abono', async ({
  page,
}) => {
  test.setTimeout(240000);
  await loginProduction(page);
  const overview = await (await page.request.get('/api/operations/overview')).json();
  expect(overview.environment).toBe('production');
  expect(overview.ready).toBe(true);
  const suffix = randomUUID().slice(0, 8);
  const fruit = 'QA uva UI ' + suffix,
    supplier = 'QA proveedor UI ' + suffix,
    clientName = 'QA cliente UI ' + suffix;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/proveedores');
  await page.getByRole('button', { name: 'Nuevo proveedor', exact: true }).click();
  await page.getByLabel('Nombre del proveedor').fill(supplier);
  await page
    .getByLabel('Observaciones', { exact: true })
    .fill('Ensayo sintético aislado; no proveedor comercial real.');
  await page.getByRole('button', { name: 'Guardar proveedor', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Agregar producto', exact: true }).click();
  const productDialog = page.getByRole('dialog');
  if (!(await productDialog.getByLabel('Nombre de la fruta', { exact: true }).isVisible()))
    await productDialog.getByRole('button', { name: 'Crear fruta', exact: true }).click();
  await productDialog.getByLabel('Nombre de la fruta', { exact: true }).fill(fruit);
  await productDialog.getByRole('button', { name: 'Guardar fruta', exact: true }).click();
  await productDialog.getByLabel('Variedad', { exact: true }).selectOption('none');
  await productDialog.getByLabel('Calibre', { exact: true }).selectOption('none');
  await productDialog.getByRole('button', { name: 'Continuar al empaque' }).click();
  await productDialog.getByLabel('Presentación de la caja').selectOption('whole');
  await productDialog.getByRole('button', { name: 'Revisar producto' }).click();
  await productDialog.getByRole('button', { name: 'Guardar producto', exact: true }).click();
  await expect(
    productDialog.getByRole('heading', { name: 'Producto guardado', exact: true }),
  ).toBeVisible();
  await productDialog.getByRole('button', { name: 'Volver al catálogo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  let catalog = (await (await page.request.get('/api/catalog')).json()) as Catalog;
  const configuration = catalog.configurations.find((c) => c.fruit === fruit)!;
  expect(configuration.confirmationStatus).toBe('pending');
  await page.goto('/recepciones?producto=' + configuration.id);
  await expect(
    page.getByText('Este producto tiene el empaque pendiente.', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Fruta, variedad y calibre').getByRole('option', { name: fruit, exact: false }),
  ).toHaveCount(0);

  await page.goto('/catalogo');
  await page.getByRole('button', { name: 'Editar ' + fruit, exact: true }).click();
  await page
    .getByRole('checkbox', { name: 'Confirmo que este empaque y sus presentaciones son correctos' })
    .check();
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  catalog = (await (await page.request.get('/api/catalog')).json()) as Catalog;
  expect(catalog.configurations.find((c) => c.id === configuration.id)?.confirmationStatus).toBe(
    'confirmed',
  );

  await page.goto('/recepciones');
  await page.getByLabel('Proveedor', { exact: true }).selectOption({ label: supplier });
  await page.getByLabel('Referencia del documento').fill('QA ingreso UI ' + suffix);
  await page.getByLabel('Fruta, variedad y calibre').selectOption(configuration.id);
  await page.getByLabel('Cajas cerradas recibidas').fill('20');
  await page.getByLabel('Costo por caja (USD)').fill('25');
  await page.getByRole('radio', { name: 'Actualizar precios', exact: true }).check();
  await page.getByLabel('Promocional divisa', { exact: true }).fill('40');
  await page.getByLabel('Regular · Bs. BCV', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Revisar recepción', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar recepción', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mercancía recibida', exact: true }),
  ).toBeVisible();
  const inventory = await (await page.request.get('/api/inventory')).json();
  const lot = inventory.lots.find(
    (item: { configurationId: string; fruit: string }) => item.fruit === fruit,
  );
  expect(lot.isDemo).toBe(false);
  expect(lot.closedBoxes).toBe(20);

  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
  await page.getByLabel('Nombre del cliente').fill(clientName);
  await page.getByText('Más datos del cliente', { exact: true }).click();
  await page
    .getByLabel('Observaciones del cliente')
    .fill('Cliente sintético de QA, sin teléfono ni envío de mensajes.');
  await page.getByRole('button', { name: 'Guardar cliente', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const clients = (await (await page.request.get('/api/clients')).json()) as ClientSummary[];
  const client = clients.find((c) => c.name === clientName)!;
  expect(client.isDemo).toBe(false);

  await page.goto('/ventas/nueva');
  await page.getByLabel('Cliente', { exact: true }).selectOption(client.id);
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await page.getByRole('button', { name: '7 días', exact: true }).click();
  await expect(page.getByLabel('Fecha acordada (opcional)', { exact: true })).not.toHaveValue('');
  await page.getByLabel('Producto', { exact: true }).selectOption(configuration.id);
  const presentation = page.getByLabel('Presentación', { exact: true });
  await expect(presentation).toHaveValue('box');
  await expect(presentation).toBeDisabled();
  await expect(presentation.getByRole('option')).toHaveText(['Selecciona', 'Caja']);
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByLabel('Precio acordado', { exact: true }).selectOption('usd_cash_promo');
  await expect(page.getByLabel('Total de la venta', { exact: true })).toHaveText('USD 80,00');
  await page.getByLabel('Abono hoy (opcional) · USD', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+$/);
  const saleId = page.url().split('/').at(-1)!;
  let sale = (await (await page.request.get('/api/sales/' + saleId)).json()) as SaleDetail;
  expect(sale.isDemo).toBe(false);
  expect(sale.totalUsd).toBe('80.00');
  expect(Number(sale.costUsd)).toBe(50);
  expect(sale.balanceUsd).toBe('80.00');
  expect(sale.payments).toEqual([]);
  await expect(page.getByRole('button', { name: 'Cobrar por WhatsApp' })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await page.getByLabel('Monto recibido · USD', { exact: true }).fill('30');
  await expect(page.getByRole('option', { name: 'Bolívares · tasa del acuerdo' })).toBeDisabled();
  await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  sale = (await (await page.request.get('/api/sales/' + saleId)).json()) as SaleDetail;
  expect(sale.balanceUsd).toBe('50.00');
  expect(sale.payments).toHaveLength(1);
  for (const path of [
    '/api/sales/' + saleId + '/document',
    '/api/payments/' + sale.payments[0].id + '/document',
  ]) {
    const pdf = await page.request.get(path);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
  await assertNoDocumentOverflow(page);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual(
    [],
  );
  fs.mkdirSync('docs/capturas/fase4', { recursive: true });
  await page.screenshot({ path: 'docs/capturas/fase4/venta-qa-390.png', fullPage: true });
  await page.goto('/inicio');
  await expect(page.getByRole('heading', { name: 'Continúa con tu negocio' })).toBeVisible();
  await expect(page.locator('.operation-checklist li[data-complete="true"]')).toHaveCount(7);
  await expect(page.locator('.operation-overview')).toContainText('USD 50,00');
  await expect(page.locator('body')).not.toContainText(/DEMO|ENTORNO DE PRUEBAS|Vista previa/);
  await page.screenshot({ path: 'docs/capturas/fase4/inicio-qa-390.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('error del resumen no se convierte en inventario vacío ni saldo cero', async ({ page }) => {
  await loginProduction(page);
  await page.route('**/api/operations/overview', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'Consulta temporalmente no disponible en el ensayo.' }),
    }),
  );
  await page.goto('/inicio');
  await expect(page.getByRole('main').getByRole('alert')).toContainText(
    'Consulta temporalmente no disponible',
  );
  await expect(page.locator('.operation-overview')).toHaveCount(0);
  await expect(page.getByText('El inventario comienza vacío')).toHaveCount(0);
  await page.unroute('**/api/operations/overview');
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.operation-overview')).toBeVisible();
});

test('cambio de clave push requiere consentimiento y no reutiliza la suscripción anterior', async ({
  page,
}) => {
  await loginProduction(page);
  const publicKey = Buffer.alloc(65, 2).toString('base64url');
  await page.addInitScript(() => {
    const counters = { unsubscribe: 0, subscribe: 0, permission: 0 };
    Object.defineProperty(window, 'qaPushCounters', { value: counters });
    function subscription(keyByte: number) {
      return {
        endpoint: 'https://fcm.googleapis.com/fcm/send/qa-isolated-' + keyByte,
        options: { applicationServerKey: new Uint8Array(65).fill(keyByte).buffer },
        unsubscribe: async () => {
          counters.unsubscribe++;
          current = null;
          return true;
        },
        toJSON: () => ({
          endpoint: 'https://fcm.googleapis.com/fcm/send/qa-isolated-' + keyByte,
          expirationTime: null,
          keys: { p256dh: 'qa-simulated-public-key', auth: 'qa-simulated-auth' },
        }),
      };
    }
    let current: ReturnType<typeof subscription> | null = subscription(1);
    const registration = {
      pushManager: {
        getSubscription: async () => current,
        subscribe: async () => {
          counters.subscribe++;
          current = subscription(2);
          return current;
        },
      },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register: async () => registration, ready: Promise.resolve(registration) },
    });
    Object.defineProperty(window, 'PushManager', { configurable: true, value: class {} });
    Object.defineProperty(window, 'Notification', {
      configurable: true,
      value: {
        requestPermission: async () => {
          counters.permission++;
          return 'granted';
        },
      },
    });
  });
  await page.route('**/api/push/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        subscribed: false,
        publicKey,
        deviceLabel: null,
        endpointHash: null,
      }),
    }),
  );
  let registered = 0;
  await page.route('**/api/push/subscribe', (route) => {
    registered++;
    expect(route.request().postDataJSON().subscription.endpoint).toContain('qa-isolated-2');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.goto('/cobranza');
  const counters = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            qaPushCounters: { unsubscribe: number; subscribe: number; permission: number };
          }
        ).qaPushCounters,
    );
  await expect(
    page.getByRole('button', { name: 'Activar en esta tablet', exact: true }),
  ).toBeEnabled();
  expect(await counters()).toEqual({ unsubscribe: 0, subscribe: 0, permission: 0 });
  await page.getByRole('button', { name: 'Activar en esta tablet', exact: true }).click();
  await expect(
    page.getByRole('dialog', { name: 'Actualizar avisos en esta tablet' }),
  ).toBeVisible();
  expect((await counters()).unsubscribe).toBe(0);
  expect((await counters()).subscribe).toBe(0);
  expect(registered).toBe(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect((await counters()).unsubscribe).toBe(0);
  await page.getByRole('button', { name: 'Activar en esta tablet', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Actualizar y activar', exact: true })
    .click();
  await expect(page.getByText('Esta tablet quedó suscrita.', { exact: false })).toBeVisible();
  expect((await counters()).unsubscribe).toBe(1);
  expect((await counters()).subscribe).toBe(1);
  expect(registered).toBe(1);
  // Browser APIs and transport were simulated; no notification was delivered or sent.
});
