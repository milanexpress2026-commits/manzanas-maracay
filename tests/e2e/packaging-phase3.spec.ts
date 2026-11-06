import {
  historicalSaleCost,
  historicalLotCost,
  historicalContainerCosts,
} from './helpers/historical-cost';
import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { loginRequest } from './helpers/auth';
import {
  commercePost,
  commerceHeaders,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSale,
} from './helpers/commerce';
import type {
  Configuration,
  ReceiptResult,
  LotDetail,
  Supplier,
  InventoryCommandResult,
} from '../../packages/domain/src/index';
test.beforeEach(async ({ request }) => loginRequest(request));

test('recepción cuatro modalidades: precios elegidos, rollback de toda la recepción y reintento único', async ({
  request,
}) => {
  const rules = await Promise.all([
    commercialProduct(request, 'blister'),
    commercialProduct(request, 'halves'),
    commercialProduct(request, 'whole'),
    commercialProduct(request, 'halves'),
  ]);
  const supplier = await commercePost<Supplier>(request, '/api/suppliers', {
    name: `DEMO multiproducto ${randomUUID()}`,
  });
  const input = {
    supplierId: supplier.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt: new Date().toISOString(),
    isDemo: true,
    lines: rules.map((r, i) => ({
      configurationId: r.id,
      boxes: i + 1,
      unitCostUsd: String(25 + i),
      priceAction: i === 0 ? 'update' : 'keep',
      ...(i === 0 ? { prices: [{ presentation: 'box', promoUsd: '42', regularUsd: '52' }] } : {}),
    })),
  };
  const bad = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: {
      ...input,
      lines: [input.lines[0], { ...input.lines[1], configurationId: randomUUID() }],
    },
  });
  expect(bad.status()).toBe(400);
  const pricesBefore = await (await request.get('/api/prices')).json();
  expect(
    pricesBefore.find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rules[0].id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('40.0000');
  const key = randomUUID(),
    receipt = await commercePost<ReceiptResult>(request, '/api/receipts', input, key);
  expect(receipt.lots).toHaveLength(4);
  expect((await commercePost<ReceiptResult>(request, '/api/receipts', input, key)).purchaseId).toBe(
    receipt.purchaseId,
  );
  const inventory = await (await request.get('/api/inventory')).json();
  expect(
    inventory.lots.filter((l: { configurationId: string }) =>
      rules.some((r) => r.id === l.configurationId),
    ),
  ).toHaveLength(4);
  const prices = await (await request.get('/api/prices')).json();
  expect(
    prices.find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rules[0].id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('42.0000');
  expect(
    prices.find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rules[1].id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('40.0000');
  const unchanged = (await (
    await request.get(`/api/inventory/lots/${receipt.lots[1].id}`)
  ).json()) as LotDetail;
  expect(unchanged.lot.unitCostUsd).toBeNull();
  await historicalLotCost(unchanged.lot.id, '26.0000');
  expect(unchanged.lot.blistersPerBox).toBeNull();
});

test('empaque de pera pendiente admite cajas sin inventar blíster; bloquea apertura y conteo hasta confirmar', async ({
  request,
}) => {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO pera pendiente ${randomUUID()}`,
  });
  const rule = await commercePost<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    blistersPerBox: null,
    halfPreparation: 'pending',
  });
  const receipt = await commercialReceipt(request, rule, 1, '25');
  const lot = (await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json()) as LotDetail;
  expect(lot.lot.blistersPerBox).toBeNull();
  expect(lot.containers[0].countedPieces).toBeNull();
  const open = await request.post(`/api/inventory/lots/${lot.lot.id}/open-box`, {
    headers: commerceHeaders(),
    data: { containerId: lot.containers[0].id, reason: 'Intento de prueba sin empaque confirmado' },
  });
  expect(open.status()).toBe(400);
  const after = (await (
    await request.get(`/api/inventory/lots/${lot.lot.id}`)
  ).json()) as LotDetail;
  expect(after.lot.closedBoxes).toBe(1);
  expect(after.movements).toHaveLength(1);
});

test('fracciones FIFO conservan el último decimal de costo y la mitad comercial no inventa piezas', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'blister', '40', 3),
    customer = await commercialCustomer(request);
  const receipt = await commercialReceipt(request, rule, 1, '25');
  const sales = [];
  for (let i = 0; i < 3; i++)
    sales.push(await commercialSale(request, customer, rule, 1, '15', 'blister'));
  expect(sales.map((s) => s.costUsd)).toEqual([null, null, null]);
  for (const [index, sale] of sales.entries())
    await historicalSaleCost(sale.id, ['8.3333', '8.3333', '8.3334'][index]!);
  const lot = (await (
    await request.get(`/api/inventory/lots/${receipt.lots[0].id}`)
  ).json()) as LotDetail;
  expect(lot.lot.closedBoxes).toBe(0);
  expect(lot.lot.intactBlisters).toBe(0);
  expect(lot.containers.every((c) => c.costUsd === null)).toBe(true);
  expect((await historicalContainerCosts(lot.lot.id)).every((cost) => cost === '0.0000')).toBe(
    true,
  );
  const halfRule = await commercialProduct(request, 'halves'),
    halfReceipt = await commercialReceipt(request, halfRule, 1, '25');
  const before = (await (
    await request.get(`/api/inventory/lots/${halfReceipt.lots[0].id}`)
  ).json()) as LotDetail;
  const split = await commercePost<InventoryCommandResult>(
    request,
    `/api/inventory/lots/${before.lot.id}/split-halves`,
    { containerId: before.containers[0].id, reason: 'Mitades comerciales de prueba' },
  );
  const splitLot = (await (
    await request.get(`/api/inventory/lots/${before.lot.id}`)
  ).json()) as LotDetail;
  expect(splitLot.lot.closedBoxes).toBe(0);
  expect(splitLot.lot.preparedHalfBoxes).toBe(2);
  expect(splitLot.lot.equivalentBoxes).toBe(1);
  expect(splitLot.containers.every((c) => c.countedPieces === null)).toBe(true);
  await commercePost(request, `/api/inventory/movements/${split.movementId}/reverse`, {
    reason: 'Revertir división de prueba',
  });
  expect(
    (await (await request.get(`/api/inventory/lots/${before.lot.id}`)).json()).lot.closedBoxes,
  ).toBe(1);
});

test('precios repetidos coherentes se consolidan y propuestas conflictivas revierten toda recepción', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const supplier = await commercePost<Supplier>(request, '/api/suppliers', {
    name: `DEMO precios coherentes ${randomUUID()}`,
  });
  const line = {
    configurationId: rule.id,
    boxes: 1,
    unitCostUsd: '25',
    priceAction: 'update',
    prices: [{ presentation: 'box', promoUsd: '42', regularUsd: '52' }],
  };
  const body = {
    supplierId: supplier.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt: new Date().toISOString(),
    isDemo: true,
    lines: [
      line,
      {
        ...line,
        unitCostUsd: '27',
        prices: [{ presentation: 'box', promoUsd: '43', regularUsd: '52' }],
      },
    ],
  };
  expect(
    (await request.post('/api/receipts', { headers: commerceHeaders(), data: body })).status(),
  ).toBe(400);
  expect(
    (await (await request.get('/api/inventory')).json()).lots.filter(
      (l: { configurationId: string }) => l.configurationId === rule.id,
    ),
  ).toHaveLength(0);
  expect(
    (await (await request.get('/api/prices')).json()).find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rule.id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('40.0000');
  body.lines[1].prices = line.prices;
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', body);
  expect(receipt.lots).toHaveLength(2);
  const details = await Promise.all(
    receipt.lots.map(
      async (l) => (await (await request.get(`/api/inventory/lots/${l.id}`)).json()) as LotDetail,
    ),
  );
  expect(details.map((d) => d.lot.unitCostUsd)).toEqual([null, null]);
  for (const [index, detail] of details.entries())
    await historicalLotCost(detail.lot.id, ['25.0000', '27.0000'][index]!);
  expect(
    (await (await request.get('/api/prices')).json()).find(
      (p: { configurationId: string; presentation: string }) =>
        p.configurationId === rule.id && p.presentation === 'box',
    ).promoUsd,
  ).toBe('42.0000');
});
