import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {
  Configuration,
  ClientSummary,
  SaleDetail,
  PaymentDetail,
  ReceiptResult,
} from '../../packages/domain/src/index';
import { loginPage } from './helpers/auth';
import { commercePost } from './helpers/commerce';
import { chooseSaleClient } from './helpers/sale-client';
import { receiptDatabase } from './helpers/receipt-v42';

async function fixture(page: Page) {
  await loginPage(page);
  const client = await commercePost<ClientSummary>(page.request, '/api/clients', {
    name: `DEMO recuperación ${randomUUID()}`,
    isDemo: true,
  });
  const fruit = await commercePost<{ id: string }>(page.request, '/api/catalog/fruits', {
    name: `DEMO journal ${randomUUID()}`,
  });
  const rule = await commercePost<Configuration>(page.request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    commercialLine: 'Caja',
    packingModel: 'whole',
    halfPreparation: 'none',
    blistersPerBox: null,
    allowedPresentations: ['box'],
    confirmationStatus: 'confirmed',
  });
  const receipt = await commercePost<ReceiptResult>(page.request, '/api/receipts', {
    schemaVersion: 3,
    receivedAt: new Date(Date.now() - 2000).toISOString(),
    lines: [
      { product: { configurationId: rule.id, expectedPackingVersion: rule.version }, boxes: 2 },
    ],
  });
  return { client, rule, receipt };
}
async function reviewSale(page: Page, client: ClientSummary, rule: Configuration) {
  await page.goto('/ventas/nueva');
  await chooseSaleClient(page, client);
  await page.getByRole('radio', { name: 'Crédito', exact: true }).check();
  await page.getByLabel('Producto', { exact: true }).selectOption(rule.id);
  await page.getByLabel('Cantidad', { exact: true }).fill('2');
  await page.getByLabel('Acuerdo de cobro').selectOption('divisa');
  await page.getByLabel('Precio por unidad (USD)', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Revisar y registrar crédito', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
async function stored(page: Page, kind: 'sale' | 'payment') {
  return page.evaluate((type) => {
    const key = Object.keys(localStorage).find(
      (item) => item.startsWith('mm.commerce.pending.v1:test:') && item.endsWith(':' + type),
    );
    return key
      ? {
          key,
          record: JSON.parse(localStorage.getItem(key)!) as {
            key: string;
            body: string;
            hash: string;
          },
        }
      : null;
  }, kind);
}
async function financialCounts(clientId: string) {
  return receiptDatabase(
    async (db) =>
      (
        await db.query(
          `select
    (select count(*)::int from sales where client_id=$1) sales,
    (select count(*)::int from payments where client_id=$1) payments,
    (select count(*)::int from payment_applications a join payments p on p.id=a.payment_id where p.client_id=$1) applications`,
          [clientId],
        )
      ).rows[0],
  );
}

test('venta: COMMIT perdido, otra pestaña, recarga y nueva sesión recuperan el mismo folio sin duplicar stock', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const { client, rule } = await fixture(page);
  await reviewSale(page, client, rule);
  const second = await context.newPage();
  await second.goto('/ventas/nueva');
  await expect(second.getByLabel('Cliente', { exact: true })).toBeVisible();
  const requests: Array<{ key: string; body: string }> = [];
  let sale!: SaleDetail, release!: () => void, saved!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const committed = new Promise<void>((resolve) => {
    saved = resolve;
  });
  await context.route('**/api/sales', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    if (requests.length > 1) return route.continue();
    const response = await route.fetch();
    expect(response.status(), await response.text()).toBe(201);
    sale = await response.json();
    saved();
    await held;
    await route.fulfill({
      status: 503,
      json: { message: 'Respuesta perdida después de guardar la venta.' },
    });
  });
  try {
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await committed;
    // The second page already existed: its storage event restores the same body.
    await expect(second.getByRole('dialog')).toBeVisible();
    await second
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmar venta', exact: true })
      .click();
    await expect(second.getByRole('dialog').getByRole('alert')).toContainText('Otra pestaña');
    expect(requests).toHaveLength(1);
  } finally {
    release();
  }
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Respuesta perdida');
  const original = (await stored(page, 'sale'))!;
  expect(original.record).toMatchObject({ key: requests[0].key, body: requests[0].body });
  await page.close();
  await second.reload();
  await expect(second.getByRole('dialog')).toBeVisible();
  expect((await stored(second, 'sale'))?.record.key).toBe(original.record.key);
  const logout = await second.request.post('/api/auth/logout', {
    headers: { Origin: 'http://127.0.0.1:3200' },
    data: {},
  });
  expect(logout.ok()).toBe(true);
  await second.goto('/ventas/nueva');
  await expect(second).toHaveURL(/\/login(?:\?.*)?$/);
  await loginPage(second);
  await second.goto('/ventas/nueva');
  await expect(second.getByRole('dialog')).toBeVisible();
  expect(requests).toHaveLength(1); // Recovery never POSTs automatically.
  await second
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(second).toHaveURL(new RegExp('/ventas/' + sale.id + '\\?guardada=1$'));
  expect(requests).toEqual([requests[0], requests[0]]);
  expect(await stored(second, 'sale')).toBeNull();
  expect(await financialCounts(client.id)).toMatchObject({
    sales: 1,
    payments: 0,
    applications: 0,
  });
  await receiptDatabase(async (db) => {
    const rows = (
      await db.query(
        `select s.quantity from stock_balances s join containers c on c.id=s.container_id join lots l on l.id=c.lot_id where l.packing_rule_id=$1`,
        [rule.id],
      )
    ).rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((row) => row.quantity === 0)).toBe(true);
    const receipt = (
      await db.query('select response from command_receipts where key=$1', [requests[0].key])
    ).rows;
    expect(receipt).toHaveLength(1);
    expect(receipt[0].response.id).toBe(sale.id);
  });
  await second.close();
});

test('abono completo: cierre y login recuperan el recibo aun cuando ya no hay saldo pendiente', async ({
  page,
  context,
}) => {
  test.setTimeout(120000);
  const { client, rule } = await fixture(page);
  const sale = await commercePost<SaleDetail>(page.request, '/api/sales', {
    schemaVersion: 2,
    clientId: client.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    lines: [{ configurationId: rule.id, presentation: 'box', quantity: 2, agreedUnitUsd: '40' }],
  });
  const otherFixture = await fixture(page);
  const otherSale = await commercePost<SaleDetail>(page.request, '/api/sales', {
    schemaVersion: 2,
    clientId: otherFixture.client.id,
    condition: 'credit',
    settlementBasis: 'divisa',
    soldAt: new Date().toISOString(),
    lines: [
      {
        configurationId: otherFixture.rule.id,
        presentation: 'box',
        quantity: 1,
        agreedUnitUsd: '30',
      },
    ],
  });
  await page.goto('/ventas/' + sale.id);
  await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await page.getByLabel('Monto recibido').fill('80');
  const requests: Array<{ key: string; body: string }> = [];
  let payment!: PaymentDetail;
  await context.route('**/api/payments', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    requests.push({
      key: route.request().headers()['idempotency-key'],
      body: route.request().postData()!,
    });
    if (requests.length > 1) return route.continue();
    const response = await route.fetch();
    expect(response.status(), await response.text()).toBe(201);
    payment = await response.json();
    return route.fulfill({
      status: 503,
      json: { message: 'Respuesta perdida después de guardar el abono.' },
    });
  });
  await page.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Respuesta perdida');
  const saved = (await stored(page, 'payment'))!;
  expect(saved.record).toMatchObject({ key: requests[0].key, body: requests[0].body });
  expect((await (await page.request.get('/api/sales/' + sale.id)).json()).balanceUsd).toBe('0.00');
  // A foreign-client modal must not reuse A after another tab resolves A.
  const other = await context.newPage();
  await other.goto('/clientes/' + otherFixture.client.id);
  await other.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await expect(other.getByRole('dialog').getByRole('alert')).toContainText('otro cliente');
  await expect(other.getByLabel('Monto recibido')).toBeDisabled();
  expect(
    (
      await page.request.post('/api/auth/logout', {
        headers: { Origin: 'http://127.0.0.1:3200' },
        data: {},
      })
    ).ok(),
  ).toBe(true);
  await page.close();
  const restored = await context.newPage();
  await restored.goto('/ventas/' + sale.id);
  await expect(restored).toHaveURL(/\/login(?:\?.*)?$/);
  await loginPage(restored);
  await restored.goto('/ventas/' + sale.id);
  await restored.getByRole('button', { name: 'Recuperar abono pendiente', exact: true }).click();
  await expect(restored.getByRole('dialog')).toBeVisible();
  expect(requests).toHaveLength(1);
  await restored
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar abono', exact: true })
    .click();
  await expect(restored.getByRole('dialog')).toHaveCount(0);
  expect(requests).toEqual([requests[0], requests[0]]);
  expect(await stored(restored, 'payment')).toBeNull();
  expect(await financialCounts(client.id)).toEqual({ sales: 1, payments: 1, applications: 1 });
  await receiptDatabase(async (db) => {
    const rows = (
      await db.query('select response from command_receipts where key=$1', [requests[0].key])
    ).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].response.id).toBe(payment.id);
  });
  const detail = await restored.request.get('/api/payments/' + payment.id + '/document');
  expect(detail.status()).toBe(200);
  expect((await detail.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await expect(other.getByLabel('Monto recibido')).toBeEnabled();
  await other.getByLabel('Monto recibido').fill('30');
  await other.getByLabel('Aplicar USD a ' + otherSale.number, { exact: true }).fill('30');
  await other.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await other.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(other.getByRole('dialog').getByRole('alert')).toContainText(
    'El resumen no corresponde',
  );
  expect(requests).toHaveLength(2);
  expect(await financialCounts(otherFixture.client.id)).toEqual({
    sales: 1,
    payments: 0,
    applications: 0,
  });
  await other.getByRole('button', { name: 'Cerrar resumen', exact: true }).click();
  await other.getByRole('button', { name: 'Registrar abono', exact: true }).click();
  await other.getByLabel('Monto recibido').fill('30');
  await other.getByLabel('Aplicar USD a ' + otherSale.number, { exact: true }).fill('30');
  await other.getByRole('button', { name: 'Revisar abono', exact: true }).click();
  await other.getByRole('button', { name: 'Confirmar abono', exact: true }).click();
  await expect(other.getByRole('dialog')).toHaveCount(0);
  expect(requests).toHaveLength(3);
  expect(requests[2].key).not.toBe(requests[0].key);
  expect(JSON.parse(requests[2].body).clientId).toBe(otherFixture.client.id);
  expect(await financialCounts(client.id)).toEqual({ sales: 1, payments: 1, applications: 1 });
  expect(await financialCounts(otherFixture.client.id)).toEqual({
    sales: 1,
    payments: 1,
    applications: 1,
  });
  await other.close();
  await restored.close();
});

test('almacenamiento bloqueado impide enviar una venta y muestra cómo recuperarse', async ({
  page,
}) => {
  const { client, rule } = await fixture(page);
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('mm.commerce.pending.v1:'))
        throw new DOMException('QA quota', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  let posts = 0;
  await page.route('**/api/sales', (route) => {
    if (route.request().method() === 'POST') posts++;
    return route.continue();
  });
  await reviewSale(page, client, rule);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Confirmar venta', exact: true })
    .click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('No se pudo conservar');
  expect(posts).toBe(0);
  expect(await stored(page, 'sale')).toBeNull();
  expect(await financialCounts(client.id)).toEqual({ sales: 0, payments: 0, applications: 0 });
});
