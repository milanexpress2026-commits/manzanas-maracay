import { expect, test, type Page, type Locator } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PDFDocument } from 'pdf-lib';
import fs from 'node:fs';
import type { SaleDetail } from '../../packages/domain/src/index';
import { loginPage, testCredentials } from './helpers/auth';
import { commercePost, commercialCustomer } from './helpers/commerce';
import { manualSaleInput, receiveUnknown, unpricedProduct } from './helpers/operation-v45';
import { chooseSaleClient } from './helpers/sale-client';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

const artifactDirectory = 'docs/capturas/impresion-v4-7';

async function confirmedSale(page: Page, throughForm = false) {
  await loginPage(page);
  const rule = await unpricedProduct(page.request);
  const client = await commercialCustomer(page.request);
  const receipt = await receiveUnknown(page.request, rule, 2);
  let sale: SaleDetail;
  if (throughForm) {
    await page.goto('/ventas/nueva');
    await chooseSaleClient(page, client);
    await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
    await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
    await page.getByRole('button', { name: 'Revisar y cobrar', exact: true }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await expect(page).toHaveURL(/\/ventas\/[a-f0-9-]+\?guardada=1$/);
    sale = await (
      await page.request.get('/api/sales/' + new URL(page.url()).pathname.split('/').at(-1)!)
    ).json();
  } else {
    const input = manualSaleInput(client, rule, 1);
    sale = await commercePost<SaleDetail>(page.request, '/api/sales', {
      ...input,
      condition: 'cash',
      initialPayment: {
        currency: 'USD',
        amount: '40',
        method: 'usd_cash',
        receivedAt: input.soldAt,
      },
    });
    await page.goto(`/ventas/${sale.id}?guardada=1`);
  }
  await expect(page.getByRole('heading', { name: sale.number, exact: true })).toBeVisible();
  await expect(page.locator('.saved-notice').filter({ hasText: 'Venta guardada' })).toContainText(
    sale.number,
  );
  expect(sale).toMatchObject({ totalUsd: '40.00', balanceUsd: '0.00', status: 'confirmed' });
  const lotId = receipt.lots[0]!.id;
  const stock = await (await page.request.get('/api/inventory/lots/' + lotId)).json();
  return { sale, lotId, stock };
}

function observeCommercialWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.startsWith('/api/') &&
      !path.startsWith('/api/auth/') &&
      !['GET', 'HEAD'].includes(request.method())
    )
      writes.push(`${request.method()} ${path}`);
  });
  return writes;
}

async function assertUnchanged(
  page: Page,
  fixture: Awaited<ReturnType<typeof confirmedSale>>,
  writes: string[],
) {
  expect(writes).toEqual([]);
  expect(await (await page.request.get('/api/sales/' + fixture.sale.id)).json()).toEqual(
    fixture.sale,
  );
  expect(await (await page.request.get('/api/inventory/lots/' + fixture.lotId)).json()).toEqual(
    fixture.stock,
  );
}

async function downloadPdf(page: Page, action: Locator) {
  const downloadPromise = page.waitForEvent('download');
  await action.click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.pdf$/);
  const bytes = fs.readFileSync((await download.path())!);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  return PDFDocument.load(bytes);
}

for (const width of [390, 800, 1024, 1440]) {
  test(`V4.7 confirmación y documentos ${width}px: Carta, lectura y accesibilidad`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const fixture = await confirmedSale(page, width === 390);
    const writes = observeCommercialWrites(page);
    const documents = page.getByRole('region', { name: 'Documentos de la venta', exact: true });
    await expect(
      documents.getByRole('button', { name: 'Imprimir nota', exact: true }),
    ).toBeVisible();
    await expect(documents.getByRole('link', { name: 'Nueva venta', exact: true })).toHaveAttribute(
      'href',
      '/ventas/nueva',
    );
    await expect(
      documents.getByRole('link', { name: 'Ver nota de entrega', exact: true }),
    ).toHaveAttribute('href', `/api/sales/${fixture.sale.id}/delivery-note?size=letter`);
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    const print = documents.getByRole('button', { name: 'Imprimir nota', exact: true });
    await print.focus();
    await expect(print).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(documents.getByRole('link', { name: 'Nueva venta', exact: true })).toBeFocused();
    const pdf = await downloadPdf(
      page,
      documents.getByRole('link', { name: 'Descargar nota', exact: true }),
    );
    expect(pdf.getPages()).toHaveLength(1);
    expect(pdf.getPage(0).getWidth()).toBeCloseTo(612, 1);
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(792, 1);
    if (width === 1440) {
      await documents.getByText('Comprobante y tamaño de papel', { exact: true }).click();
      await documents.getByLabel('Tamaño de la nota', { exact: true }).selectOption('a4');
      const a4 = await downloadPdf(
        page,
        documents.getByRole('link', { name: 'Descargar nota', exact: true }),
      );
      expect(a4.getPage(0).getWidth()).toBeCloseTo(595.28, 1);
      expect(a4.getPage(0).getHeight()).toBeCloseTo(841.89, 1);
      await downloadPdf(
        page,
        documents.getByRole('link', { name: 'Descargar comprobante de venta', exact: true }),
      );
    }
    await assertUnchanged(page, fixture, writes);
    fs.mkdirSync(artifactDirectory, { recursive: true });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `${artifactDirectory}/confirmacion-${width}.png`,
      fullPage: true,
    });
  });
}

test('V4.7 ventana de impresión por gesto y alternativa si el navegador bloquea el popup', async ({
  browser,
}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:3200',
    viewport: { width: 800, height: 1000 },
    recordVideo: { dir: '.local/v47/printing-video', size: { width: 800, height: 1000 } },
  });
  const page = await context.newPage();
  const video = page.video();
  try {
    const fixture = await confirmedSale(page);
    const writes = observeCommercialWrites(page);
    const documents = page.getByRole('region', { name: 'Documentos de la venta', exact: true });
    await page.evaluate(() => {
      window.print = () => {
        throw new Error('La aplicación no debe imprimir HTML.');
      };
    });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/api/sales/${fixture.sale.id}/delivery-note?size=letter`, async (route) => {
      await gate;
      await route.continue();
    });
    const popupPromise = page.waitForEvent('popup');
    await documents.getByRole('button', { name: 'Imprimir nota', exact: true }).click();
    const popup = await popupPromise;
    try {
      expect(await popup.evaluate(() => window.opener === null)).toBe(true);
      await expect(popup).toHaveTitle('Preparando nota de entrega');
    } finally {
      release();
    }
    await expect(documents.getByRole('status')).toContainText('El PDF está listo');
    if (!popup.isClosed()) await popup.close();
    await page.unroute(`**/api/sales/${fixture.sale.id}/delivery-note?size=letter`);
    await page.evaluate(() => {
      window.open = () => null;
    });
    await documents.getByRole('button', { name: 'Imprimir nota', exact: true }).click();
    const fallback = documents.getByRole('link', { name: 'Ver nota en esta pestaña', exact: true });
    await expect(fallback).toHaveAttribute('href', /^blob:/);
    await expect(fallback).not.toHaveAttribute('target', '_blank');
    await expect(documents.getByRole('status')).toContainText('El navegador no abrió otra pestaña');
    fs.mkdirSync(artifactDirectory, { recursive: true });
    await page.screenshot({ path: `${artifactDirectory}/popup-bloqueado-800.png`, fullPage: true });
    await downloadPdf(page, documents.getByRole('link', { name: 'Descargar nota', exact: true }));
    await assertUnchanged(page, fixture, writes);
  } finally {
    await context.close();
  }
  await video!.saveAs(`${artifactDirectory}/abrir-descargar-reimprimir-800.webm`);
});

test('V4.7 error de sesión, permiso, documento, red o HTML no descarga ni vuelve a vender', async ({
  page,
}) => {
  test.setTimeout(90000);
  const fixture = await confirmedSale(page);
  const writes = observeCommercialWrites(page);
  const documents = page.getByRole('region', { name: 'Documentos de la venta', exact: true });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  const mask = `**/api/sales/${fixture.sale.id}/delivery-note?*`;
  for (const failure of [401, 403, 404, 503, 'html', 'fake-pdf', 'network'] as const) {
    await page.route(mask, (route) =>
      failure === 'network'
        ? route.abort('connectionfailed')
        : route.fulfill({
            status: typeof failure === 'number' ? failure : 200,
            contentType: failure === 'fake-pdf' ? 'application/pdf' : 'text/html',
            body: '<html><body>Contenido ajeno al PDF</body></html>',
          }),
    );
    await documents.getByRole('link', { name: 'Descargar nota', exact: true }).click();
    const alert = documents.getByRole('alert');
    await expect(alert).toContainText('La venta permanece guardada');
    if (failure === 401 || failure === 403)
      await expect(
        alert.getByRole('link', { name: 'Iniciar sesión y volver a esta venta' }),
      ).toHaveAttribute(
        'href',
        '/login?returnTo=' + encodeURIComponent('/ventas/' + fixture.sale.id),
      );
    else await expect(alert.getByRole('button', { name: 'Reintentar documento' })).toBeVisible();
    if (failure === 'html' || failure === 'fake-pdf')
      await expect(alert).toContainText('PDF válido');
    expect(downloads).toEqual([]);
    await expect(page).toHaveURL(`/ventas/${fixture.sale.id}?guardada=1`);
    await page.unroute(mask);
  }
  await downloadPdf(
    page,
    documents.getByRole('button', { name: 'Reintentar documento', exact: true }),
  );
  await expect(documents.getByRole('alert')).toHaveCount(0);
  await assertUnchanged(page, fixture, writes);
});

test('V4.7 sesión realmente vencida vuelve a la misma venta y permite descargar sin duplicar', async ({
  page,
}) => {
  const fixture = await confirmedSale(page);
  const writes = observeCommercialWrites(page);
  const logout = await page.request.post('/api/auth/logout', {
    headers: { Origin: 'http://127.0.0.1:3200' },
    data: {},
  });
  expect(logout.ok()).toBe(true);
  await page.getByRole('link', { name: 'Descargar nota', exact: true }).click();
  const alert = page.getByRole('region', { name: 'Documentos de la venta' }).getByRole('alert');
  await expect(alert).toContainText('Tu sesión venció');
  await alert.getByRole('link', { name: 'Iniciar sesión y volver a esta venta' }).click();
  await expect(page).toHaveURL(
    '/login?returnTo=' + encodeURIComponent('/ventas/' + fixture.sale.id),
  );
  const credentials = testCredentials();
  await page.getByLabel('Usuario', { exact: true }).fill(credentials.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('/ventas/' + fixture.sale.id);
  await expect(page.getByRole('heading', { name: fixture.sale.number, exact: true })).toBeVisible();
  await downloadPdf(page, page.getByRole('link', { name: 'Descargar nota', exact: true }));
  await assertUnchanged(page, fixture, writes);
});

test('V4.7 los documentos reales y sus errores privados nunca son caché ni HTML descargable', async ({
  page,
  browser,
}) => {
  const fixture = await confirmedSale(page);
  const anonymous = await browser.newContext({ baseURL: 'http://127.0.0.1:3200' });
  try {
    for (const suffix of [
      'delivery-note?size=letter',
      'delivery-note?size=a4&download=1',
      'document',
    ]) {
      const path = `/api/sales/${fixture.sale.id}/${suffix}`;
      const denied = await anonymous.request.get(path);
      expect(denied.status()).toBe(401);
      expect(denied.headers()['cache-control']).toBe('no-store');
      expect(denied.headers()['x-content-type-options']).toBe('nosniff');
      expect(denied.headers()['content-type']).toContain('application/json');
      expect(denied.headers()['content-disposition']).toBeUndefined();
      const allowed = await page.request.get(path);
      expect(allowed.status()).toBe(200);
      expect(allowed.headers()['cache-control']).toBe('no-store');
      expect(allowed.headers()['x-content-type-options']).toBe('nosniff');
      expect(allowed.headers()['content-type']).toContain('application/pdf');
      expect((await allowed.body()).subarray(0, 5).toString()).toBe('%PDF-');
    }
    const missing = await page.request.get(
      '/api/sales/11111111-2222-4333-8444-555555555555/delivery-note',
    );
    expect(missing.status()).toBe(404);
    expect(missing.headers()['cache-control']).toBe('no-store');
    expect(missing.headers()['x-content-type-options']).toBe('nosniff');
    expect(missing.headers()['content-type']).toContain('application/json');
    expect(missing.headers()['content-disposition']).toBeUndefined();
    await assertUnchanged(page, fixture, []);
  } finally {
    await anonymous.close();
  }
});
