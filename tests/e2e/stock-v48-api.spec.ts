import { expect, test, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { catalogNameKey } from '../../packages/domain/src/index';
import type {
  Configuration,
  ReceiptResult,
  SaleDetail,
  SalePreviewInput,
  SalePreviewResult,
  Presentation,
  LotDetail,
  Catalog,
  HabitualCatalogOptions,
} from '../../packages/domain/src/index';
import { loginRequest } from './helpers/auth';
import {
  commerceHeaders,
  commercePost,
  commercialCustomer,
  commercialReceipt,
} from './helpers/commerce';
import { manualSaleInput, receiveUnknown, unknownCostLine } from './helpers/operation-v45';
import { receiptDatabase } from './helpers/receipt-v42';

const origin = { Origin: 'http://127.0.0.1:3200' };
const tables = [
  'fruits',
  'varieties',
  'calibers',
  'product_variants',
  'packing_rules',
  'suppliers',
  'clients',
  'purchases',
  'purchase_lines',
  'lots',
  'containers',
  'stock_balances',
  'inventory_movements',
  'inventory_entries',
  'inventory_cost_entries',
  'inventory_cost_openings',
  'sales',
  'sale_lines',
  'sale_allocations',
  'payments',
  'payment_applications',
  'sale_cancellations',
  'payment_reversals',
  'sale_date_events',
  'command_receipts',
  'audit_events',
  'price_items',
  'price_lists',
  'bcv_rates',
  'usdt_rates',
] as const;
async function fingerprint() {
  return receiptDatabase(async (db) => {
    const result: Record<string, unknown> = {};
    for (const table of tables)
      result[table] = (
        await db.query(`select count(*)::int count,
      md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${table} t`)
      ).rows[0];
    return result;
  });
}
async function product(
  request: APIRequestContext,
  model: 'whole' | 'blister' | 'halves' = 'whole',
  blisters = 5,
  identity: object = {},
) {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `QA V4.8 ${randomUUID()}`,
  });
  return commercePost<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    commercialLine: 'QA V4.8',
    packingModel: model,
    halfPreparation: model === 'halves' ? 'commercial' : model === 'blister' ? 'counted' : 'none',
    allowedPresentations:
      model === 'whole'
        ? ['box']
        : model === 'halves'
          ? ['box', 'half_box']
          : ['box', 'blister', 'half_box'],
    blistersPerBox: model === 'blister' ? blisters : null,
    confirmationStatus: 'confirmed',
    ...identity,
  });
}
const previewLine = (
  rule: Configuration,
  quantity: number,
  presentation: Presentation = 'box',
) => ({ lineKey: randomUUID(), configurationId: rule.id, presentation, quantity });
const cart = (...lines: SalePreviewInput['lines']): SalePreviewInput => ({
  soldAt: new Date().toISOString(),
  lines,
});
async function preview(request: APIRequestContext, body: SalePreviewInput) {
  const response = await request.post('/api/inventory/sale-preview', {
    headers: origin,
    data: body,
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<SalePreviewResult>;
}
async function lot(request: APIRequestContext, id: string): Promise<LotDetail> {
  const response = await request.get('/api/inventory/lots/' + id);
  expect(response.status()).toBe(200);
  return response.json();
}
function saleBody(
  client: Awaited<ReturnType<typeof commercialCustomer>>,
  rule: Configuration,
  body: SalePreviewInput,
) {
  return {
    ...manualSaleInput(client, rule, 1),
    soldAt: body.soldAt,
    lines: body.lines.map(({ lineKey: _, ...line }) => ({ ...line, agreedUnitUsd: '40' })),
  };
}
test.beforeEach(async ({ request }) => loginRequest(request));

test('V4.8 T01–04 disponibilidad 5+4, rechazo 10 y FIFO 9; cuota 6+3 y residual 3', async ({
  request,
}) => {
  const client = await commercialCustomer(request),
    rule = await product(request);
  const a = await receiveUnknown(request, rule, 5),
    b = await receiveUnknown(request, rule, 4);
  const availability = await (await request.get('/api/inventory/sale-availability')).json();
  expect(
    availability.items.find(
      (i: { configurationId: string; presentation: string }) =>
        i.configurationId === rule.id && i.presentation === 'box',
    ).availableQuantity,
  ).toBe(9);
  const before = await fingerprint();
  for (const quantity of [10, 25, 1000])
    expect(await preview(request, cart(previewLine(rule, quantity)))).toMatchObject({
      valid: false,
      reservesStock: false,
      lines: [{ maxQuantity: 9, issueCode: 'stock_insufficient' }],
    });
  const excessive = cart(previewLine(rule, 10));
  const rejected = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: saleBody(client, rule, excessive),
  });
  expect(rejected.status()).toBe(409);
  expect(await rejected.json()).toMatchObject({ commandOutcome: 'rejected' });
  expect(await fingerprint()).toEqual(before);
  const nine = cart(previewLine(rule, 9));
  expect((await preview(request, nine)).valid).toBe(true);
  const key = randomUUID(),
    body = saleBody(client, rule, nine),
    sale = await commercePost<SaleDetail>(request, '/api/sales', body, key);
  expect(sale.lines[0]!.allocations.filter((x) => x.lotId === a.lots[0]!.id)).toHaveLength(5);
  expect(sale.lines[0]!.allocations.filter((x) => x.lotId === b.lots[0]!.id)).toHaveLength(4);
  expect((await lot(request, a.lots[0]!.id)).lot.closedBoxes).toBe(0);
  expect((await lot(request, b.lots[0]!.id)).lot.closedBoxes).toBe(0);
  expect(await commercePost(request, '/api/sales', body, key)).toEqual(sale);

  const duplicateRule = await product(request);
  await receiveUnknown(request, duplicateRule, 9);
  const six = previewLine(duplicateRule, 6),
    four = previewLine(duplicateRule, 4);
  expect(await preview(request, cart(six, four))).toMatchObject({
    valid: false,
    lines: [{ maxQuantity: 5 }, { maxQuantity: 3 }],
  });
  four.quantity = 3;
  expect((await preview(request, cart(four, six))).valid).toBe(true);
  const duplicateSale = await commercePost<SaleDetail>(
    request,
    '/api/sales',
    saleBody(client, duplicateRule, cart(six, four)),
  );
  expect(duplicateSale.lines.map((l) => l.quantity)).toEqual([6, 3]);
  const residualRule = await product(request);
  await receiveUnknown(request, residualRule, 9);
  await commercePost(
    request,
    '/api/sales',
    saleBody(client, residualRule, cart(previewLine(residualRule, 6))),
  );
  expect(await preview(request, cart(previewLine(residualRule, 4)))).toMatchObject({
    valid: false,
    lines: [{ maxQuantity: 3 }],
  });
  const beforeResidualRejection = await fingerprint();
  const rejectedFour = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: saleBody(client, residualRule, cart(previewLine(residualRule, 4))),
  });
  expect(rejectedFour.status(), await rejectedFour.text()).toBe(409);
  expect(await rejectedFour.json()).toMatchObject({ commandOutcome: 'rejected' });
  expect(await fingerprint()).toEqual(beforeResidualRejection);
  await commercePost(
    request,
    '/api/sales',
    saleBody(client, residualRule, cart(previewLine(residualRule, 3))),
  );
  expect((await preview(request, cart(previewLine(residualRule, 1)))).lines[0]!.maxQuantity).toBe(
    0,
  );
});

test('V4.8 T06/T09 cajas y fracciones comparten stock; ambos órdenes conservan las líneas', async ({
  request,
}) => {
  const client = await commercialCustomer(request);
  for (const [model, presentation, bad, good] of [
    ['blister', 'blister', 6, 5],
    ['halves', 'half_box', 3, 2],
  ] as const) {
    const rule = await product(request, model),
      receipt = await receiveUnknown(request, rule, model === 'blister' ? 3 : 2);
    const box = previewLine(rule, model === 'blister' ? 2 : 1),
      fraction = previewLine(rule, bad, presentation);
    const before = await fingerprint();
    for (const lines of [
      [box, fraction],
      [fraction, box],
    ]) {
      const body = cart(...lines);
      expect((await preview(request, body)).valid).toBe(false);
      expect(
        (
          await request.post('/api/sales', {
            headers: commerceHeaders(),
            data: saleBody(client, rule, body),
          })
        ).status(),
      ).toBe(409);
    }
    expect(await fingerprint()).toEqual(before);
    fraction.quantity = good;
    for (const lines of [
      [box, fraction],
      [fraction, box],
    ])
      expect((await preview(request, cart(...lines))).valid).toBe(true);
    const sale = await commercePost<SaleDetail>(
      request,
      '/api/sales',
      saleBody(client, rule, cart(fraction, box)),
    );
    expect(sale.lines.map((l) => l.presentation)).toEqual([presentation, 'box']);
    const stock = (await lot(request, receipt.lots[0]!.id)).lot;
    expect(stock.closedBoxes).toBe(0);
    expect(stock.intactBlisters).toBe(0);
    expect(stock.preparedHalfBoxes).toBe(0);
  }
});

test('V4.8 T07/T19 históricos 4/5/5 no dependen del orden; fecha anterior rechazada', async ({
  request,
}) => {
  const client = await commercialCustomer(request),
    rule = await product(request, 'blister', 4);
  const first = await receiveUnknown(request, rule, 1);
  const later: ReceiptResult[] = [];
  for (let i = 0; i < 2; i++)
    later.push(
      await commercePost<ReceiptResult>(request, '/api/receipts', {
        schemaVersion: 3,
        lines: [
          {
            ...unknownCostLine(rule, 1),
            blisterOverride: {
              blistersPerBox: 5,
              confirmed: true,
              reason: 'QA V4.8 empaque excepcional confirmado para este lote',
            },
          },
        ],
      }),
    );
  const box = previewLine(rule, 2),
    blister = previewLine(rule, 5, 'blister');
  const before = await fingerprint();
  const old = { ...cart(box), soldAt: new Date(Date.now() - 86400000).toISOString() };
  expect(
    (await preview(request, old)).issues.some((i) => i.issueCode === 'receipt_after_sale'),
  ).toBe(true);
  expect(
    (
      await request.post('/api/sales', {
        headers: commerceHeaders(),
        data: saleBody(client, rule, old),
      })
    ).status(),
  ).toBe(400);
  for (const lines of [
    [box, blister],
    [blister, box],
  ])
    expect((await preview(request, cart(...lines))).valid).toBe(true);
  expect(await fingerprint()).toEqual(before);
  const sale = await commercePost<SaleDetail>(
    request,
    '/api/sales',
    saleBody(client, rule, cart(blister, box)),
  );
  expect(sale.lines[0]!.presentation).toBe('blister');
  expect(sale.lines[1]!.presentation).toBe('box');
  const blisterAllocations = sale.lines[0]!.allocations,
    boxAllocations = sale.lines[1]!.allocations;
  expect(blisterAllocations).toHaveLength(5);
  expect(
    blisterAllocations.every((a) => a.lotId === later[1]!.lots[0]!.id && a.quantity === 1),
  ).toBe(true);
  expect(boxAllocations).toHaveLength(2);
  for (const id of [first.lots[0]!.id, later[0]!.lots[0]!.id]) {
    const allocations = boxAllocations.filter((a) => a.lotId === id);
    expect(allocations).toHaveLength(1);
    expect(allocations[0]!.quantity).toBe(1);
  }
  // The public reader orders allocations by transaction timestamp/random UUID,
  // not FIFO. The immutable confirmation audit stores the original physical plan.
  // Check that order directly, then match every persisted allocation and residual.
  const physicalPlan = await receiptDatabase(async (db) => {
    const audit = await db.query<{
      allocations: SaleDetail['lines'][number]['allocations'];
    }>(
      `select after->'allocations' as allocations from audit_events
       where entity_type='sale' and entity_id=$1 and action='confirm'`,
      [sale.id],
    );
    expect(audit.rows).toHaveLength(1);
    return audit.rows[0]!.allocations;
  });
  expect(
    physicalPlan.map(({ saleLineId, lotId, quantity }) => ({ saleLineId, lotId, quantity })),
  ).toEqual([
    { saleLineId: sale.lines[1]!.id, lotId: first.lots[0]!.id, quantity: 1 },
    { saleLineId: sale.lines[1]!.id, lotId: later[0]!.lots[0]!.id, quantity: 1 },
    ...Array.from({ length: 5 }, () => ({
      saleLineId: sale.lines[0]!.id,
      lotId: later[1]!.lots[0]!.id,
      quantity: 1,
    })),
  ]);
  const publicAllocations = [...blisterAllocations, ...boxAllocations];
  expect(new Set(publicAllocations.map((a) => a.containerId)).size).toBe(7);
  expect(publicAllocations).toEqual(expect.arrayContaining(physicalPlan));
  for (const [id, blistersPerBox] of [
    [first.lots[0]!.id, 4],
    [later[0]!.lots[0]!.id, 5],
    [later[1]!.lots[0]!.id, 5],
  ] as const) {
    const detail = await lot(request, id);
    expect(detail.lot).toMatchObject({
      blistersPerBox,
      closedBoxes: 0,
      intactBlisters: 0,
      openBoxes: 0,
    });
    expect(detail.containers.every((container) => container.quantity === 0)).toBe(true);
  }
  // PostgreSQL preserves microseconds; JavaScript Date alone cannot distinguish
  // these two FIFO arrivals or the exact sale/receipt boundary.
  const precise = await product(request);
  const timestamp = new Date(Date.now() - 60000).toISOString().replace(/\.\d{3}Z$/, '.123001Z');
  const newer = timestamp.replace('.123001Z', '.123002Z');
  const earlierReceipt = await receiveUnknown(request, precise, 1, timestamp);
  await receiveUnknown(request, precise, 1, newer);
  const exactDate = { ...cart(previewLine(precise, 2)), soldAt: timestamp };
  expect((await preview(request, exactDate)).lines[0]).toMatchObject({
    maxQuantity: 1,
    issueCode: 'receipt_after_sale',
  });
  exactDate.lines[0]!.quantity = 1;
  expect((await preview(request, exactDate)).valid).toBe(true);
  const exactSale = await commercePost<SaleDetail>(
    request,
    '/api/sales',
    saleBody(client, precise, exactDate),
  );
  expect(exactSale.lines[0]!.allocations[0]!.lotId).toBe(earlierReceipt.lots[0]!.id);
});

test('V4.8 T05 identidad exacta separa Gala tradicional y tres graneles con PC', async ({
  request,
}) => {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `QA manzana V4.8 ${randomUUID()}`,
  });
  const varieties = [];
  for (const name of ['Gala', 'Roja', 'Verde'])
    varieties.push(
      await commercePost<{ id: string }>(request, '/api/catalog/varieties', {
        fruitId: fruit.id,
        name,
      }),
    );
  const calibers = [];
  for (const label of ['150', 'PC'])
    calibers.push(
      await commercePost<{ id: string }>(request, '/api/catalog/calibers', {
        fruitId: fruit.id,
        label,
      }),
    );
  const rules: Configuration[] = [];
  for (let i = 0; i < 4; i++) {
    const traditional = i === 0;
    const rule = await commercePost<Configuration>(request, '/api/catalog/configurations', {
      fruitId: fruit.id,
      varietyId: varieties[traditional ? 0 : i - 1]!.id,
      caliberId: calibers[i <= 1 ? 0 : 1]!.id,
      commercialLine: traditional ? 'Tradicional' : 'A granel',
      packingModel: traditional ? 'blister' : 'halves',
      halfPreparation: traditional ? 'counted' : 'commercial',
      allowedPresentations: traditional ? ['box', 'blister'] : ['box', 'half_box'],
      blistersPerBox: traditional ? 5 : null,
      confirmationStatus: 'confirmed',
    });
    rules.push(rule);
    await receiveUnknown(request, rule, i + 2);
  }
  expect(rules[0]!.variantId).not.toBe(rules[1]!.variantId);
  const before = await fingerprint();
  const result = await preview(request, cart(...rules.map((rule) => previewLine(rule, 1))));
  expect(result.valid).toBe(true);
  expect(result.lines.map((l) => l.maxQuantity)).toEqual([2, 3, 4, 5]);
  expect((await preview(request, cart(previewLine(rules[0]!, 3)))).valid).toBe(false);
  expect(
    (await preview(request, cart(previewLine(rules[1]!, 1, 'blister')))).lines[0]!.issueCode,
  ).toBe('presentation_not_allowed');
  expect(await fingerprint()).toEqual(before);
});

test('V4.8 T10–12 dos sesiones 7+7 y 5+4, costo NULL conservado y replay exacto', async ({
  request,
  playwright,
}) => {
  const other = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3200' });
  await loginRequest(other);
  try {
    const client = await commercialCustomer(request),
      rule = await product(request);
    const known = await commercialReceipt(
      request,
      rule,
      5,
      '25',
      new Date(Date.now() - 60000).toISOString(),
    );
    const unknown = await receiveUnknown(request, rule, 4);
    const body = saleBody(client, rule, cart(previewLine(rule, 7))),
      keys = [randomUUID(), randomUUID()];
    const attempts = await Promise.all(
      [request, other].map((api, i) =>
        api.post('/api/sales', { headers: commerceHeaders(keys[i]), data: body }),
      ),
    );
    expect(attempts.map((r) => r.status()).sort()).toEqual([201, 409]);
    const winner = attempts.findIndex((r) => r.status() === 201),
      saved: SaleDetail = await attempts[winner]!.json();
    expect(await commercePost(request, '/api/sales', body, keys[winner])).toEqual(saved);
    expect(saved.lines[0]!.allocations.filter((a) => a.lotId === known.lots[0]!.id)).toHaveLength(
      5,
    );
    expect(saved.lines[0]!.allocations.filter((a) => a.lotId === unknown.lots[0]!.id)).toHaveLength(
      2,
    );
    await receiptDatabase(async (db) => {
      expect(
        (await db.query('select cost_usd::text from sales where id=$1', [saved.id])).rows[0]
          .cost_usd,
      ).toBeNull();
      expect(
        (
          await db.query(
            `select count(*) filter(where a.cost_usd is null)::int unknown,
        count(*) filter(where a.cost_usd=25)::int known from sale_allocations a join sale_lines l on l.id=a.sale_line_id where l.sale_id=$1`,
            [saved.id],
          )
        ).rows[0],
      ).toEqual({ unknown: 2, known: 5 });
      expect(
        (await db.query('select unit_cost_usd::text from lots where id=$1', [known.lots[0]!.id]))
          .rows[0].unit_cost_usd,
      ).toBe('25.0000');
    });
    expect((await lot(request, unknown.lots[0]!.id)).lot.closedBoxes).toBe(2);
    const exact = await product(request),
      stock = await receiveUnknown(request, exact, 9);
    const validAttempts = await Promise.all(
      [request, other].map((api, i) =>
        api.post('/api/sales', {
          headers: commerceHeaders(),
          data: saleBody(client, exact, cart(previewLine(exact, i ? 4 : 5))),
        }),
      ),
    );
    expect(validAttempts.map((r) => r.status())).toEqual([201, 201]);
    expect((await lot(request, stock.lots[0]!.id)).lot.closedBoxes).toBe(0);
  } finally {
    await other.dispose();
  }
});

test('V4.8 T14–16 contratos estrictos; fallo en última línea revierte factura, pago y stock', async ({
  request,
  playwright,
}) => {
  const client = await commercialCustomer(request),
    rule = await product(request),
    empty = await product(request);
  await receiveUnknown(request, rule, 1);
  const base = cart(previewLine(rule, 1)),
    before = await fingerprint();
  for (const quantity of [0, -1, 1.5, '1e3', 'NaN', null, 1001]) {
    const malformed = { ...base, lines: [{ ...base.lines[0], quantity }] };
    expect(
      (
        await request.post('/api/inventory/sale-preview', { headers: origin, data: malformed })
      ).status(),
    ).toBe(400);
    expect(
      (
        await request.post('/api/sales', {
          headers: commerceHeaders(),
          data: {
            ...saleBody(client, rule, base),
            lines: [
              { configurationId: rule.id, presentation: 'box', quantity, agreedUnitUsd: '40' },
            ],
          },
        })
      ).status(),
    ).toBe(400);
  }
  const tooMany = cart(...Array.from({ length: 51 }, () => previewLine(rule, 1)));
  expect(
    (
      await request.post('/api/inventory/sale-preview', { headers: origin, data: tooMany })
    ).status(),
  ).toBe(400);
  const tooLarge = cart(previewLine(rule, 501), previewLine(rule, 500));
  expect(
    (await preview(request, tooLarge)).issues.some((i) => i.issueCode === 'sale_limit_exceeded'),
  ).toBe(true);
  expect(
    (
      await request.post('/api/sales', {
        headers: commerceHeaders(),
        data: saleBody(client, rule, tooLarge),
      })
    ).status(),
  ).toBe(400);
  const missing = cart({ ...previewLine(rule, 1), configurationId: randomUUID() });
  expect((await preview(request, missing)).lines[0]!.issueCode).toBe('configuration_missing');
  const unauthenticated = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3200' });
  try {
    expect(
      (
        await unauthenticated.post('/api/inventory/sale-preview', { headers: origin, data: base })
      ).status(),
    ).toBe(401);
  } finally {
    await unauthenticated.dispose();
  }
  const failed = saleBody(client, rule, cart(previewLine(rule, 1), previewLine(empty, 1)));
  const response = await request.post('/api/sales', {
    headers: commerceHeaders(),
    data: {
      ...failed,
      condition: 'cash',
      initialPayment: {
        currency: 'USD',
        amount: '80',
        method: 'usd_cash',
        receivedAt: new Date().toISOString(),
      },
    },
  });
  expect(response.status()).toBe(409);
  expect(await response.json()).toMatchObject({ commandOutcome: 'rejected' });
  expect(await fingerprint()).toEqual(before);
});

test('V4.8 T20 preview de 50 líneas/200 cajas es solo lectura y coincide con confirmación y PDF', async ({
  request,
}, testInfo) => {
  test.setTimeout(90000);
  const rule = await product(request),
    client = await commercialCustomer(request);
  for (let n = 0; n < 4; n++) await receiveUnknown(request, rule, 50);
  const body = cart(...Array.from({ length: 50 }, () => previewLine(rule, 4))),
    before = await fingerprint();
  const started = performance.now(),
    result = await preview(request, body),
    elapsed = performance.now() - started;
  expect(result.valid).toBe(true);
  expect(result.lines.every((l) => l.maxQuantity === 4)).toBe(true);
  expect(await fingerprint()).toEqual(before);
  const previewPerformance = JSON.stringify({
    lines: 50,
    boxes: 200,
    receipts: 4,
    elapsedMs: Math.round(elapsed),
    readonly: true,
  });
  console.info('V48_PREVIEW_PERFORMANCE ' + previewPerformance);
  await testInfo.attach('preview-performance', {
    body: previewPerformance,
    contentType: 'application/json',
  });
  expect(elapsed).toBeLessThan(15000);
  const sale = await commercePost<SaleDetail>(request, '/api/sales', saleBody(client, rule, body));
  expect(sale.lines).toHaveLength(50);
  expect(sale.totalUsd).toBe('8000.00');
  expect(new Set(sale.lines.flatMap((l) => l.allocations.map((a) => a.containerId))).size).toBe(
    200,
  );
  const after = await fingerprint();
  const pdf = await request.get('/api/sales/' + sale.id + '/delivery-note?size=letter&download=1');
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  expect(await fingerprint()).toEqual(after);
});

test('V4.8 T07/T08 opciones reales: manzana 100/113 y pera Forelle/Packham 125/135 conservan remanentes y media pendiente', async ({
  request,
}) => {
  test.setTimeout(90000);
  const options: HabitualCatalogOptions = await (await request.get('/api/catalog/options')).json();
  expect(options.templateVersion).toBe('v4.5');
  const selections = [
    ['apple_traditional', 'Gala', '100', 5],
    ['apple_traditional', 'Gala', '113', 5],
    ['pear', 'Forelle', '125', 4],
    ['pear', 'Forelle', '135', 5],
    ['pear', 'Packham', '125', 4],
    ['pear', 'Packham', '135', 5],
  ] as const;
  const selected = selections.map(([templateId, varietyName, caliberLabel, count]) => {
    const option = options.options.find(
      (row) =>
        row.templateId === templateId &&
        catalogNameKey(row.varietyName ?? '') === catalogNameKey(varietyName) &&
        row.caliberLabel === caliberLabel,
    );
    expect(option, `${templateId} ${varietyName} ${caliberLabel}`).toBeDefined();
    expect(option!.suggestedPacking?.blistersPerBox).toBe(count);
    return { option: option!, count };
  });
  // Other tests may already have this habitual SKU. A legitimate, explicitly
  // backdated QA receipt precedes that stock; no fixture is deleted or rewritten.
  const existingIds = selected.flatMap(({ option }) =>
    option.configurationId ? [option.configurationId] : [],
  );
  const receivedAt = await receiptDatabase(async (db) => {
    const oldest: Date | null = (
      await db.query(
        'select min(received_at) as value from lots where packing_rule_id=any($1::uuid[])',
        [existingIds],
      )
    ).rows[0].value;
    return new Date((oldest?.getTime() ?? Date.now()) - 86400000).toISOString();
  });
  const receipt = await commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    receivedAt,
    lines: selected.map(({ option }) => ({ product: option.product, boxes: 1 })),
  });
  const catalog: Catalog = await (await request.get('/api/catalog')).json();
  const client = await commercialCustomer(request);
  const pearRules: Configuration[] = [];
  for (const [index, { count }] of selected.entries()) {
    const detail = await lot(request, receipt.lots[index]!.id);
    expect(detail.lot).toMatchObject({ closedBoxes: 1, blistersPerBox: count, unitCostUsd: null });
    const rule = catalog.configurations.find((row) => row.id === detail.lot.configurationId)!;
    expect(rule).toBeDefined();
    const body = { ...cart(previewLine(rule, 1, 'blister')), soldAt: receivedAt };
    expect((await preview(request, body)).valid).toBe(true);
    const sale = await commercePost<SaleDetail>(
      request,
      '/api/sales',
      saleBody(client, rule, body),
    );
    expect(sale.lines[0]!.allocations[0]!.lotId).toBe(detail.lot.id);
    expect((await lot(request, detail.lot.id)).lot).toMatchObject({
      closedBoxes: 0,
      intactBlisters: count - 1,
    });
    expect((await preview(request, body)).lines[0]!.maxQuantity).toBe(count - 1);
    if (index >= 2) {
      expect(detail.lot.halfPreparation).toBe('pending');
      pearRules.push(rule);
    }
  }
  const beforeRejectedHalf = await fingerprint();
  for (const rule of pearRules) {
    const body = { ...cart(previewLine(rule, 1, 'half_box')), soldAt: receivedAt };
    expect((await preview(request, body)).lines[0]!.issueCode).toBe('presentation_not_allowed');
    expect(
      (
        await request.post('/api/sales', {
          headers: commerceHeaders(),
          data: saleBody(client, rule, body),
        })
      ).status(),
    ).toBe(400);
  }
  expect(await fingerprint()).toEqual(beforeRejectedHalf);
});
