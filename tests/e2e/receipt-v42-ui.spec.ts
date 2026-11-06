import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';
import type { LotDetail, ReceiptResult } from '../../packages/domain/src/index';
import { loginPage } from './helpers/auth';
import { commercialProduct } from './helpers/commerce';
import { habitualOptions, quickLine, quickReceipt, receiptCounts } from './helpers/receipt-v42';
import { chooseReceiptProduct, noHorizontalOverflow } from './helpers/quick-receipt-ui';

test('V4.5 recepción móvil conserva borrador, commit perdido y la misma clave tras cerrar sesión y 401', async ({
  page: initialPage,
}) => {
  test.setTimeout(120000);
  let page = initialPage;
  await loginPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const rules = [
    await commercialProduct(page.request, 'blister', '40', 4),
    await commercialProduct(page.request, 'blister', '40', 5),
    await commercialProduct(page.request, 'halves', '40', 5, '10'),
  ];
  const options = await habitualOptions(page.request);
  const labels = rules.map(
    (rule) => options.options.find((option) => option.configurationId === rule.id)!.label,
  );
  const before = await receiptCounts();
  await page.goto('/recepciones');
  await expect(page.getByLabel('Proveedor (opcional)', { exact: true })).not.toBeVisible();
  await expect(
    page.getByLabel('Documento del proveedor (opcional)', { exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByLabel('Fecha y hora de recepción (opcional)', { exact: true }),
  ).not.toBeVisible();
  for (let index = 0; index < rules.length; index++) {
    const line = await chooseReceiptProduct(page, labels[index]!, index);
    await line.getByLabel('Cajas recibidas', { exact: true }).fill(['10', '6', '3'][index]!);
    await expect(line.getByLabel(/Costo|Precio/i)).toHaveCount(0);
  }
  const context = page.context();
  const reopened = await context.newPage();
  await page.close();
  page = reopened;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/recepciones');
  await expect(
    page.getByRole('status').filter({ hasText: 'Recuperamos tu borrador' }),
  ).toBeVisible();
  for (let index = 0; index < rules.length; index++) {
    const line = page.getByRole('region', { name: `Producto ${index + 1}`, exact: true });
    await expect(line.getByLabel('Cajas recibidas', { exact: true })).toHaveValue(
      ['10', '6', '3'][index]!,
    );
    await expect(line.getByLabel(/Costo|Precio/i)).toHaveCount(0);
  }
  const commands: { key: string; body: string }[] = [];
  let saved: ReceiptResult | undefined;
  await page.route('**/api/receipts', async (route) => {
    commands.push({
      key: route.request().headers()['idempotency-key']!,
      body: route.request().postData()!,
    });
    if (commands.length === 2) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'QA: vuelve a iniciar sesión para resolver la misma recepción.',
        }),
      });
      return;
    }
    const response = await route.fetch();
    expect(response.status(), await response.text()).toBe(201);
    saved = await response.json();
    if (commands.length === 1)
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'QA: respuesta perdida después de guardar; reintenta la misma recepción.',
        }),
      });
    else await route.fulfill({ response });
  });
  await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
  const review = page.getByRole('dialog', { name: 'Revisar recepción', exact: true });
  await expect(review).toContainText('Sin proveedor indicado');
  await expect(review).not.toContainText('USD');
  await review.getByRole('button', { name: 'Guardar recepción', exact: true }).dblclick();
  await expect(review.getByRole('alert')).toContainText('respuesta perdida');
  await expect(page.getByRole('heading', { name: 'Recepción guardada', exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'Revisar recepción', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar resumen', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginPage(page);
  await page.goto('/recepciones');
  await page.getByRole('button', { name: 'Reintentar misma recepción', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText(
    'vuelve a iniciar sesión',
  );
  const pendingDialogBounds = await page.getByRole('dialog').boundingBox();
  expect(pendingDialogBounds).not.toBeNull();
  expect(pendingDialogBounds!.y).toBeGreaterThanOrEqual(0);
  expect(pendingDialogBounds!.y + pendingDialogBounds!.height).toBeLessThanOrEqual(844);
  await page.getByRole('button', { name: 'Cerrar resumen', exact: true }).scrollIntoViewIfNeeded();
  fs.mkdirSync('docs/capturas/operacion-simple-v4-5', { recursive: true });
  await page.screenshot({ path: 'docs/capturas/operacion-simple-v4-5/reintento-401-390.png' });
  await expect(page.getByRole('heading', { name: 'Recepción guardada', exact: true })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Cerrar resumen', exact: true }).click();
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await loginPage(page);
  await page.goto('/recepciones');
  await page.getByRole('button', { name: 'Reintentar misma recepción', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Recepción guardada', exact: true }),
  ).toBeVisible();
  expect(commands).toHaveLength(3);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[2]).toEqual(commands[0]);
  const submitted = JSON.parse(commands[0]!.body);
  expect(submitted).toMatchObject({ schemaVersion: 3, supplierId: null, reference: null });
  expect(submitted.receivedAt).toBeUndefined();
  expect(
    submitted.lines.every(
      (line: Record<string, unknown>) => !('cost' in line) && !('prices' in line),
    ),
  ).toBe(true);
  expect(saved?.receiptNumber).toMatch(/^R-\d{8,}$/);
  const after = await receiptCounts();
  expect(after.purchases - before.purchases).toBe(1);
  expect(after.lots - before.lots).toBe(3);
  expect(after.suppliers).toBe(before.suppliers);
  for (const [index, lot] of saved!.lots.entries()) {
    const detail: LotDetail = await (
      await page.request.get(`/api/inventory/lots/${lot.id}`)
    ).json();
    expect(detail.lot).toMatchObject({ supplierId: null, closedBoxes: [10, 6, 3][index] });
  }
  await noHorizontalOverflow(page);
  fs.mkdirSync('docs/capturas/operacion-simple-v4-5', { recursive: true });
  await page.screenshot({
    path: 'docs/capturas/operacion-simple-v4-5/guardada-390.png',
    fullPage: true,
  });
});

for (const width of [390, 800, 1024, 1440]) {
  test(`V4.5 recepción a ${width}px: no expone costo histórico ni lista y conserva accesibilidad`, async ({
    page,
  }) => {
    test.setTimeout(90000);
    await loginPage(page);
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const rule = await commercialProduct(page.request, 'blister', '40', 4);
    await quickReceipt(page.request, [quickLine(rule, 1, '25')]);
    const option = (await habitualOptions(page.request)).options.find(
      (row) => row.configurationId === rule.id,
    )!;
    await page.goto('/recepciones');
    const line = await chooseReceiptProduct(page, option.label);
    await expect(line.getByLabel(/Costo|Precio/i)).toHaveCount(0);
    await expect(
      line.getByRole('button', { name: /Usar costo anterior|Cambiar costo/ }),
    ).toHaveCount(0);
    const quantity = line.getByLabel('Cajas recibidas', { exact: true });
    await expect(quantity).toHaveValue('1');
    await quantity.fill('3');
    await quantity.focus();
    await quantity.scrollIntoViewIfNeeded();
    const inputBounds = await quantity.boundingBox();
    const summaryBounds = await page
      .getByRole('region', { name: 'Resumen y guardado', exact: true })
      .boundingBox();
    expect(inputBounds).not.toBeNull();
    expect(summaryBounds).not.toBeNull();
    expect(
      inputBounds!.x < summaryBounds!.x + summaryBounds!.width &&
        inputBounds!.x + inputBounds!.width > summaryBounds!.x &&
        inputBounds!.y < summaryBounds!.y + summaryBounds!.height &&
        inputBounds!.y + inputBounds!.height > summaryBounds!.y,
      'El resumen no tapa la cantidad en edición',
    ).toBe(false);
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    fs.mkdirSync('docs/capturas/operacion-simple-v4-5', { recursive: true });
    await page.screenshot({
      path: `docs/capturas/operacion-simple-v4-5/recepcion-${width}.png`,
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Revisar y guardar', exact: true }).click();
    await expect(page.getByRole('dialog')).not.toContainText('USD');
    await expect(
      page.getByRole('dialog').getByRole('button', { name: 'Guardar recepción' }),
    ).toBeVisible();
    await noHorizontalOverflow(page);
  });
}
