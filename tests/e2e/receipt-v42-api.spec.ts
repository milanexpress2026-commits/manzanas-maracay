import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {
  Catalog,
  InventoryOverview,
  LotDetail,
  PaymentDetail,
  QuickReceiptInput,
  ReceiptResult,
  SaleDetail,
} from '../../packages/domain/src/index';
import { loginRequest } from './helpers/auth';
import {
  commerceHeaders,
  commercePost,
  commercialCustomer,
  commercialProduct,
  commercialSaleInput,
} from './helpers/commerce';
import {
  habitualOptions,
  previousReceiptCost,
  quickLine,
  quickReceipt,
  receiptCounts,
  receiptDatabase,
} from './helpers/receipt-v42';

test.beforeEach(async ({ request }) => loginRequest(request));

test('V4.2 un payload manipulado no agrega peso o blíster a una plantilla de otra presentación', async ({
  request,
}) => {
  const lines: QuickReceiptInput['lines'] = [
    {
      product: { templateId: 'kiwi', templateVersion: 'v4.2' },
      boxes: 1,
      cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
      packing: {
        confirmed: true,
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
        blistersPerBox: null,
        boxWeightKg: '11',
      },
    },
    {
      product: { templateId: 'grape', templateVersion: 'v4.2', varietyName: 'Verde' },
      boxes: 1,
      cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
      packing: {
        confirmed: true,
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
        blistersPerBox: null,
        boxWeightKg: null,
      },
    },
    {
      product: { templateId: 'apple_bulk', templateVersion: 'v4.2', caliberLabel: '232' },
      boxes: 1,
      cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
      packing: {
        confirmed: true,
        packingModel: 'blister',
        halfPreparation: 'none',
        allowedPresentations: ['box', 'blister'],
        blistersPerBox: 4,
        boxWeightKg: null,
      },
    },
    {
      product: {
        templateId: 'apple_traditional',
        templateVersion: 'v4.2',
        varietyName: 'Gala',
        caliberLabel: '100',
      },
      boxes: 1,
      cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
      packing: {
        confirmed: true,
        packingModel: 'whole',
        halfPreparation: 'none',
        allowedPresentations: ['box'],
        blistersPerBox: null,
        boxWeightKg: null,
      },
    },
  ];
  const before = await receiptCounts();
  for (const line of lines) {
    const response = await request.post('/api/receipts', {
      headers: commerceHeaders(),
      data: { schemaVersion: 2, lines: [line] },
    });
    expect(response.status(), await response.text()).toBe(400);
    expect(await receiptCounts()).toEqual(before);
  }
});

test('V4.2 opciones habituales son virtuales: no crean maestros, precios ni operaciones al consultarlas', async ({
  request,
}) => {
  const before = await receiptCounts();
  const catalogBefore = await (await request.get('/api/catalog')).json();
  const first = await habitualOptions(request);
  expect(first.templateVersion).toBe('v4.2');
  expect(await habitualOptions(request)).toEqual(first);
  expect(await receiptCounts()).toEqual(before);
  expect(await (await request.get('/api/catalog')).json()).toEqual(catalogBefore);
  const apples = first.options.filter((option) => option.templateId === 'apple_traditional');
  for (const variety of ['Gala', 'Amarilla', 'Roja normal', 'Verde', 'Pink Lady']) {
    for (const caliber of [
      '80',
      '88',
      '100',
      '113',
      '125',
      '135',
      '150',
      '163',
      '175',
      '198',
      '216',
    ]) {
      const option = apples.find(
        (row) =>
          row.varietyName?.toLowerCase() === variety.toLowerCase() && row.caliberLabel === caliber,
      );
      expect(option, `${variety} ${caliber}`).toBeDefined();
      expect(option!.suggestedPacking?.blistersPerBox).toBe(Number(caliber) <= 100 ? 4 : 5);
    }
  }
  const pears = first.options.filter((option) => option.templateId === 'pear');
  for (const variety of ['Forelle', 'Packcam']) {
    for (const caliber of ['70', '80', '90', '100', '110', '120', '135']) {
      const option = pears.find(
        (row) =>
          row.varietyName?.toLowerCase() === variety.toLowerCase() && row.caliberLabel === caliber,
      );
      expect(option, `${variety} ${caliber}`).toBeDefined();
      expect(option!.suggestedPacking?.blistersPerBox).toBeNull();
    }
  }
  const grapeVarieties = first.options
    .filter((option) => option.templateId === 'grape')
    .map((option) => option.varietyName?.toLowerCase());
  expect(grapeVarieties).toEqual(expect.arrayContaining(['morada', 'roja', 'verde']));
  for (const variety of ['morada', 'roja', 'verde'])
    expect(grapeVarieties.filter((name) => name === variety)).toHaveLength(1);
  for (const templateId of ['apple_bulk', 'kiwi', 'grape']) {
    for (const option of first.options.filter((row) => row.templateId === templateId)) {
      expect(option.suggestedPacking?.blistersPerBox).toBeNull();
      expect(option.suggestedPacking?.allowedPresentations).not.toContain('blister');
    }
  }
  expect(
    first.options.find(
      (option) => option.templateId === 'apple_bulk' && option.caliberLabel === '232',
    ),
  ).toBeDefined();
  for (const fruit of ['Ciruela', 'Nectarina', 'Naranja', 'Mandarina']) {
    const option = first.options.find((row) => row.fruitName.toLowerCase() === fruit.toLowerCase());
    expect(option).toBeDefined();
    expect(option!.suggestedPacking).toBeNull();
  }
});

test('V4.2 recepción multilínea sin proveedor ni referencia: reintentos simultáneos crean un solo documento', async ({
  request,
}) => {
  const first = await commercialProduct(request, 'blister', '40', 4);
  const second = await commercialProduct(request, 'halves');
  const before = await receiptCounts();
  const key = randomUUID();
  const lines = [quickLine(first, 10, '25'), quickLine(second, 3, '31.25')];
  const started = Date.now();
  const [receipt, retry] = await Promise.all([
    quickReceipt(request, lines, {}, key),
    quickReceipt(request, lines, {}, key),
  ]);
  expect(retry).toEqual(receipt);
  expect(receipt.receiptNumber).toMatch(/^R-\d{8,}$/);
  expect(new Date(receipt.receivedAt!).getTime()).toBeGreaterThanOrEqual(started - 1000);
  expect(new Date(receipt.receivedAt!).getTime()).toBeLessThanOrEqual(Date.now());
  expect(receipt.lots).toHaveLength(2);
  const after = await receiptCounts();
  expect(after.suppliers).toBe(before.suppliers);
  expect(after.purchases - before.purchases).toBe(1);
  expect(after.purchase_lines - before.purchase_lines).toBe(2);
  expect(after.lots - before.lots).toBe(2);
  expect(after.movements - before.movements).toBe(2);
  expect(after.prices).toBe(before.prices);
  await receiptDatabase(async (db) => {
    const purchase = (
      await db.query('select supplier_id, reference from purchases where id=$1', [
        receipt.purchaseId,
      ])
    ).rows[0];
    expect(purchase.supplier_id).toBeNull();
    const lots = (
      await db.query('select supplier_id from lots where id=any($1::uuid[])', [
        receipt.lots.map((lot) => lot.id),
      ])
    ).rows;
    expect(lots).toEqual([{ supplier_id: null }, { supplier_id: null }]);
  });
  const overview: InventoryOverview = await (await request.get('/api/inventory')).json();
  for (const [index, boxes] of [10, 3].entries()) {
    const id = receipt.lots[index]!.id;
    const detail: LotDetail = await (await request.get(`/api/inventory/lots/${id}`)).json();
    expect(detail.lot).toMatchObject({ supplierId: null, supplier: null, closedBoxes: boxes });
    expect(overview.lots.some((lot) => lot.id === id)).toBe(true);
  }
  expect(await quickReceipt(request, lines, {}, key)).toEqual(receipt);
  expect(await receiptCounts()).toEqual(after);
});

test('V4.2 números internos únicos con solicitudes concurrentes y una versión de empaque obsoleta no registra nada', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const receipts = await Promise.all(
    Array.from({ length: 4 }, () => quickReceipt(request, [quickLine(rule, 1, '25')])),
  );
  expect(new Set(receipts.map((receipt) => receipt.receiptNumber)).size).toBe(4);
  expect(new Set(receipts.map((receipt) => receipt.purchaseId)).size).toBe(4);
  for (const receipt of receipts) expect(receipt.receiptNumber).toMatch(/^R-\d{8,}$/);
  const before = await receiptCounts();
  const stale = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: {
      schemaVersion: 2,
      lines: [
        {
          ...quickLine(rule, 1, '25'),
          product: { configurationId: rule.id, expectedPackingVersion: rule.version + 1 },
        },
      ],
    },
  });
  expect(stale.status()).toBe(409);
  expect(await receiptCounts()).toEqual(before);
});

test('V4.2 costo anterior requiere aceptación explícita y una propuesta obsoleta revierte toda la recepción', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  expect((await previousReceiptCost(request, rule.id)).previousCost).toBeNull();
  const first = await quickReceipt(request, [quickLine(rule, 2, '25')]);
  const proposed = (await previousReceiptCost(request, rule.id)).previousCost!;
  expect(proposed).toMatchObject({ sourceLotId: first.lots[0]!.id, unitCostUsd: '25.0000' });
  for (const cost of [
    { kind: 'entered', unitCostUsd: '0', accepted: true },
    {
      kind: 'previous',
      sourceLotId: proposed.sourceLotId,
      unitCostUsd: proposed.unitCostUsd,
      accepted: false,
    },
  ]) {
    const response = await request.post('/api/receipts', {
      headers: commerceHeaders(),
      data: {
        schemaVersion: 2,
        lines: [{ product: quickLine(rule, 1, '25').product, boxes: 1, cost }],
      },
    });
    expect(response.status()).toBe(400);
  }
  const acceptedKey = randomUUID();
  const acceptedLines: QuickReceiptInput['lines'] = [
    {
      product: quickLine(rule, 1, '25').product,
      boxes: 1,
      cost: {
        kind: 'previous',
        sourceLotId: proposed.sourceLotId,
        unitCostUsd: proposed.unitCostUsd,
        accepted: true,
      },
    },
  ];
  const accepted = await quickReceipt(request, acceptedLines, {}, acceptedKey);
  expect((await previousReceiptCost(request, rule.id)).previousCost?.sourceLotId).toBe(
    accepted.lots[0]!.id,
  );
  const newest = await quickReceipt(request, [quickLine(rule, 1, '27')]);
  expect((await previousReceiptCost(request, rule.id)).previousCost).toMatchObject({
    sourceLotId: newest.lots[0]!.id,
    unitCostUsd: '27.0000',
  });
  const before = await receiptCounts();
  const stale = await request.post('/api/receipts', {
    headers: commerceHeaders(),
    data: {
      schemaVersion: 2,
      lines: [
        quickLine(rule, 1, '29'),
        {
          product: quickLine(rule, 1, '25').product,
          boxes: 1,
          cost: {
            kind: 'previous',
            sourceLotId: proposed.sourceLotId,
            unitCostUsd: proposed.unitCostUsd,
            accepted: true,
          },
        },
      ],
    },
  });
  expect(stale.status()).toBe(409);
  expect(await receiptCounts()).toEqual(before);
  expect(await quickReceipt(request, acceptedLines, {}, acceptedKey)).toEqual(accepted);
  expect(await receiptCounts()).toEqual(before);
});

test('V4.2 SQL impide proveedor incompatible, número duplicado y renumeración; la API no puede reiniciar la secuencia', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const supplier = await commercePost<{ id: string }>(request, '/api/suppliers', {
    name: `QA V4.2 proveedor ${randomUUID()}`,
  });
  const unspecified = await quickReceipt(request, [quickLine(rule, 1, '25')]);
  const specified = await quickReceipt(request, [quickLine(rule, 1, '27')], {
    supplierId: supplier.id,
  });
  const before = await receiptCounts();
  for (const [lotId, wrongSupplier] of [
    [unspecified.lots[0]!.id, supplier.id],
    [specified.lots[0]!.id, null],
  ]) {
    await receiptDatabase(async (db) => {
      await expect(
        db.query(
          `insert into lots select (jsonb_populate_record(null::lots,
        to_jsonb(source)||jsonb_build_object('id',$2::uuid,'code',$3::text,'supplier_id',$4::uuid))).*
        from lots source where source.id=$1`,
          [lotId, randomUUID(), `QA-invalid-${randomUUID()}`, wrongSupplier],
        ),
      ).rejects.toMatchObject({
        code: '23514',
        message: 'Receipt lot and purchase context disagree',
      });
    }, true);
  }
  await receiptDatabase(async (db) => {
    await expect(
      db.query(
        `insert into purchases select (jsonb_populate_record(null::purchases,
      to_jsonb(source)||jsonb_build_object('id',$2::uuid))).* from purchases source where source.id=$1`,
        [unspecified.purchaseId, randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23505', constraint: 'purchases_receipt_number_uq' });
  }, true);
  await receiptDatabase(async (db) => {
    await expect(
      db.query('update purchases set receipt_number=receipt_number+1000000 where id=$1', [
        unspecified.purchaseId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  }, true);
  await receiptDatabase(async (db) => {
    expect(
      (
        await db.query(
          "select has_sequence_privilege('mm_app','mm_receipt_number_seq','USAGE') as usage,has_sequence_privilege('mm_app','mm_receipt_number_seq','UPDATE') as update",
        )
      ).rows[0],
    ).toEqual({ usage: true, update: false });
  });
  expect(await receiptCounts()).toEqual(before);
});

test('V4.2 costo real 25/27 conserva FIFO, precios acordados, abonos y PDF sin proveedor ficticio', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'whole');
  const customer = await commercialCustomer(request);
  const pricesBefore = (
    (await (await request.get('/api/catalog')).json()) as Catalog
  ).configurations.find((row) => row.id === rule.id)!.prices;
  const first = await quickReceipt(request, [quickLine(rule, 10, '25')], {
    receivedAt: new Date(Date.now() - 120000).toISOString(),
  });
  const second = await quickReceipt(request, [quickLine(rule, 10, '27')], {
    receivedAt: new Date(Date.now() - 60000).toISOString(),
  });
  const sale = await commercePost<SaleDetail>(
    request,
    '/api/sales',
    commercialSaleInput(customer, rule, 12),
  );
  expect(sale).toMatchObject({
    totalUsd: '480.00',
    costUsd: '304.0000',
    grossProfitUsd: '176.0000',
    balanceUsd: '480.00',
  });
  expect(
    sale.lines[0]!.allocations.filter((allocation) => allocation.lotId === first.lots[0]!.id),
  ).toHaveLength(10);
  expect(
    sale.lines[0]!.allocations.filter((allocation) => allocation.lotId === second.lots[0]!.id),
  ).toHaveLength(2);
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${second.lots[0]!.id}`)
  ).json();
  expect(detail.lot).toMatchObject({ closedBoxes: 8, supplierId: null, unitCostUsd: '27.0000' });
  await commercePost<PaymentDetail>(request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '480',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '480' }],
  });
  const paid: SaleDetail = await (await request.get(`/api/sales/${sale.id}`)).json();
  expect(paid).toMatchObject({ totalUsd: '480.00', costUsd: '304.0000', balanceUsd: '0.00' });
  expect(paid.lines).toEqual(sale.lines);
  expect(
    ((await (await request.get('/api/catalog')).json()) as Catalog).configurations.find(
      (row) => row.id === rule.id,
    )!.prices,
  ).toEqual(pricesBefore);
  for (let attempt = 0; attempt < 2; attempt++) {
    const pdf = await request.get(`/api/sales/${sale.id}/document`);
    expect(pdf.status()).toBe(200);
    expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  }
});

test('V4.2 excepción de blíster solo afecta al lote nuevo y nunca reescribe el empaque confirmado', async ({
  request,
}) => {
  const rule = await commercialProduct(request, 'blister', '40', 4);
  const packingBefore = (
    (await (await request.get('/api/catalog')).json()) as Catalog
  ).configurations.find((row) => row.id === rule.id);
  const first = await quickReceipt(request, [quickLine(rule, 2, '25')]);
  const original: LotDetail = await (
    await request.get(`/api/inventory/lots/${first.lots[0]!.id}`)
  ).json();
  const exceptional = await quickReceipt(request, [
    {
      ...quickLine(rule, 1, '27'),
      blisterOverride: {
        blistersPerBox: 5,
        confirmed: true,
        reason: 'QA lote real recibido con cinco bandejas',
      },
    },
  ]);
  const detail: LotDetail = await (
    await request.get(`/api/inventory/lots/${exceptional.lots[0]!.id}`)
  ).json();
  expect(detail.lot).toMatchObject({ blistersPerBox: 5, closedBoxes: 1, unitCostUsd: '27.0000' });
  await receiptDatabase(async (db) => {
    const audits = (
      await db.query(
        'select "after" from audit_events where entity_type=$1 and entity_id=$2 and action=$3',
        ['purchase', exceptional.purchaseId, 'receipt'],
      )
    ).rows;
    expect(audits).toHaveLength(1);
    expect(audits[0].after.confirmations[0]).toMatchObject({
      lotId: exceptional.lots[0]!.id,
      blisterOverride: {
        blistersPerBox: 5,
        confirmed: true,
        reason: 'QA lote real recibido con cinco bandejas',
      },
    });
  });
  expect(await (await request.get(`/api/inventory/lots/${first.lots[0]!.id}`)).json()).toEqual(
    original,
  );
  expect(
    ((await (await request.get('/api/catalog')).json()) as Catalog).configurations.find(
      (row) => row.id === rule.id,
    ),
  ).toEqual(packingBefore);
  const normal = await quickReceipt(request, [quickLine(rule, 1, '28')]);
  expect(
    ((await (await request.get(`/api/inventory/lots/${normal.lots[0]!.id}`)).json()) as LotDetail)
      .lot.blistersPerBox,
  ).toBe(4);
});

test('V4.2 materialización habitual y recepción revierten juntas si otra línea es inválida', async ({
  request,
}) => {
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const apple =
    catalog.fruits.find((fruit) => fruit.name === 'Manzana') ??
    (await commercePost<{ id: string }>(request, '/api/catalog/fruits', { name: 'Manzana' }));
  const exceptionalCaliber = `QA-${randomUUID().slice(0, 16)}`;
  await commercePost(request, '/api/catalog/calibers', {
    fruitId: apple.id,
    label: exceptionalCaliber,
  });
  const before = await receiptCounts();
  const catalogBefore = await (await request.get('/api/catalog')).json();
  const body: QuickReceiptInput = {
    schemaVersion: 2,
    lines: [
      {
        product: {
          templateId: 'apple_traditional',
          templateVersion: 'v4.2',
          varietyName: 'Gala',
          caliberLabel: exceptionalCaliber,
        },
        boxes: 3,
        cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
        packing: {
          confirmed: true,
          packingModel: 'blister',
          halfPreparation: 'pending',
          allowedPresentations: ['box', 'blister'],
          blistersPerBox: 5,
          boxWeightKg: null,
        },
      },
      {
        product: { configurationId: randomUUID(), expectedPackingVersion: 1 },
        boxes: 1,
        cost: { kind: 'entered', unitCostUsd: '27', accepted: true },
      },
    ],
  };
  const response = await request.post('/api/receipts', { headers: commerceHeaders(), data: body });
  expect([400, 404, 409]).toContain(response.status());
  expect(await receiptCounts()).toEqual(before);
  expect(await (await request.get('/api/catalog')).json()).toEqual(catalogBefore);
  // La primera línea era válida: solo el segundo producto provocó el rollback.
  const valid = await quickReceipt(request, [body.lines[0]!]);
  expect(valid.lots).toHaveLength(1);
  const after = await receiptCounts();
  expect(after.variants - before.variants).toBe(1);
  expect(after.configurations - before.configurations).toBe(1);
  expect(after.purchases - before.purchases).toBe(1);
});
