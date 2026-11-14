import { test, expect } from '@playwright/test';
import { loginPage } from './helpers/auth';

test('V4.16 Atrás y restaurar una página vuelven a consultar ventas sin conservar saldos viejos', async ({
  page,
}) => {
  await loginPage(page);
  await page.setViewportSize({ width: 800, height: 1100 });
  await page.goto('/ventas');
  await page.waitForLoadState('networkidle');
  let reads = 0;
  await page.route('**/api/sales?**', async (route) => {
    reads++;
    await route.fulfill({ json: [{ ...sales[0], clientName: `Datos actualizados ${reads}` }] });
  });
  await page.locator('.desktop-sidebar').getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.goBack();
  await expect(page.locator('.commercial-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.commercial-table')).toContainText('Datos actualizados 1');
  expect(reads).toBe(1);
  await page.evaluate(() =>
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
  );
  await expect(page.locator('.commercial-table')).toContainText('Datos actualizados 2');
  expect(reads).toBe(2);
});

test('V4.16 una carga lenta se ve y no impide salir a otro menú', async ({ page }) => {
  await loginPage(page);
  await page.setViewportSize({ width: 800, height: 1100 });
  let release: () => void = () => {};
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route('**/api/sales?**', async (route) => {
    if (++calls === 1) await paused;
    await route.fulfill({ json: sales.slice(0, 25) }).catch(() => {});
  });
  try {
    await page.goto('/ventas');
    await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA');
    await expect(page.getByText('Cargando registros…', { exact: true })).toBeVisible();
    await page
      .locator('.desktop-sidebar')
      .getByRole('link', { name: 'Inicio', exact: true })
      .click();
    await expect(page).toHaveURL(/\/inicio$/);
    await page
      .locator('.desktop-sidebar')
      .getByRole('link', { name: 'Ventas', exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA');
    await expect(page.locator('.commercial-table tbody tr')).toHaveCount(25);
  } finally {
    release();
  }
});

// Synthetic list transport: the real auth/shell/hooks run, no business records are written.
const sales = Array.from({ length: 61 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
  number: `QA-${String(i + 1).padStart(8, '0')}`,
  clientName: `Cliente de prueba ${i}`,
  soldAt: '2026-11-14T12:00:00.000Z',
  status: 'confirmed',
  condition: 'cash',
  totalUsd: '95.00',
  balanceUsd: '0.00',
  dueStatus: 'paid',
  isDemo: true,
}));

test('V4.16 ventas muestra 25, carga el resto y busca también fuera de la primera página', async ({
  page,
}) => {
  await loginPage(page);
  await page.setViewportSize({ width: 800, height: 1100 });
  const limits: number[] = [];
  await page.route('**/api/sales?**', async (route) => {
    const url = new URL(route.request().url());
    const limit = Number(url.searchParams.get('limit')),
      offset = Number(url.searchParams.get('offset'));
    limits.push(limit);
    const search = url.searchParams.get('search');
    const matches = search ? sales.filter((s) => s.number.includes(search)) : sales;
    await route.fulfill({ json: matches.slice(offset, offset + limit) });
  });
  await page.goto('/ventas');
  await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA');
  const rows = page.locator('.commercial-table tbody tr');
  await expect(rows).toHaveCount(25);
  await page.getByRole('button', { name: 'Cargar más ventas' }).click();
  await expect(rows).toHaveCount(50);
  await page.getByRole('button', { name: 'Cargar más ventas' }).click();
  await expect(rows).toHaveCount(61);
  await expect(page.getByRole('button', { name: 'Cargar más ventas' })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA-00000061');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('QA-00000061');
  expect(limits.every((limit) => limit === 25)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('V4.16 volver a Ventas permite recuperar una conexión interrumpida', async ({ page }) => {
  await loginPage(page);
  await page.setViewportSize({ width: 800, height: 1100 });
  let attempt = 0;
  await page.route('**/api/sales?**', async (route) => {
    attempt++;
    if (attempt === 2) {
      await route.fulfill({ status: 503, json: { message: 'Conexión interrumpida.' } });
      return;
    }
    await route.fulfill({ json: sales.slice(0, 25) });
  });
  await page.goto('/ventas');
  await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA');
  await expect(page.locator('.commercial-table tbody tr')).toHaveCount(25);
  await page.locator('.desktop-sidebar').getByRole('link', { name: 'Inicio', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await page.locator('.desktop-sidebar').getByRole('link', { name: 'Ventas', exact: true }).click();
  await page.getByRole('textbox', { name: 'Buscar ventas' }).fill('QA');
  await expect(page.getByText('Conexión interrumpida.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.locator('.commercial-table tbody tr')).toHaveCount(25);
  await expect(page.getByRole('status', { name: 'Cargando registros', exact: true })).toHaveCount(
    0,
  );
});

test('V4.16 la primera página llega autorizada sin esperar JavaScript ni repetir la consulta', async ({
  page,
  browser,
}) => {
  await loginPage(page);
  const expected = await (await page.request.get('/api/sales?search=&limit=25&offset=0')).json();
  const plain = await browser.newContext({
    javaScriptEnabled: false,
    storageState: await page.context().storageState(),
  });
  try {
    const html = await plain.newPage();
    await html.goto('http://127.0.0.1:3200/ventas');
    await expect(html.getByRole('heading', { name: 'Ventas', exact: true })).toBeVisible();
    await expect(html.locator('.commercial-table tbody tr')).toHaveCount(expected.length);
    for (const row of expected)
      await expect(html.getByRole('link', { name: row.number, exact: true })).toBeVisible();
  } finally {
    await plain.close();
  }
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/sales') reads++;
  });
  await page.goto('/ventas');
  await expect(page.getByRole('textbox', { name: 'Buscar ventas' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(reads).toBe(0);
});
