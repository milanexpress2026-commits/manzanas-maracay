import { historicalLotCost } from './helpers/historical-cost';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { loginRequest } from './helpers/auth';
import { commerceHeaders, commercePost } from './helpers/commerce';
import {
  getCatalogPreparationDefaults,
  type Catalog,
  type CatalogPreparationResult,
  type CatalogPreparationPreview,
  type CatalogConfigurationBatchResult,
  type Configuration,
  type ReceiptResult,
  type LotDetail,
  type ReceiptPackingConfirmation,
} from '../../packages/domain/src/index';

dotenv.config({ quiet: true });
test.beforeEach(async ({ request }) => loginRequest(request));
async function database<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55432')
    throw new Error('Solo PostgreSQL local de QA.');
  url.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: url.toString() });
  await db.connect();
  try {
    return await fn(db);
  } finally {
    await db.end();
  }
}
async function operationalCounts() {
  return database(
    async (db) =>
      (
        await db.query(`select
    (select count(*) from suppliers)::int suppliers,(select count(*) from clients)::int clients,
    (select count(*) from purchases)::int purchases,(select count(*) from lots)::int lots,
    (select count(*) from inventory_movements)::int movements,(select count(*) from stock_balances)::int balances,
    (select count(*) from price_items)::int prices,(select count(*) from sales)::int sales,
    (select count(*) from payments)::int payments`)
      ).rows[0],
  );
}
const pending = {
  packingModel: 'blister',
  halfPreparation: 'pending',
  allowedPresentations: ['box', 'half_box', 'blister'],
  blistersPerBox: null,
  confirmationStatus: 'pending',
  commercialLine: 'Tradicional',
};
const confirm: ReceiptPackingConfirmation = {
  expectedVersion: 1,
  confirmed: true,
  packingModel: 'blister',
  halfPreparation: 'counted',
  allowedPresentations: ['box', 'half_box', 'blister'],
  blistersPerBox: 5,
  boxWeightKg: null,
};

test('V4 API preparación concurrente y reintento conservan Lady sin crear operaciones', async ({
  request,
}) => {
  const suffix = randomUUID().slice(0, 8),
    input = getCatalogPreparationDefaults();
  input.fruits.forEach((fruit) => {
    fruit.name += ` QA ${suffix}`;
  });
  const apple = input.fruits[0]!;
  const existing = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: apple.name,
  });
  const lady = await commercePost<{ id: string }>(request, '/api/catalog/varieties', {
    fruitId: existing.id,
    name: 'Lady',
  });
  const before = await operationalCounts();
  const preview = await commercePost<CatalogPreparationPreview>(
    request,
    '/api/catalog/preparation/preview',
    input,
  );
  expect(preview.created).toEqual({ fruits: 7, varieties: 10, calibers: 19, configurations: 4 });
  expect(
    ((await (await request.get('/api/catalog')).json()) as Catalog).fruits.filter((f) =>
      f.name.endsWith(suffix),
    ),
  ).toHaveLength(1);
  expect(await operationalCounts()).toEqual(before);
  const key = randomUUID(),
    body = { ...input, confirmed: true };
  const [first, retry, concurrent] = await Promise.all([
    commercePost<CatalogPreparationResult>(request, '/api/catalog/preparation', body, key),
    commercePost<CatalogPreparationResult>(request, '/api/catalog/preparation', body, key),
    commercePost<CatalogPreparationResult>(request, '/api/catalog/preparation', body),
  ]);
  expect(retry).toEqual(first);
  expect(first.created.fruits + concurrent.created.fruits).toBe(7);
  expect(first.created.configurations + concurrent.created.configurations).toBe(4);
  const after = (await (await request.get('/api/catalog')).json()) as Catalog;
  expect(after.fruits.filter((f) => f.name.endsWith(suffix))).toHaveLength(8);
  expect(after.varieties.find((v) => v.id === lady.id)?.name).toBe('Lady');
  expect(
    after.varieties.filter((v) => v.fruitId === existing.id && v.name === 'Pink Lady'),
  ).toHaveLength(1);
  const configurations = after.configurations.filter((c) => c.fruit.endsWith(suffix));
  expect(configurations).toHaveLength(4);
  expect(configurations.every((c) => c.confirmationStatus === 'pending')).toBe(true);
  expect(await operationalCounts()).toEqual(before);
  await database(async (db) => {
    expect(
      (await db.query('select count(*)::int n from command_receipts where key=$1', [key])).rows[0]
        .n,
    ).toBe(1);
    expect(
      (await db.query('select count(*)::int n from audit_events where request_id=$1', [key]))
        .rows[0].n,
    ).toBe(1);
  });
  const conflict = await request.post('/api/catalog/preparation', {
    headers: commerceHeaders(key),
    data: { confirmed: true, fruits: [apple] },
  });
  expect(conflict.status()).toBe(409);
});

test('V4 API lote de configuraciones es atómico y reutilizar conserva empaque confirmado', async ({
  request,
}) => {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO V4 lote ${randomUUID()}`,
  });
  const variety = await commercePost<{ id: string }>(request, '/api/catalog/varieties', {
    fruitId: fruit.id,
    name: 'Gala',
  });
  const calibers = await commercePost<{ calibers: { id: string; label: string }[] }>(
    request,
    '/api/catalog/calibers/batch',
    { fruitId: fruit.id, labels: ['90', '100', '216'] },
  );
  const rows = calibers.calibers.map((caliber) => ({
    ...pending,
    fruitId: fruit.id,
    varietyId: variety.id,
    caliberId: caliber.id,
  }));
  const bad = await request.post('/api/catalog/configurations/batch', {
    headers: commerceHeaders(),
    data: { confirmed: true, configurations: [rows[0], { ...rows[1], varietyId: randomUUID() }] },
  });
  expect(bad.status()).toBe(400);
  expect(
    ((await (await request.get('/api/catalog')).json()) as Catalog).configurations.filter(
      (c) => c.fruitId === fruit.id,
    ),
  ).toHaveLength(0);
  const body = { confirmed: true, configurations: rows.slice(0, 2) },
    key = randomUUID();
  const created = await commercePost<CatalogConfigurationBatchResult>(
    request,
    '/api/catalog/configurations/batch',
    body,
    key,
  );
  expect(created.createdCount).toBe(2);
  expect(await commercePost(request, '/api/catalog/configurations/batch', body, key)).toEqual(
    created,
  );
  const firstId = created.configurations[0]!.id;
  const changed = await request.patch(`/api/catalog/configurations/${firstId}`, {
    headers: commerceHeaders(),
    data: {
      packingModel: 'blister',
      halfPreparation: 'counted',
      allowedPresentations: ['box', 'half_box', 'blister'],
      blistersPerBox: 4,
      confirmationStatus: 'confirmed',
      version: 1,
    },
  });
  expect(changed.ok(), await changed.text()).toBe(true);
  const reused = await commercePost<CatalogConfigurationBatchResult>(
    request,
    '/api/catalog/configurations/batch',
    body,
  );
  expect(reused.createdCount).toBe(0);
  expect(reused.configurations[0]).toMatchObject({
    id: firstId,
    confirmationStatus: 'confirmed',
    created: false,
  });
  const final = (
    (await (await request.get('/api/catalog')).json()) as Catalog
  ).configurations.filter((c) => c.fruitId === fruit.id);
  expect(final).toHaveLength(2);
  expect(final.find((c) => c.id === firstId)).toMatchObject({
    version: 2,
    blistersPerBox: 4,
    confirmationStatus: 'confirmed',
  });
});

test('V4 API confirmar empaque y recibir conserva atomicidad, reintento y snapshots históricos', async ({
  request,
}) => {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO V4 recepción ${randomUUID()}`,
  });
  const rule = await commercePost<Configuration>(request, '/api/catalog/configurations', {
    ...pending,
    fruitId: fruit.id,
  });
  const supplier = await commercePost<{ id: string }>(request, '/api/suppliers', {
    name: `DEMO V4 ${randomUUID()}`,
  });
  const base = {
    supplierId: supplier.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt: new Date().toISOString(),
    isDemo: true,
    lines: [
      { configurationId: rule.id, boxes: 2, unitCostUsd: '25', packingConfirmation: confirm },
    ],
  };
  const bad = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: {
      ...base,
      lines: [
        {
          ...base.lines[0],
          priceAction: 'keep',
          prices: [{ presentation: 'box', promoUsd: '40', regularUsd: '48' }],
        },
      ],
    },
  });
  expect(bad.status()).toBe(400);
  expect(
    ((await (await request.get('/api/catalog')).json()) as Catalog).configurations.find(
      (c) => c.id === rule.id,
    ),
  ).toMatchObject({ version: 1, confirmationStatus: 'pending', blistersPerBox: null });
  await database(async (db) => {
    expect(
      (await db.query('select count(*)::int n from purchases where supplier_id=$1', [supplier.id]))
        .rows[0].n,
    ).toBe(0);
  });
  const key = randomUUID();
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', base, key);
  expect(await commercePost(request, '/api/receipts', base, key)).toEqual(receipt);
  const lot = (await (
    await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)
  ).json()) as LotDetail;
  expect(lot.lot).toMatchObject({ closedBoxes: 2, blistersPerBox: 5, unitCostUsd: null });
  await historicalLotCost(lot.lot.id, '25.0000');
  const second = await commercePost<ReceiptResult>(request, '/api/receipts', {
    ...base,
    reference: `DEMO-${randomUUID()}`,
    lines: [
      {
        ...base.lines[0],
        boxes: 1,
        unitCostUsd: '27',
        packingConfirmation: { ...confirm, expectedVersion: 2, blistersPerBox: 4 },
      },
    ],
  });
  const historical = (await (
    await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)
  ).json()) as LotDetail;
  expect(historical).toEqual(lot);
  expect(
    ((await (await request.get(`/api/inventory/lots/${second.lots[0]!.id}`)).json()) as LotDetail)
      .lot.blistersPerBox,
  ).toBe(4);
  const stale = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: { ...base, reference: `DEMO-${randomUUID()}` },
  });
  expect(stale.status()).toBe(409);
  await database(async (db) => {
    expect(
      (await db.query('select count(*)::int n from purchases where supplier_id=$1', [supplier.id]))
        .rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query(
          "select count(*)::int n from audit_events where entity_id=$1 and action='confirm_on_receipt'",
          [rule.id],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.query(
          'select packing_rule_version,confirmation_status_snapshot from lots where id=$1',
          [receipt.lots[0]!.id],
        )
      ).rows[0],
    ).toEqual({ packing_rule_version: 2, confirmation_status_snapshot: 'confirmed' });
  });
});

test('V4 API recepciones concurrentes no confirman dos veces la misma versión', async ({
  request,
}) => {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO V4 disputa ${randomUUID()}`,
  });
  const rule = await commercePost<Configuration>(request, '/api/catalog/configurations', {
    ...pending,
    fruitId: fruit.id,
  });
  const supplier = await commercePost<{ id: string }>(request, '/api/suppliers', {
    name: `DEMO V4 ${randomUUID()}`,
  });
  const outcomes = await Promise.all(
    [1, 2].map(() =>
      request.post('/api/receipts', {
        headers: commerceHeaders(),
        data: {
          supplierId: supplier.id,
          reference: `DEMO-${randomUUID()}`,
          receivedAt: new Date().toISOString(),
          isDemo: true,
          lines: [
            { configurationId: rule.id, boxes: 1, unitCostUsd: '25', packingConfirmation: confirm },
          ],
        },
      }),
    ),
  );
  expect(outcomes.map((r) => r.status()).sort()).toEqual([201, 409]);
  const catalog = (await (await request.get('/api/catalog')).json()) as Catalog;
  expect(catalog.configurations.find((c) => c.id === rule.id)?.version).toBe(2);
  await database(async (db) => {
    expect(
      (await db.query('select count(*)::int n from purchases where supplier_id=$1', [supplier.id]))
        .rows[0].n,
    ).toBe(1);
    expect(
      (await db.query('select count(*)::int n from lots where supplier_id=$1', [supplier.id]))
        .rows[0].n,
    ).toBe(1);
  });
});
