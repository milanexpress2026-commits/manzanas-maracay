import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import type {
  Catalog,
  LotDetail,
  PaymentDetail,
  ReceiptResult,
  SaleDetail,
} from '../../packages/domain/src/index';
import { loginRequest } from './helpers/auth';
import {
  commerceHeaders,
  commercePost,
  commercialCustomer,
  commercialReceipt,
} from './helpers/commerce';
import { habitualOptions, receiptCounts, receiptDatabase } from './helpers/receipt-v42';
import {
  manualSale,
  manualSaleInput,
  receiveUnknown,
  unknownCostLine,
  unpricedProduct,
} from './helpers/operation-v45';
import { syntheticPaymentRates } from './helpers/rates';

test.beforeEach(async ({ request }) => loginRequest(request));

test('V4.5 pera calibre130 no infiere blíster: exige confirmar empaque y conserva la elección', async ({
  request,
}) => {
  let catalog: Catalog = await (await request.get('/api/catalog')).json();
  const pear =
    catalog.fruits.find((fruit) => fruit.name.toLowerCase() === 'pera') ??
    (await commercePost<{ id: string }>(request, '/api/catalog/fruits', { name: 'Pera' }));
  if (!catalog.calibers.some((caliber) => caliber.fruitId === pear.id && caliber.label === '130'))
    await commercePost(request, '/api/catalog/calibers', { fruitId: pear.id, label: '130' });
  const body = {
    schemaVersion: 3,
    lines: [
      {
        product: {
          templateId: 'pear',
          templateVersion: 'v4.5',
          varietyName: 'Packham',
          caliberLabel: '130',
        },
        boxes: 1,
      },
    ],
  };
  const before = await receiptCounts();
  const pending = await request.post('/api/receipts', { headers: commerceHeaders(), data: body });
  expect(pending.status()).toBe(400);
  expect(await receiptCounts()).toEqual(before);
  const received = await commercePost<ReceiptResult>(request, '/api/receipts', {
    ...body,
    lines: [
      {
        ...body.lines[0],
        packing: {
          confirmed: true,
          packingModel: 'blister',
          halfPreparation: 'none',
          allowedPresentations: ['box', 'blister'],
          blistersPerBox: 6,
          boxWeightKg: null,
        },
      },
    ],
  });
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${received.lots[0]!.id}`)
  ).json();
  expect(detail.lot).toMatchObject({ closedBoxes: 1, blistersPerBox: 6 });
  catalog = await (await request.get('/api/catalog')).json();
  const confirmed = catalog.configurations.find((rule) => rule.id === detail.lot.configurationId)!;
  const next = await receiveUnknown(request, confirmed, 1);
  expect(
    (await (await request.get(`/api/inventory/lots/${next.lots[0]!.id}`)).json()).lot
      .blistersPerBox,
  ).toBe(6);
});

test('V4.5 SQL rechaza redondeo inventado aunque las aplicaciones sumen el importe declarado', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const customer = await commercialCustomer(request);
  await receiveUnknown(request, rule, 2);
  const original = await manualSale(request, customer, rule, 1, '80');
  const other = await manualSale(request, customer, rule, 1, '80');
  const rates = await syntheticPaymentRates({ usdt: '0.60000000' });
  const payment = await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'VES',
    amount: '24.01',
    method: 'bolivares',
    rateId: rates.usdt.id,
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: original.id, amountUsd: '40.01' }],
  });
  expect(payment.conversionRoundingUsd).toBe('-0.01');
  const before = await receiptCounts();
  for (const [amountUsd, rounding] of [
    ['40.01', '0.00'],
    ['40.03', '0.01'],
  ])
    await receiptDatabase(async (db) => {
      const target = randomUUID();
      await db.query(
        `insert into payments select (jsonb_populate_record(null::payments,
      to_jsonb(source)||jsonb_build_object('id',$2::uuid,'number',$3::text,'idempotency_key',$4::uuid,
      'creation_transaction',txid_current(),'amount_usd',$5::numeric,'conversion_rounding_usd',$6::numeric))).*
      from payments source where id=$1`,
        [payment.id, target, `QA-invalid-${randomUUID()}`, randomUUID(), amountUsd, rounding],
      );
      await db.query(
        'insert into payment_applications(payment_id,sale_id,client_id,amount_usd,balance_after_usd) values($1,$2,$3,$4,80-$4::numeric)',
        [target, other.id, customer.id, amountUsd],
      );
      await expect(
        db.query('select validate_commercial_payment($1)', [target]),
      ).rejects.toMatchObject({
        code: '23514',
        message:
          'Payment requires its verified historical rate and exact auditable settlement rounding',
      });
    }, true);
  expect(await receiptCounts()).toEqual(before);
  expect((await (await request.get(`/api/sales/${other.id}`)).json()).balanceUsd).toBe('80.00');
});

test('V4.5 costo desconocido: abrir, contar 37, preparar 18+19 y vender/revertir media conserva NULL', async ({
  request,
}) => {
  const rule = await unpricedProduct(request, 'blister', true);
  const customer = await commercialCustomer(request);
  const receipt = await receiveUnknown(request, rule, 10);
  const path = `/api/inventory/lots/${receipt.lots[0]!.id}`;
  let detail: LotDetail = await (await request.get(path)).json();
  await commercePost(request, path + '/open-box', {
    containerId: detail.containers[0]!.id,
    reason: 'QA abrir caja sin costo de compra',
  });
  detail = await (await request.get(path)).json();
  const blister = detail.containers.find((row) => row.unit === 'intact_blister')!;
  await commercePost(request, path + '/open-blister', {
    containerId: blister.id,
    countedPieces: 37,
    reason: 'QA conteo físico conocido sin costo',
  });
  await commercePost(request, path + '/prepare-half', {
    containerId: blister.id,
    countedBefore: 37,
    preparedPieces: 18,
    remainingPieces: 19,
    reason: 'QA preparar media con conteo exacto',
  });
  const prepared: LotDetail = await (await request.get(path)).json();
  expect(prepared.lot).toMatchObject({
    closedBoxes: 9,
    intactBlisters: 3,
    preparedHalfBoxes: 1,
    preparedPieces: 18,
    loosePieces: 19,
  });
  const sale = await manualSale(request, customer, rule, 1, '20', 'half_box');
  expect(sale.costUsd).toBeNull();
  const sold: LotDetail = await (await request.get(path)).json();
  expect(sold.lot).toMatchObject({ preparedHalfBoxes: 0, preparedPieces: 0, loosePieces: 19 });
  await receiptDatabase(async (db) => {
    const costs = (
      await db.query(
        'select s.cost_usd from stock_balances s join containers c on c.id=s.container_id where c.lot_id=$1 and s.quantity>0',
        [receipt.lots[0]!.id],
      )
    ).rows;
    expect(costs.length).toBeGreaterThan(10);
    expect(costs.every((row) => row.cost_usd === null)).toBe(true);
    expect(
      (
        await db.query(
          'select cost_usd,dispatched_container_cost(movement_id,container_id) provenance from sale_allocations where sale_line_id=$1',
          [sale.lines[0]!.id],
        )
      ).rows,
    ).toEqual([{ cost_usd: null, provenance: null }]);
  });
  await receiptDatabase(async (db) => {
    await expect(
      db.query('update sale_allocations set cost_usd=0 where sale_line_id=$1', [sale.lines[0]!.id]),
    ).rejects.toMatchObject({ code: '23514' });
  }, true);
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'QA reversa media sin inventar costo',
  });
  const restored: LotDetail = await (await request.get(path)).json();
  expect(restored.containers.map(({ version, ...physical }) => physical)).toEqual(
    prepared.containers.map(({ version, ...physical }) => physical),
  );
  for (const container of restored.containers) {
    const original = prepared.containers.find((row) => row.id === container.id)!;
    expect(container.version).toBe(
      original.version + (original.unit === 'prepared_half_box' ? 2 : 0),
    );
  }
  expect(restored.lot).toMatchObject({ closedBoxes: 9, preparedPieces: 18, loosePieces: 19 });
});

test('V4.5 alimento requiere unidad comercial explícita y su snapshot no puede reclasificarse', async ({
  request,
}) => {
  const options = await habitualOptions(request);
  const option = options.options.find((row) => row.templateId === 'capers')!;
  const before = await receiptCounts();
  const missing = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: { schemaVersion: 3, lines: [{ product: option.product, boxes: 2 }] },
  });
  expect(missing.status()).toBe(400);
  expect(await receiptCounts()).toEqual(before);
  const received = await commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    lines: [
      {
        product: option.product,
        boxes: 2,
        packing: {
          confirmed: true,
          packingModel: 'whole',
          halfPreparation: 'none',
          allowedPresentations: ['box'],
          blistersPerBox: null,
          boxWeightKg: null,
          commercialUnitLabel: 'Envase confirmado QA',
        },
      },
    ],
  });
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${received.lots[0]!.id}`)
  ).json();
  expect(detail.lot).toMatchObject({ closedBoxes: 2, blistersPerBox: null });
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const rule = catalog.configurations.find((row) => row.id === detail.lot.configurationId)!;
  const customer = await commercialCustomer(request);
  const sale = await manualSale(request, customer, rule, 1, '5');
  expect(sale.lines[0]!.commercialUnitLabel).toBe('Envase confirmado QA');
  await receiptDatabase(async (db) => {
    await expect(
      db.query('update packing_rules set commercial_unit_label=$2 where id=$1', [
        rule.id,
        'Unidad diferente QA',
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  }, true);
});

test('V4.5 catálogo completo diferencia tres graneles, peras confirmadas y cuatro alimentos pendientes', async ({
  request,
}) => {
  const before = await receiptCounts();
  const catalogBefore = await (await request.get('/api/catalog')).json();
  const options = await habitualOptions(request);
  for (const variety of ['Roja normal', 'Gala', 'Verde']) {
    for (const caliber of ['150', '163', '175', '198', '216', '232', '235', 'PC']) {
      const option = options.options.find(
        (row) =>
          row.templateId === 'apple_bulk' &&
          row.varietyName?.toLowerCase() === variety.toLowerCase() &&
          row.caliberLabel === caliber,
      );
      expect(option, `${variety} granel ${caliber}`).toBeDefined();
      expect(option!.suggestedPacking).toMatchObject({
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
        blistersPerBox: null,
        boxWeightKg: null,
      });
    }
  }
  for (const variety of ['Forelle', 'Packham']) {
    for (const caliber of ['70', '80', '90', '100', '110', '120', '125', '135', '150', '165']) {
      const option = options.options.find(
        (row) =>
          row.templateId === 'pear' &&
          row.varietyName?.toLowerCase() === variety.toLowerCase() &&
          row.caliberLabel === caliber,
      );
      expect(option, `${variety} ${caliber}`).toBeDefined();
      expect(option!.suggestedPacking?.blistersPerBox).toBe(
        ['135', '150', '165'].includes(caliber) ? 5 : 4,
      );
      expect(option!.suggestedPacking?.allowedPresentations).not.toContain('half_box');
    }
  }
  for (const fruit of ['Pasas', 'Alcaparras', 'Aceituna rellena', 'Aceituna con hueso']) {
    const option = options.options.find((row) => row.fruitName === fruit);
    expect(option, fruit).toBeDefined();
    expect(option!.suggestedPacking).toBeNull();
    expect(option!.caliberLabel).toBeNull();
    expect(option!.varietyName).toBeNull();
  }
  expect(await receiptCounts()).toEqual(before);
  expect(await (await request.get('/api/catalog')).json()).toEqual(catalogBefore);
  const chosen = [
    ['Roja normal', '235', 4],
    ['Gala', 'PC', 6],
    ['Verde', '150', 3],
  ] as const;
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    lines: chosen.map(([variety, caliber, boxes]) => ({
      product: options.options.find(
        (row) =>
          row.templateId === 'apple_bulk' &&
          row.varietyName?.toLowerCase() === variety.toLowerCase() &&
          row.caliberLabel === caliber,
      )!.product,
      boxes,
    })),
  });
  const details: LotDetail[] = await Promise.all(
    receipt.lots.map(async (lot) => (await request.get(`/api/inventory/lots/${lot.id}`)).json()),
  );
  expect(new Set(details.map((detail) => detail.lot.configurationId)).size).toBe(3);
  expect(details.map((detail) => detail.lot.closedBoxes)).toEqual([4, 6, 3]);
  expect(details.every((detail) => detail.lot.blistersPerBox === null)).toBe(true);
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const rule = catalog.configurations.find((row) => row.id === details[0]!.lot.configurationId)!;
  const client = await commercialCustomer(request);
  const invalidPiece = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: {
      ...manualSaleInput(client, rule, 1),
      lines: [{ configurationId: rule.id, presentation: 'piece', quantity: 1, agreedUnitUsd: '1' }],
    },
  });
  expect(invalidPiece.status()).toBe(400);
  await manualSale(request, client, rule, 2, '20', 'half_box');
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot,
  ).toMatchObject({ closedBoxes: 3, preparedHalfBoxes: 0 });
});

test('V4.5 cinco productos sin proveedor, costo ni precio: recepción atómica, doble envío y granel separado', async ({
  request,
}) => {
  const before = await receiptCounts();
  const options = await habitualOptions(request);
  expect(await habitualOptions(request)).toEqual(options);
  expect(await receiptCounts()).toEqual(before);
  const selection = [
    ['apple_traditional', 'Gala', '100', 10],
    ['apple_bulk', 'Gala', 'PC', 6],
    ['apple_bulk', 'Roja normal', '235', 4],
    ['pear', 'Forelle', '125', 5],
    ['grape', 'Verde', null, 2],
  ] as const;
  const lines = selection.map(([template, variety, caliber, boxes]) => {
    const option = options.options.find(
      (row) =>
        row.templateId === template &&
        row.varietyName?.toLowerCase() === variety.toLowerCase() &&
        row.caliberLabel === caliber,
    );
    expect(option, `${template} ${variety} ${caliber}`).toBeDefined();
    return { product: option!.product, boxes };
  });
  const body = { schemaVersion: 3, lines };
  const key = randomUUID();
  const [receipt, retry] = await Promise.all([
    commercePost<ReceiptResult>(request, '/api/receipts', body, key),
    commercePost<ReceiptResult>(request, '/api/receipts', body, key),
  ]);
  expect(retry).toEqual(receipt);
  expect(receipt.lots).toHaveLength(5);
  expect(receipt.receiptNumber).toMatch(/^R-\d{8,}$/);
  const after = await receiptCounts();
  expect(after.suppliers).toBe(before.suppliers);
  expect(after.prices).toBe(before.prices);
  expect(after.price_lists).toBe(before.price_lists);
  expect(after.purchases - before.purchases).toBe(1);
  expect(after.lots - before.lots).toBe(5);
  await receiptDatabase(async (db) => {
    const purchase = (
      await db.query('select supplier_id, reference from purchases where id=$1', [
        receipt.purchaseId,
      ])
    ).rows[0];
    expect(purchase).toEqual({ supplier_id: null, reference: null });
    const lots = (
      await db.query(
        'select id,variant_id,unit_cost_usd,supplier_id from lots where id=any($1::uuid[])',
        [receipt.lots.map((lot) => lot.id)],
      )
    ).rows;
    expect(new Set(lots.map((lot) => lot.variant_id)).size).toBe(5);
    expect(lots.every((lot) => lot.unit_cost_usd === null && lot.supplier_id === null)).toBe(true);
    expect(
      (
        await db.query('select unit_cost_usd from purchase_lines where purchase_id=$1', [
          receipt.purchaseId,
        ])
      ).rows.every((row) => row.unit_cost_usd === null),
    ).toBe(true);
    const costs = (
      await db.query(
        'select s.cost_usd from stock_balances s join containers c on c.id=s.container_id where c.lot_id=any($1::uuid[])',
        [receipt.lots.map((lot) => lot.id)],
      )
    ).rows;
    expect(costs).toHaveLength(27);
    expect(costs.every((row) => row.cost_usd === null)).toBe(true);
  });
  for (const [index, line] of lines.entries()) {
    const detail: LotDetail = await (
      await request.get(`/api/inventory/lots/${receipt.lots[index]!.id}`)
    ).json();
    expect(detail.lot.closedBoxes).toBe(line.boxes);
    expect(detail.lot.unitCostUsd).toBeNull();
    expect(detail.containers.every((row) => row.costUsd === null)).toBe(true);
  }
  const second = await commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    lines: [{ ...lines[1], boxes: 2 }],
  });
  expect(second.purchaseId).not.toBe(receipt.purchaseId);
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[1]!.id}`)).json()).lot
      .closedBoxes,
  ).toBe(6);
  expect(
    (await (await request.get(`/api/inventory/lots/${second.lots[0]!.id}`)).json()).lot.closedBoxes,
  ).toBe(2);
  const invalid = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: {
      schemaVersion: 3,
      lines: [{ ...lines[0], cost: { kind: 'entered', unitCostUsd: '0', accepted: true } }],
    },
  });
  expect(invalid.status()).toBe(400);
  // Different commands materialize the SAME previously virtual SKU concurrently.
  const virtual = options.options.find(
    (row) =>
      row.templateId === 'apple_bulk' && row.varietyName === 'Verde' && row.caliberLabel === '235',
  )!;
  expect(virtual.configurationId).toBeNull();
  const beforeParallel = await receiptCounts();
  const parallel = await Promise.all(
    [2, 3].map((boxes) =>
      commercePost<ReceiptResult>(request, '/api/receipts', {
        schemaVersion: 3,
        lines: [{ product: virtual.product, boxes }],
      }),
    ),
  );
  expect(new Set(parallel.map((row) => row.receiptNumber)).size).toBe(2);
  const afterParallel = await receiptCounts();
  expect(afterParallel.configurations - beforeParallel.configurations).toBe(1);
  expect(afterParallel.purchases - beforeParallel.purchases).toBe(2);
  expect(afterParallel.lots - beforeParallel.lots).toBe(2);
  const parallelLots: LotDetail[] = await Promise.all(
    parallel.map(async (row) =>
      (await request.get(`/api/inventory/lots/${row.lots[0]!.id}`)).json(),
    ),
  );
  expect(new Set(parallelLots.map((row) => row.lot.configurationId)).size).toBe(1);
  expect(parallelLots.reduce((sum, row) => sum + row.lot.closedBoxes, 0)).toBe(5);
});

test('V4.5 precio manual 40 y luego 43 sin price_items: snapshots, reintento y reversa no crean listas', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const client = await commercialCustomer(request);
  const receipt = await receiveUnknown(request, rule, 5);
  const before = await receiptCounts();
  const input = manualSaleInput(client, rule, 2);
  const now = new Date().toISOString();
  const cash = {
    ...input,
    condition: 'cash',
    soldAt: now,
    initialPayment: { currency: 'USD', amount: '80', method: 'usd_cash', receivedAt: now },
  };
  const key = randomUUID();
  const first = await commercePost<SaleDetail>(request, '/api/sales', cash, key);
  expect(first).toMatchObject({
    totalUsd: '80.00',
    balanceUsd: '0.00',
    costUsd: null,
    grossProfitUsd: null,
    discountUsd: null,
    dueDate: null,
    reminderDate: null,
  });
  expect(first.lines[0]).toMatchObject({
    agreedUnitUsd: '40.0000',
    referenceUnitUsd: null,
    quantity: 2,
    totalUsd: '80.00',
    costUsd: null,
  });
  expect(await commercePost<SaleDetail>(request, '/api/sales', cash, key)).toEqual(first);
  const second = await manualSale(request, client, rule, 1, '43');
  expect(second.totalUsd).toBe('43.00');
  expect(second.lines[0]!.referenceUnitUsd).toBeNull();
  expect((await (await request.get(`/api/sales/${first.id}`)).json()).lines).toEqual(first.lines);
  expect((await receiptCounts()).prices).toBe(before.prices);
  await receiptDatabase(async (db) => {
    expect(
      (
        await db.query('select count(*)::int n from price_items where variant_id=$1', [
          rule.variantId,
        ])
      ).rows[0].n,
    ).toBe(0);
    expect(
      (
        await db.query('select cost_usd from sales where id=any($1::uuid[])', [
          [first.id, second.id],
        ])
      ).rows,
    ).toEqual([{ cost_usd: null }, { cost_usd: null }]);
  });
  const cancelled = await commercePost<SaleDetail>(request, `/api/sales/${second.id}/cancel`, {
    reason: 'QA reversa de venta manual no entregada',
  });
  expect(cancelled.status).toBe('cancelled');
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot
      .closedBoxes,
  ).toBe(3);
  for (const price of ['0', '-1']) {
    const bad = await request.post('/api/sales', {
      headers: commerceHeaders(),
      data: manualSaleInput(client, rule, 1, price),
    });
    expect(bad.status()).toBe(400);
  }
  const beforePdf = await receiptCounts();
  const inventoryBeforePdf = await (
    await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)
  ).json();
  fs.mkdirSync('.local/v45/pdf', { recursive: true });
  for (const [name, route] of [
    ['comprobante', `/api/sales/${first.id}/document`],
    ['nota-entrega', `/api/sales/${first.id}/delivery-note`],
    ['recibo', `/api/payments/${first.payments[0]!.id}/document`],
  ])
    for (let attempt = 0; attempt < 2; attempt++) {
      const pdf = await request.get(route!);
      expect(pdf.status()).toBe(200);
      const bytes = await pdf.body();
      expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
      if (attempt === 0) fs.writeFileSync(`.local/v45/pdf/${name}.pdf`, bytes);
    }
  expect(await receiptCounts()).toEqual(beforePdf);
  expect(await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).toEqual(
    inventoryBeforePdf,
  );
});

test('V4.5 FIFO físico mixto conserva costo histórico, admite desconocido y restaura ambos orígenes', async ({
  request,
}) => {
  const rule = await unpricedProduct(request, 'blister');
  const client = await commercialCustomer(request);
  const known = await commercialReceipt(
    request,
    rule,
    2,
    '25',
    new Date(Date.now() - 120000).toISOString(),
  );
  const unknown = await receiveUnknown(
    request,
    rule,
    2,
    new Date(Date.now() - 60000).toISOString(),
  );
  const snapshot = await receiptDatabase(
    async (db) =>
      (await db.query('select to_jsonb(l) value from lots l where id=$1', [known.lots[0]!.id]))
        .rows[0].value,
  );
  const sale = await manualSale(request, client, rule, 3);
  expect(sale.costUsd).toBeNull();
  expect(sale.grossProfitUsd).toBeNull();
  expect(sale.lines[0]!.allocations.filter((row) => row.lotId === known.lots[0]!.id)).toHaveLength(
    2,
  );
  expect(
    sale.lines[0]!.allocations.filter((row) => row.lotId === unknown.lots[0]!.id),
  ).toHaveLength(1);
  await receiptDatabase(async (db) => {
    const { inventory_version: originalVersion, ...originalFields } = snapshot;
    const { inventory_version: currentVersion, ...currentFields } = (
      await db.query('select to_jsonb(l) value from lots l where id=$1', [known.lots[0]!.id])
    ).rows[0].value;
    expect(currentFields).toEqual(originalFields);
    expect(currentVersion).toBe(originalVersion + 1);
    expect(
      (await db.query('select cost_usd from sales where id=$1', [sale.id])).rows[0].cost_usd,
    ).toBeNull();
  });
  await commercePost(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'QA restaurar FIFO conocido y desconocido',
  });
  for (const receipt of [known, unknown])
    expect(
      (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot
        .closedBoxes,
    ).toBe(2);
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${unknown.lots[0]!.id}`)
  ).json();
  await commercePost(request, `/api/inventory/lots/${detail.lot.id}/open-box`, {
    containerId: detail.containers.find((row) => row.state === 'sealed')!.id,
    reason: 'QA abrir caja sin costo de compra',
  });
  await commercePost(request, `/api/inventory/lots/${detail.lot.id}/withdraw-blisters`, {
    quantity: 1,
    reason: 'QA retirar blíster sin costo de compra',
  });
  const opened: LotDetail = await (
    await request.get(`/api/inventory/lots/${detail.lot.id}`)
  ).json();
  expect(opened.lot).toMatchObject({
    closedBoxes: 1,
    intactBlisters: 3,
    equivalentIntactBlisters: 7,
  });
  expect(opened.containers.every((row) => row.costUsd === null)).toBe(true);
  const halves = await unpricedProduct(request, 'halves');
  const halfReceipt = await receiveUnknown(request, halves, 1);
  const halfSale = await manualSale(request, client, halves, 1, '20', 'half_box');
  expect(
    (await (await request.get(`/api/inventory/lots/${halfReceipt.lots[0]!.id}`)).json()).lot,
  ).toMatchObject({ closedBoxes: 0, preparedHalfBoxes: 1 });
  await commercePost(request, `/api/sales/${halfSale.id}/cancel`, {
    reason: 'QA restaurar media comercial sin costo',
  });
  const restored: LotDetail = await (
    await request.get(`/api/inventory/lots/${halfReceipt.lots[0]!.id}`)
  ).json();
  expect(restored.lot.closedBoxes).toBe(1);
  expect(restored.containers.every((row) => row.countedPieces === null)).toBe(true);
});

test('V4.5 USDT 1:1 guarda referencia Bs informativa opcional y nunca cambia la moneda recibida', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const client = await commercialCustomer(request);
  await receiveUnknown(request, rule, 3);
  const rates = await syntheticPaymentRates();
  for (const informational of [true, false]) {
    const input = manualSaleInput(client, rule, 1);
    const sale = await commercePost<SaleDetail>(request, '/api/sales', {
      ...input,
      condition: 'cash',
      initialPayment: {
        currency: 'USDT',
        amount: '40',
        method: 'usdt_transfer',
        receivedAt: new Date().toISOString(),
        ...(informational ? { informationalUsdtRateId: rates.usdt.id } : {}),
      },
    });
    const payment: PaymentDetail = await (
      await request.get(`/api/payments/${sale.payments[0]!.id}`)
    ).json();
    expect(payment).toMatchObject({
      currency: 'USDT',
      amount: '40.00',
      amountUsd: '40.00',
      bcvRate: null,
      usdtRate: null,
    });
    if (informational)
      expect(payment.usdtReferenceRate).toMatchObject({
        id: rates.usdt.id,
        equivalentVes: '2000.00',
      });
    else expect(payment.usdtReferenceRate).toBeNull();
    expect(sale.balanceUsd).toBe('0.00');
  }
});

test('V4.5 Bs exactos liquidan sin residuo con fuente pactada; abonos eligen factura y no revalúan deuda', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const client = await commercialCustomer(request);
  await receiveUnknown(request, rule, 5);
  // A deliberately tiny synthetic quote exposes inverse-conversion rounding; never a market rate.
  const rates = await syntheticPaymentRates({ bcv: '0.37000000', usdt: '0.37000000' });
  for (const basis of ['divisa', 'bcv'] as const) {
    const quote = basis === 'divisa' ? rates.usdt : rates.bcv;
    const wrong = basis === 'divisa' ? rates.bcv : rates.usdt;
    const input = {
      ...manualSaleInput(client, rule, 1, '40.01', 'box', basis),
      condition: 'cash',
      initialPayment: {
        currency: 'VES',
        amount: '14.80',
        method: 'bolivares',
        rateId: quote.id,
        receivedAt: new Date().toISOString(),
      },
    };
    const bad = await request.post('/api/sales', {
      headers: commerceHeaders(),
      data: { ...input, initialPayment: { ...input.initialPayment, rateId: wrong.id } },
    });
    expect(bad.status()).toBe(503);
    const sale = await commercePost<SaleDetail>(request, '/api/sales', input);
    expect(sale).toMatchObject({ totalUsd: '40.01', balanceUsd: '0.00', settlementBasis: basis });
    const payment: PaymentDetail = await (
      await request.get(`/api/payments/${sale.payments[0]!.id}`)
    ).json();
    expect(payment).toMatchObject({
      currency: 'VES',
      amount: '14.80',
      amountUsd: '40.01',
      conversionRoundingUsd: '0.01',
    });
  }
  const selected = await manualSale(request, client, rule, 1);
  const other = await manualSale(request, client, rule, 1);
  await commercePost(request, '/api/payments', {
    clientId: client.id,
    currency: 'USD',
    amount: '20',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: selected.id, amountUsd: '20' }],
  });
  const later = await syntheticPaymentRates({ usdt: '51.12345678' });
  const paymentBody = {
    clientId: client.id,
    currency: 'VES',
    amount: '1022.47',
    method: 'bolivares',
    rateId: later.usdt.id,
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: selected.id, amountUsd: '20' }],
  };
  const key = randomUUID();
  const paid = await commercePost<PaymentDetail>(request, '/api/payments', paymentBody, key);
  expect(await commercePost<PaymentDetail>(request, '/api/payments', paymentBody, key)).toEqual(
    paid,
  );
  expect((await (await request.get(`/api/sales/${selected.id}`)).json()).balanceUsd).toBe('0.00');
  const untouched: SaleDetail = await (await request.get(`/api/sales/${other.id}`)).json();
  expect(untouched.balanceUsd).toBe('40.00');
  expect(untouched.payments).toHaveLength(0);
  const expired = await syntheticPaymentRates({ expired: true });
  const invalid = await request.post('/api/payments', {
    headers: commerceHeaders(),
    data: {
      ...paymentBody,
      rateId: expired.usdt.id,
      applications: [{ saleId: other.id, amountUsd: '20' }],
    },
  });
  expect(invalid.status()).toBe(503);
});

test('V4.5 dos ventas manuales concurrentes de la última caja confirman exactamente una', async ({
  request,
}) => {
  const rule = await unpricedProduct(request);
  const client = await commercialCustomer(request);
  const receipt = await receiveUnknown(request, rule, 1);
  const responses = await Promise.all(
    [40, 43].map((price) =>
      request.post('/api/sales', {
        headers: commerceHeaders(),
        data: manualSaleInput(client, rule, 1, String(price)),
      }),
    ),
  );
  expect(responses.map((response) => response.status()).sort()).toEqual([201, 409]);
  expect(
    (await (await request.get(`/api/inventory/lots/${receipt.lots[0]!.id}`)).json()).lot
      .closedBoxes,
  ).toBe(0);
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  expect(
    catalog.configurations
      .find((row) => row.id === rule.id)!
      .prices.every((price) => price.promoUsd === null && price.regularUsd === null),
  ).toBe(true);
});
