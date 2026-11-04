import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
import { loginRequest } from './helpers/auth';
import type { Catalog, LotDetail, ReceiptResult, Supplier } from '../../packages/domain/src/index';
dotenv.config({ quiet: true });
const headers = (key = randomUUID()) => ({
  Origin: 'http://127.0.0.1:3200',
  'Idempotency-Key': key,
});
test.beforeEach(async ({ request }) => loginRequest(request));
async function post<T>(
  request: APIRequestContext,
  path: string,
  data: unknown,
  key?: string,
): Promise<T> {
  const response = await request.post(path, { headers: headers(key), data });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
async function supplier(request: APIRequestContext): Promise<Supplier> {
  return post(request, '/api/suppliers', {
    name: `DEMO proveedor ${randomUUID()}`,
    notes: 'Solo pruebas automatizadas',
  });
}
async function receive(request: APIRequestContext, boxes = 3, caliber = '80', override?: number) {
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const rule = catalog.configurations.find(
    (item) => item.variety === 'Gala' && item.caliber === caliber,
  )!;
  const vendor = await supplier(request);
  const result = await post<ReceiptResult>(request, '/api/receipts', {
    supplierId: vendor.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt: new Date().toISOString(),
    isDemo: true,
    lines: [
      {
        configurationId: rule.id,
        boxes,
        unitCostUsd: '0.10',
        ...(override ? { blistersPerBox: override } : {}),
      },
    ],
  });
  return { ...result, lotId: result.lots[0].id, rule, vendor };
}
async function detail(request: APIRequestContext, id: string): Promise<LotDetail> {
  const response = await request.get(`/api/inventory/lots/${id}`);
  expect(response.ok()).toBe(true);
  return response.json();
}
const operation = (
  request: APIRequestContext,
  id: string,
  kind: string,
  data: unknown,
  key?: string,
) =>
  post<{ movementId: string; lotId: string; usedContainers?: { id: string; quantity: number }[] }>(
    request,
    `/api/inventory/lots/${id}/${kind}`,
    data,
    key,
  );
async function database(fn: (client: Client) => Promise<void>) {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  url.pathname = '/manzanas_maracay_test';
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.port !== '55432')
    throw new Error('Solo PostgreSQL local de pruebas.');
  const client = new Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query('begin');
    await fn(client);
  } finally {
    await client.query('rollback');
    await client.end();
  }
}
test('recepción 3 cajas, retiro 1 y luego 4: conservación, prioridad abierta y contenedor vacío', async ({
  request,
}) => {
  const receipt = await receive(request, 3, '80', 5);
  let state = await detail(request, receipt.lotId);
  expect(state.lot.closedBoxes).toBe(3);
  expect(state.lot.equivalentIntactBlisters).toBe(15);
  expect(
    state.containers.every(
      (c) => c.countedPieces === null && c.quantity === 1 && c.state === 'sealed',
    ),
  ).toBe(true);
  const first = await operation(request, receipt.lotId, 'withdraw-blisters', {
    quantity: 1,
    reason: 'Retiro interno DEMO de prueba',
  });
  state = await detail(request, receipt.lotId);
  expect(state.lot).toMatchObject({
    closedBoxes: 2,
    openBoxes: 1,
    intactBlisters: 4,
    equivalentIntactBlisters: 14,
  });
  const open = state.containers.find((c) => c.kind === 'box' && c.state === 'open')!;
  const remaining = state.containers
    .filter((c) => c.parentId === open.id && c.quantity > 0)
    .map((c) => c.id);
  const second = await operation(request, receipt.lotId, 'withdraw-blisters', {
    quantity: 4,
    reason: 'Agotar caja abierta de prueba',
  });
  expect(second.usedContainers?.map((c) => c.id).sort()).toEqual(remaining.sort());
  state = await detail(request, receipt.lotId);
  expect(state.lot).toMatchObject({
    closedBoxes: 2,
    openBoxes: 0,
    intactBlisters: 0,
    equivalentIntactBlisters: 10,
  });
  expect(state.containers.find((c) => c.id === open.id)?.state).toBe('empty');
  expect(state.movements.find((m) => m.id === first.movementId)?.kind).toBe('dispatch');
});
test('snapshot de lote, sobrescritura y calibre 180 independiente de piezas', async ({
  request,
}) => {
  const received = await receive(request, 1, '180', 4);
  expect((await detail(request, received.lotId)).containers[0].countedPieces).toBeNull();
  const rule = received.rule;
  const edit = await request.patch(`/api/catalog/configurations/${rule.id}`, {
    headers: headers(),
    data: { blistersPerBox: 6, notes: rule.notes, version: rule.version },
  });
  expect(edit.status()).toBe(200);
  try {
    expect((await detail(request, received.lotId)).lot.blistersPerBox).toBe(4);
    const overridden = await receive(request, 1, '180', 7);
    expect((await detail(request, overridden.lotId)).lot.blistersPerBox).toBe(7);
    expect((await detail(request, received.lotId)).lot.blistersPerBox).toBe(4);
    const usual = await receive(request, 1, '180');
    expect((await detail(request, usual.lotId)).lot.blistersPerBox).toBe(6);
  } finally {
    const updated: Catalog = await (await request.get('/api/catalog')).json();
    const current = updated.configurations.find((c) => c.id === rule.id)!;
    const restored = await request.patch(`/api/catalog/configurations/${rule.id}`, {
      headers: headers(),
      data: { blistersPerBox: rule.blistersPerBox, notes: rule.notes, version: current.version },
    });
    expect(restored.status()).toBe(200);
  }
});
test('media caja por conteo real: 37 = 18 + 19; rechaza descuadre sin mutar', async ({
  request,
}) => {
  const received = await receive(request, 1);
  const initial = await detail(request, received.lotId);
  const box = initial.containers[0];
  const invalid = await request.post(`/api/inventory/lots/${received.lotId}/prepare-half`, {
    headers: headers(),
    data: {
      containerId: box.id,
      countedBefore: 37,
      preparedPieces: 18,
      remainingPieces: 20,
      reason: 'Conteo inválido DEMO',
    },
  });
  expect(invalid.status()).toBe(400);
  expect((await detail(request, received.lotId)).lot.closedBoxes).toBe(1);
  await operation(request, received.lotId, 'prepare-half', {
    containerId: box.id,
    countedBefore: 37,
    preparedPieces: 18,
    remainingPieces: 19,
    reason: 'Preparación por conteo real DEMO',
  });
  const state = await detail(request, received.lotId);
  expect(state.lot).toMatchObject({
    closedBoxes: 0,
    openBoxes: 1,
    preparedHalfBoxes: 1,
    preparedPieces: 18,
    loosePieces: 19,
    equivalentIntactBlisters: 0,
  });
  expect(state.lot.preparedPieces + state.lot.loosePieces).toBe(37);
});
test('abrir caja y blíster, preparar mitad y ajustar fruta conserva unidades', async ({
  request,
}) => {
  const received = await receive(request, 1, '80', 5);
  let state = await detail(request, received.lotId);
  await operation(request, received.lotId, 'open-box', {
    containerId: state.containers[0].id,
    reason: 'Apertura física de caja DEMO',
  });
  state = await detail(request, received.lotId);
  expect(state.lot.intactBlisters).toBe(5);
  const blister = state.containers.find((c) => c.unit === 'intact_blister')!;
  await operation(request, received.lotId, 'open-blister', {
    containerId: blister.id,
    countedPieces: 37,
    reason: 'Conteo físico de blíster DEMO',
  });
  state = await detail(request, received.lotId);
  expect(state.lot).toMatchObject({ intactBlisters: 4, openBlisters: 1, loosePieces: 37 });
  await operation(request, received.lotId, 'prepare-half', {
    containerId: blister.id,
    countedBefore: 37,
    preparedPieces: 18,
    remainingPieces: 19,
    reason: 'Media caja preparada DEMO',
  });
  state = await detail(request, received.lotId);
  expect(state.lot).toMatchObject({ intactBlisters: 4, loosePieces: 19, preparedPieces: 18 });
  const loss = await operation(request, received.lotId, 'adjust', {
    containerId: blister.id,
    quantityDelta: -1,
    piecesDelta: -1,
    reason: 'Una pieza dañada en prueba DEMO',
  });
  expect((await detail(request, received.lotId)).lot.loosePieces).toBe(18);
  await post(request, `/api/inventory/movements/${loss.movementId}/reverse`, {
    reason: 'Corregir conteo de prueba DEMO',
  });
  expect((await detail(request, received.lotId)).lot.loosePieces).toBe(19);
});
test('concurrencia sobre último blíster y reintento idempotente descuentan una sola vez', async ({
  request,
}) => {
  const received = await receive(request, 1, '80', 1),
    path = `/api/inventory/lots/${received.lotId}/withdraw-blisters`,
    data = { quantity: 1, reason: 'Retiro concurrente de prueba DEMO' };
  const results = await Promise.all([
    request.post(path, { headers: headers(), data }),
    request.post(path, { headers: headers(), data }),
  ]);
  expect(results.map((r) => r.status()).sort()).toEqual([201, 409]);
  expect((await detail(request, received.lotId)).lot).toMatchObject({
    closedBoxes: 0,
    openBoxes: 0,
    intactBlisters: 0,
  });
  const duplicate = await receive(request, 1, '80', 1),
    key = randomUUID(),
    duplicatePath = `/api/inventory/lots/${duplicate.lotId}/withdraw-blisters`;
  const retries = await Promise.all([
    request.post(duplicatePath, { headers: headers(key), data }),
    request.post(duplicatePath, { headers: headers(key), data }),
  ]);
  expect(retries.map((r) => r.status())).toEqual([201, 201]);
  expect(await retries[0].json()).toEqual(await retries[1].json());
  const state = await detail(request, duplicate.lotId);
  expect(state.movements.filter((m) => m.kind === 'dispatch')).toHaveLength(1);
  const changed = await request.post(duplicatePath, {
    headers: headers(key),
    data: { ...data, quantity: 2 },
  });
  expect(changed.status()).toBe(409);
});
test('reversa restaura estado completo, conserva historial y rechaza dependencias posteriores', async ({
  request,
}) => {
  const received = await receive(request, 3, '80', 5);
  const withdrawal = await operation(request, received.lotId, 'withdraw-blisters', {
    quantity: 1,
    reason: 'Retiro interno a revertir DEMO',
  });
  const reversal = await post<{ movementId: string }>(
    request,
    `/api/inventory/movements/${withdrawal.movementId}/reverse`,
    { reason: 'Corrección del retiro de prueba DEMO' },
  );
  let state = await detail(request, received.lotId);
  expect(state.lot).toMatchObject({
    closedBoxes: 3,
    openBoxes: 0,
    intactBlisters: 0,
    equivalentIntactBlisters: 15,
  });
  expect(state.movements.find((m) => m.id === withdrawal.movementId)?.reversedBy).toBe(
    reversal.movementId,
  );
  expect(
    (
      await request.post(`/api/inventory/movements/${withdrawal.movementId}/reverse`, {
        headers: headers(),
        data: { reason: 'Intento de segunda reversa' },
      })
    ).status(),
  ).toBe(409);
  const first = await operation(request, received.lotId, 'withdraw-blisters', {
    quantity: 1,
    reason: 'Primera salida de prueba DEMO',
  });
  await operation(request, received.lotId, 'withdraw-blisters', {
    quantity: 1,
    reason: 'Segunda salida de prueba DEMO',
  });
  expect(
    (
      await request.post(`/api/inventory/movements/${first.movementId}/reverse`, {
        headers: headers(),
        data: { reason: 'Reversa con movimientos posteriores' },
      })
    ).status(),
  ).toBe(409);
  state = await detail(request, received.lotId);
  expect(state.lot.equivalentIntactBlisters).toBe(13);
  await database(async (client) => {
    await expect(
      client.query('delete from inventory_movements where id=$1', [withdrawal.movementId]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
test('proveedor con edición concurrente y recepción multilínea atómica', async ({ request }) => {
  const vendor = await supplier(request);
  const edit = {
    name: vendor.name,
    taxId: '',
    phone: '',
    notes: 'DEMO',
    active: false,
    version: vendor.version,
  };
  const edits = await Promise.all([
    request.patch(`/api/suppliers/${vendor.id}`, { headers: headers(), data: edit }),
    request.patch(`/api/suppliers/${vendor.id}`, { headers: headers(), data: edit }),
  ]);
  expect(edits.map((r) => r.status()).sort()).toEqual([200, 409]);
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const rule = catalog.configurations[0];
  const body = {
    supplierId: vendor.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt: new Date().toISOString(),
    isDemo: true,
    lines: [{ configurationId: rule.id, boxes: 1, unitCostUsd: '0.10' }],
  };
  expect((await request.post('/api/receipts', { headers: headers(), data: body })).status()).toBe(
    400,
  );
  const active = await supplier(request);
  body.supplierId = active.id;
  const invalid = await request.post('/api/receipts', {
    headers: headers(),
    data: {
      ...body,
      lines: [...body.lines, { configurationId: randomUUID(), boxes: 1, unitCostUsd: '0.10' }],
    },
  });
  expect(invalid.status()).toBe(400);
  await database(async (client) => {
    expect(
      (await client.query('select count(*) from purchases where reference=$1', [body.reference]))
        .rows[0].count,
    ).toBe('0');
  });
  const valid = await post<ReceiptResult>(request, '/api/receipts', {
    ...body,
    lines: [
      ...body.lines,
      { configurationId: rule.id, boxes: 2, unitCostUsd: '0.20', blistersPerBox: 7 },
    ],
  });
  expect(valid.lots).toHaveLength(2);
});
test('PostgreSQL rechaza proyección sin ledger y modificación de instantáneas', async ({
  request,
}) => {
  const received = await receive(request, 1);
  const state = await detail(request, received.lotId);
  const box = state.containers[0];
  await database(async (client) => {
    await client.query("update containers set state='empty' where id=$1", [box.id]);
    await client.query('update stock_balances set quantity=0,cost_usd=0 where container_id=$1', [
      box.id,
    ]);
    await expect(client.query('set constraints all immediate')).rejects.toMatchObject({
      code: '23514',
    });
  });
  await database(async (client) => {
    await expect(
      client.query('update lots set blisters_per_box_snapshot=99 where id=$1', [received.lotId]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  await database(async (client) => {
    await expect(
      client.query('update inventory_entries set quantity_delta=99 where movement_id=$1', [
        received.movementId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  await database(async (client) => {
    expect(
      (
        await client.query('select count(*) from inventory_entries where movement_id=$1', [
          received.movementId,
        ])
      ).rows[0].count,
    ).toBe('1');
    await expect(
      client.query(
        `insert into inventory_entries(movement_id,container_id,unit,quantity_delta,pieces_delta,before_state,after_state)
      select movement_id,container_id,unit,quantity_delta,pieces_delta,before_state,after_state
      from inventory_entries where movement_id=$1 limit 1`,
        [received.movementId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
