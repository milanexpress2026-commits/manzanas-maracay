import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loginRequest, loginPage } from './helpers/auth';
import { commercialProduct, commerceHeaders, commercePost } from './helpers/commerce';
import { receiptDatabase } from './helpers/receipt-v42';
import type { LotDetail, ReceiptResult } from '../../packages/domain/src';

test('V4.15 validación acotada protege ancestros, hijos, ciclos y padres vacíos', async ({
  request,
}) => {
  await loginRequest(request);
  const rule = await commercialProduct(request);
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    isDemo: true,
    lines: [
      { product: { configurationId: rule.id, expectedPackingVersion: rule.version }, boxes: 2 },
    ],
  });
  const endpoint = '/api/inventory/lots/' + receipt.lots[0].id;
  const initial: LotDetail = await (await request.get(endpoint)).json();
  await commercePost(request, endpoint + '/open-box', {
    containerId: initial.containers[0].id,
    reason: 'DEMO validación de rendimiento',
  });
  const state: LotDetail = await (await request.get(endpoint)).json();
  const parent = state.containers.find((c) => c.kind === 'box' && c.state === 'open')!;
  const child = state.containers.find((c) => c.parentId === parent.id)!;
  const cases = [
    {
      sql: 'update containers set parent_id=$2 where id=$1',
      params: [parent.id, child.id],
      trigger: 'container_tree_valid',
      message: 'Container ancestry cannot contain cycles',
    },
    {
      sql: 'update stock_balances set quantity=1 where container_id=$1',
      params: [parent.id],
      trigger: 'stock_tree_valid',
      message: 'Do not count packaging and its contents twice',
    },
    {
      sql: "update containers set state='dispatched' where id=$1",
      params: [parent.id],
      trigger: 'container_physical_valid',
      message: 'Available contents require an open box parent',
    },
    {
      sql: 'update containers set parent_id=null where parent_id=$1',
      params: [parent.id],
      trigger: 'container_physical_valid',
      message: 'Physical state does not match the historical packaging model',
    },
  ];
  for (const check of cases)
    await receiptDatabase(async (db) => {
      await db.query(check.sql, check.params);
      // Check the optimized guard itself, not an unrelated ledger constraint.
      await expect(
        db.query('set constraints ' + check.trigger + ' immediate'),
      ).rejects.toMatchObject({ code: '23514', message: check.message });
    }, true);
  expect(await (await request.get(endpoint)).json()).toEqual(state);
});

test('V4.15 recepción en tablet carga un solo catálogo y permite elegir mercancía', async ({
  page,
}, info) => {
  await loginPage(page);
  await page.setViewportSize({ width: 800, height: 1100 });
  const catalogRequests: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/catalog'))
      catalogRequests.push(new URL(request.url()).pathname);
  });
  const started = performance.now();
  await page.goto('/recepciones');
  const receive = page.getByRole('button', { name: 'Recibir mercancía', exact: true });
  await expect(receive).toBeEnabled();
  await receive.click();
  await expect(page.getByRole('textbox', { name: 'Buscar producto' })).toBeVisible();
  expect(catalogRequests).toEqual(['/api/catalog']);
  await info.attach('tablet-receipt-readiness', {
    body: JSON.stringify({ ms: Math.round(performance.now() - started), catalogRequests }),
    contentType: 'application/json',
  });
});

test('V4.15 recepción grande conserva cada caja y el reintento no duplica mercancía', async ({
  request,
}, info) => {
  test.setTimeout(180000);
  await loginRequest(request);
  const rule = await commercialProduct(request);
  const timings = [];
  for (const boxes of [100, 500]) {
    const key = randomUUID();
    const data = {
      schemaVersion: 3,
      isDemo: true,
      lines: [
        { product: { configurationId: rule.id, expectedPackingVersion: rule.version }, boxes },
      ],
    };
    const started = performance.now();
    const response = await request.post('/api/receipts', {
      headers: commerceHeaders(key),
      data,
      timeout: 120000,
    });
    const ms = Math.round(performance.now() - started);
    expect(response.status(), await response.text()).toBe(201);
    const receipt = await response.json();
    const replay = await request.post('/api/receipts', { headers: commerceHeaders(key), data });
    expect(replay.status()).toBe(201);
    expect(await replay.json()).toEqual(receipt);
    const counts = await receiptDatabase(
      async (db) =>
        (
          await db.query(
            `select
      (select count(*)::int from containers where lot_id=$1) containers,
      (select sum(quantity)::int from stock_balances s join containers c on c.id=s.container_id where c.lot_id=$1) boxes,
      (select count(*)::int from inventory_entries where movement_id=$2) entries,
      (select count(*)::int from inventory_cost_entries where movement_id=$2) costs`,
            [receipt.lots[0].id, receipt.lots[0].movementId],
          )
        ).rows[0],
    );
    expect(counts).toEqual({ containers: boxes, boxes, entries: boxes, costs: boxes });
    timings.push({ boxes, ms });
    if (boxes === 500) {
      const plan = await receiptDatabase(async (db) => {
        await db.query('set constraints all immediate');
        return (
          await db.query(
            `explain(analyze,buffers,format json) update stock_balances
          set quantity=quantity where container_id in (select id from containers where lot_id=$1)`,
            [receipt.lots[0].id],
          )
        ).rows[0]['QUERY PLAN'];
      }, true);
      await info.attach('inventory-validation-profile', {
        body: JSON.stringify(plan),
        contentType: 'application/json',
      });
      console.log('V415_VALIDATION_PROFILE ' + JSON.stringify(plan[0].Triggers));
    }
  }
  console.log('V415_RECEIPT_TIMINGS ' + JSON.stringify(timings));
  await info.attach('receipt-timings', {
    body: JSON.stringify(timings),
    contentType: 'application/json',
  });
});
