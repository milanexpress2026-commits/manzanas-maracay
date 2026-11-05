import { test, expect, type APIRequestContext } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Client, Pool } from 'pg';
import { addCommercialCatalog } from '../../scripts/commercial-catalog';
import { provisionUser } from '../../apps/api/src/auth/provision';
import { PDFDocument, PDFRawStream, PDFName, decodePDFRawStream } from 'pdf-lib';
import { databaseTarget } from '../../packages/database/src/environment';
import type {
  Configuration,
  ReceiptResult,
  SaleDetail,
  PaymentDetail,
  ClientSummary,
  Supplier,
} from '../../packages/domain/src/index';

const origin = 'https://localhost:3143';
const headers = (key = randomUUID()) => ({ Origin: origin, 'Idempotency-Key': key });
test.describe.configure({ mode: 'serial' });

async function state() {
  const value = JSON.parse(
    await fs.readFile(
      process.env.MM_PRODUCTION_QA_STATE_FILE ?? path.resolve('.local/production-qa/current.json'),
      'utf8',
    ),
  );
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.MM_APP_ENV !== 'production' ||
    value.runId !== process.env.MM_QA_RUN_ID ||
    value.database !== process.env.MM_PRODUCTION_TEST_DATABASE ||
    !/^manzanas_maracay_production_test_[a-f0-9]{12}$/.test(value.database)
  )
    throw new Error('Esta suite solo opera en la base temporal de producción simulada.');
  return value as {
    runId: string;
    database: string;
    ownerUrl: string;
    applicationUrl: string;
    marker: string;
    databaseInstanceId: string;
  };
}
async function database<T>(role: 'owner' | 'application', fn: (client: Client) => Promise<T>) {
  const fixture = await state();
  const url = role === 'owner' ? fixture.ownerUrl : fixture.applicationUrl;
  const target = databaseTarget(url, {
    environment: 'production',
    role,
    nodeEnvironment: 'test',
    productionTestDatabase: fixture.database,
  });
  if (target.purpose !== 'production_regression')
    throw new Error('No se ejecutan fixtures sobre una base operativa.');
  const client = new Client({ connectionString: url, statement_timeout: 10000 });
  await client.connect();
  try {
    const bound = (
      await client.query(
        "select e.*,shobj_description(d.oid,'pg_database') as marker from runtime_environment e join pg_database d on d.datname=current_database() where singleton",
      )
    ).rows[0];
    if (
      bound.database_name !== fixture.database ||
      bound.database_instance_id !== fixture.databaseInstanceId ||
      bound.purpose !== 'production_regression' ||
      bound.marker !== fixture.marker
    )
      throw new Error('El binding de QA no coincide; no se modifica ninguna base.');
    return await fn(client);
  } finally {
    await client.end();
  }
}
async function post<T>(
  request: APIRequestContext,
  route: string,
  data: unknown,
  key = randomUUID(),
): Promise<T> {
  const response = await request.post(route, { headers: headers(key), data });
  expect(response.status(), `HTTP ${response.status()} en ${route}`).toBe(201);
  return response.json();
}
async function configuration(request: APIRequestContext, confirmed = true): Promise<Configuration> {
  const fruit = await post<{ id: string }>(request, '/api/catalog/fruits', {
    name: `QA aislada ${randomUUID()}`,
  });
  const result = await post<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    packingModel: 'whole',
    halfPreparation: 'none',
    allowedPresentations: ['box'],
    blistersPerBox: null,
    confirmationStatus: confirmed ? 'confirmed' : 'pending',
  });
  await post(request, '/api/prices', {
    items: [{ variantId: result.variantId, presentation: 'box', promoUsd: '40', regularUsd: '50' }],
  });
  return result;
}
async function customer(request: APIRequestContext): Promise<ClientSummary> {
  return post(request, '/api/clients', {
    name: `QA cliente aislado ${randomUUID()}`,
    notes: 'Solo base temporal de regresión; nunca producción operativa.',
  });
}
async function receipt(
  request: APIRequestContext,
  rule: Configuration,
  boxes: number,
  cost: string,
  ago = 1000,
): Promise<ReceiptResult> {
  const supplier = await post<Supplier>(request, '/api/suppliers', {
    name: `QA proveedor ${randomUUID()}`,
  });
  return post(request, '/api/receipts', {
    supplierId: supplier.id,
    reference: randomUUID(),
    receivedAt: new Date(Date.now() - ago).toISOString(),
    lines: [{ configurationId: rule.id, boxes, unitCostUsd: cost }],
  });
}
function saleInput(client: ClientSummary, rule: Configuration, quantity: number) {
  return {
    clientId: client.id,
    condition: 'credit',
    soldAt: new Date().toISOString(),
    lines: [
      {
        configurationId: rule.id,
        presentation: 'box',
        quantity,
        priceBasis: 'usd_cash_promo',
        agreedUnitUsd: '40',
      },
    ],
  };
}
async function pdfText(bytes: Buffer) {
  const doc = await PDFDocument.load(bytes);
  let text = '',
    images = 0;
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFRawStream)) continue;
    if (object.dict.get(PDFName.of('Subtype'))?.toString() === '/Image') {
      images++;
      continue;
    }
    const operators = Buffer.from(decodePDFRawStream(object).decode()).toString('latin1');
    for (const match of operators.matchAll(/<([A-Fa-f0-9]+)>\s*Tj/g))
      text += Buffer.from(match[1], 'hex').toString('latin1') + '\n';
  }
  return { text, images, pages: doc.getPageCount() };
}
test.beforeEach(async ({ request }) => {
  await state();
  const { username, password } = JSON.parse(
    await fs.readFile(path.resolve('.local/production-qa/auth.json'), 'utf8'),
  );
  const response = await request.post('/api/auth/login', {
    headers: { Origin: origin },
    data: { username, password },
  });
  expect(response.status()).toBe(201);
  expect(await response.json()).toMatchObject({ environment: 'production', operationsReady: true });
});
test.afterEach(async ({ request }) => {
  await request.post('/api/auth/logout', { headers: { Origin: origin }, data: {} });
});

test('binding inmutable, dueño sin superusuario, permisos mínimos y rechazo SQL de DEMO', async () => {
  await database('owner', async (client) => {
    // Execute the exact type-sensitive guards from the restore verifier against
    // pg_class, including TOAST tables and indexes. WHERE predicate ordering
    // cannot protect has_sequence_privilege from receiving a non-sequence OID.
    const verifier = await fs.readFile(
      path.resolve('scripts/production-verify-restore.sql'),
      'utf8',
    );
    const checks = [...verifier.matchAll(/CASE WHEN c\.relkind[\s\S]*?ELSE false END/g)].map(
      (match) => match[0],
    );
    expect(checks).toHaveLength(4);
    const kinds = (
      await client.query("select distinct relkind from pg_class where relkind in ('r','i','S','t')")
    ).rows.map((row) => row.relkind);
    expect(kinds.sort()).toEqual(['S', 'i', 'r', 't']);
    for (const expression of checks) {
      const privileges = expression.includes('has_any_column_privilege')
        ? "('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')"
        : "('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')";
      const result = await client.query(
        `select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join (values ${privileges}) p(priv) where ${expression.replaceAll("'mm_prod_rates'", 'current_user')}`,
      );
      expect(Number.isInteger(result.rows[0].n)).toBe(true);
    }
    const before = (await client.query('select count(*)::int as count from fruits')).rows[0].count;
    const seedPool = new Pool({ connectionString: (await state()).ownerUrl, max: 1 });
    try {
      await expect(addCommercialCatalog(seedPool)).rejects.toThrow('producción');
    } finally {
      await seedPool.end();
    }
    expect((await client.query('select count(*)::int as count from fruits')).rows[0].count).toBe(
      before,
    );
    const role = (
      await client.query(
        'select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname=current_user',
      )
    ).rows[0];
    expect(Object.values(role).every((value) => value === false)).toBe(true);
    for (const sql of [
      "update runtime_environment set environment='staging'",
      "insert into clients(name,is_demo) values('QA SQL prohibited',true)",
    ]) {
      await client.query('begin');
      try {
        await expect(client.query(sql)).rejects.toMatchObject({ code: '23514' });
      } finally {
        await client.query('rollback');
      }
    }
  });
  await database('application', async (client) => {
    const result = (
      await client.query(
        "select has_table_privilege(current_user,'sales','update') as update_sale,has_table_privilege(current_user,'payments','delete') as delete_payment,has_table_privilege(current_user,'bcv_rates','insert') as insert_rate,has_table_privilege(current_user,'runtime_environment','update') as edit_binding",
      )
    ).rows[0];
    expect(Object.values(result).every((value) => value === false)).toBe(true);
    expect(
      (await client.query('select count(*)::int as count from clients where is_demo')).rows[0]
        .count,
    ).toBe(0);
  });
});

test('producción rechaza DEMO y empaque pendiente o presentaciones no autorizadas sin generar recepción', async ({
  request,
}) => {
  const demo = await request.post('/api/clients', {
    headers: headers(),
    data: { name: 'QA rechazado', isDemo: true },
  });
  expect(demo.status()).toBe(400);
  const rule = await configuration(request, false);
  const supplier = await post<Supplier>(request, '/api/suppliers', {
    name: `QA pendiente ${randomUUID()}`,
  });
  const reference = randomUUID();
  const input = {
    supplierId: supplier.id,
    reference,
    receivedAt: new Date().toISOString(),
    lines: [{ configurationId: rule.id, boxes: 1, unitCostUsd: '25' }],
  };
  expect((await request.post('/api/receipts', { headers: headers(), data: input })).status()).toBe(
    409,
  );
  await database('application', async (client) => {
    expect(
      (
        await client.query('select count(*)::int as count from purchases where reference=$1', [
          reference,
        ])
      ).rows[0].count,
    ).toBe(0);
    await client.query('begin');
    try {
      await expect(
        client.query(
          "insert into price_items(price_list_id,variant_id,presentation,unit_usd) select id,$1,'blister',5 from price_lists limit 1",
          [rule.variantId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await client.query('rollback');
    }
  });
  const invalid = await request.patch(`/api/catalog/configurations/${rule.id}`, {
    headers: headers(),
    data: {
      version: rule.version,
      packingModel: 'blister',
      halfPreparation: 'pending',
      allowedPresentations: ['box', 'blister', 'half_box'],
      blistersPerBox: null,
      confirmationStatus: 'confirmed',
    },
  });
  expect(invalid.status()).toBe(400);
  // V4 confirms the reviewed catalog version and its receipt together. The same
  // database production triggers remain active; no synthetic production bypass.
  const reviewedInput = {
    ...input,
    lines: [
      {
        ...input.lines[0],
        packingConfirmation: {
          expectedVersion: rule.version,
          confirmed: true,
          packingModel: 'whole',
          halfPreparation: 'none',
          allowedPresentations: ['box'],
          blistersPerBox: null,
          boxWeightKg: null,
        },
      },
    ],
  };
  const key = randomUUID();
  const received = await post<ReceiptResult>(request, '/api/receipts', reviewedInput, key);
  expect(await post(request, '/api/receipts', reviewedInput, key)).toEqual(received);
  await database('application', async (db) => {
    expect(
      (
        await db.query('select confirmation_status,version from packing_rules where id=$1', [
          rule.id,
        ])
      ).rows[0],
    ).toEqual({ confirmation_status: 'confirmed', version: rule.version + 1 });
    expect(
      (
        await db.query(
          'select confirmation_status_snapshot,packing_rule_version,is_demo from lots where id=$1',
          [received.lots[0].id],
        )
      ).rows[0],
    ).toEqual({
      confirmation_status_snapshot: 'confirmed',
      packing_rule_version: rule.version + 1,
      is_demo: false,
    });
    expect(
      (await db.query('select count(*)::int n from purchases where reference=$1', [reference]))
        .rows[0].n,
    ).toBe(1);
  });
  const client = await customer(request);
  const invalidSale = {
    ...saleInput(client, rule, 1),
    lines: [{ ...saleInput(client, rule, 1).lines[0], presentation: 'half_box' }],
  };
  expect(
    (await request.post('/api/sales', { headers: headers(), data: invalidSale })).status(),
  ).toBe(400);
  expect(
    (await (await request.get(`/api/inventory/lots/${received.lots[0].id}`)).json()).lot,
  ).toMatchObject({ isDemo: false, closedBoxes: 1 });
});

test('FIFO REAL aislado conserva costo304 ingreso480 bruto176, respuesta idempotente y última existencia concurrente', async ({
  request,
}) => {
  const rule = await configuration(request),
    client = await customer(request);
  await receipt(request, rule, 10, '25', 172800000);
  const last = await receipt(request, rule, 10, '27', 86400000);
  const input = saleInput(client, rule, 12),
    key = randomUUID();
  const sale = await post<SaleDetail>(request, '/api/sales', input, key);
  expect(sale).toMatchObject({
    isDemo: false,
    totalUsd: '480.00',
    costUsd: '304.0000',
    grossProfitUsd: '176.0000',
    paidUsd: '0.00',
    balanceUsd: '480.00',
  });
  expect((await post<SaleDetail>(request, '/api/sales', input, key)).id).toBe(sale.id);
  const remainingInput = saleInput(client, rule, 8);
  const race = await Promise.all([
    request.post('/api/sales', { headers: headers(), data: remainingInput }),
    request.post('/api/sales', { headers: headers(), data: remainingInput }),
  ]);
  expect(race.map((r) => r.status()).sort()).toEqual([201, 409]);
  expect(
    (await (await request.get(`/api/inventory/lots/${last.lots[0].id}`)).json()).lot.closedBoxes,
  ).toBe(0);
  const response = await request.get(`/api/sales/${sale.id}/document`);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  const pdf = await pdfText(await response.body());
  expect(pdf.images).toBeGreaterThan(0);
  expect(pdf.text).toContain('COMPROBANTE DE VENTA');
  expect(pdf.text).toContain('480,00');
  expect(pdf.text).not.toMatch(/DEMO|ENTORNO DE PRUEBAS|Costo|Margen|304,0000|176,00/);
  await database('application', async (db) => {
    expect(
      (
        await db.query(
          'select count(*)::int as count from lots where variant_id=$1 and (is_demo or confirmation_status_snapshot<>$2)',
          [rule.variantId, 'confirmed'],
        )
      ).rows[0].count,
    ).toBe(0);
  });
});

test('abono USD, sobrepago concurrente, recibo privado y compensaciones conservan historial y costo', async ({
  request,
}) => {
  const rule = await configuration(request),
    client = await customer(request),
    received = await receipt(request, rule, 1, '25');
  const sale = await post<SaleDetail>(request, '/api/sales', saleInput(client, rule, 1));
  const paymentInput = {
    clientId: client.id,
    currency: 'USD',
    amount: '10',
    method: 'USD efectivo',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '10' }],
  };
  const key = randomUUID(),
    payment = await post<PaymentDetail>(request, '/api/payments', paymentInput, key);
  expect(payment.isDemo).toBe(false);
  expect((await post<PaymentDetail>(request, '/api/payments', paymentInput, key)).id).toBe(
    payment.id,
  );
  expect((await (await request.get(`/api/sales/${sale.id}`)).json()).balanceUsd).toBe('30.00');
  const raceInput = {
    ...paymentInput,
    amount: '30',
    applications: [{ saleId: sale.id, amountUsd: '30' }],
  };
  const race = await Promise.all([
    request.post('/api/payments', { headers: headers(), data: raceInput }),
    request.post('/api/payments', { headers: headers(), data: raceInput }),
  ]);
  expect(race.map((r) => r.status()).sort()).toEqual([201, 409]);
  const winner: PaymentDetail = await race.find((r) => r.status() === 201)!.json();
  const pdf = await pdfText(
    await (await request.get(`/api/payments/${payment.id}/document`)).body(),
  );
  expect(pdf.text).toContain('RECIBO DE ABONO');
  expect(pdf.text).toContain('30,00');
  expect(pdf.text).not.toMatch(/DEMO|ENTORNO DE PRUEBAS|Costo|Margen/);
  expect(pdf.images).toBeGreaterThan(0);
  await post(request, `/api/payments/${winner.id}/reverse`, {
    reason: 'Reversa de regresión aislada autorizada',
  });
  await post(request, `/api/payments/${payment.id}/reverse`, {
    reason: 'Reversa de regresión aislada autorizada',
  });
  await post(request, `/api/sales/${sale.id}/cancel`, {
    reason: 'Anulación de regresión aislada autorizada',
  });
  const detail = await (await request.get(`/api/inventory/lots/${received.lots[0].id}`)).json();
  expect(detail.lot.closedBoxes).toBe(1);
  expect(detail.containers.map((c: { costUsd: string }) => c.costUsd)).toEqual(['25.0000']);
  expect((await (await request.get(`/api/sales/${sale.id}`)).json()).status).toBe('cancelled');
  expect((await (await request.get(`/api/payments/${payment.id}`)).json()).reversed).toBe(true);
  expect((await (await request.get('/api/rates/current')).json()).status).toBe('unavailable');
  const ves = await request.post('/api/payments', {
    headers: headers(),
    data: {
      ...paymentInput,
      currency: 'VES',
      amount: '100',
      method: 'bolivares',
      rateId: randomUUID(),
    },
  });
  expect(ves.status()).toBe(503);
});

test('retirar o sustituir activación cierra mutaciones sin cerrar consulta ni sesión', async ({
  request,
}) => {
  const file = process.env.MM_PRODUCTION_GATE_FILE!;
  const allowedRoot = path.resolve('.local/production-qa') + path.sep;
  if (!path.resolve(file).startsWith(allowedRoot))
    throw new Error('Solo se prueba el archivo temporal de gate local.');
  const original = await fs.readFile(file, 'utf8');
  const gate = JSON.parse(original);
  const fixture = await state();
  if (gate.database !== fixture.database || gate.databaseInstanceId !== fixture.databaseInstanceId)
    throw new Error('Gate ajeno al ensayo.');
  try {
    await fs.writeFile(file, JSON.stringify({ ...gate, databaseInstanceId: randomUUID() }), {
      mode: 0o600,
    });
    expect((await (await request.get('/api/health')).json()).ready).toBe(false);
    expect((await (await request.get('/api/auth/me')).json()).operationsReady).toBe(false);
    expect((await request.get('/api/operations/overview')).status()).toBe(200);
    expect(
      (
        await request.post('/api/catalog/fruits', {
          headers: headers(),
          data: { name: 'No debe guardarse' },
        })
      ).status(),
    ).toBe(503);
    expect(
      (
        await request.post('/api/clients', {
          headers: headers(),
          data: { name: 'No debe guardarse' },
        })
      ).status(),
    ).toBe(503);
  } finally {
    await fs.writeFile(file, original, { mode: 0o600 });
  }
  expect((await (await request.get('/api/auth/me')).json()).operationsReady).toBe(true);
});

test('sesión recordada supera la inactividad pero vence en 30 días y se revoca por reset o logout', async ({
  request,
}) => {
  const auth = JSON.parse(
    await fs.readFile(path.resolve('.local/production-qa/auth.json'), 'utf8'),
  );
  const session = async (rememberSession: boolean) => {
    const response = await request.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { username: auth.username, password: auth.password, rememberSession },
    });
    expect(response.status()).toBe(201);
    const cookie = response.headers()['set-cookie'];
    expect(cookie).toContain(`Max-Age=${rememberSession ? 2592000 : 28800}`);
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('HttpOnly');
    const pair = cookie.split(';')[0];
    const hash = createHash('sha256')
      .update(pair.slice(pair.indexOf('=') + 1))
      .digest('hex');
    return { pair, hash };
  };
  const normal = await session(false);
  await database('owner', async (client) => {
    await client.query(
      "update auth_sessions set last_seen_at=now()-interval '31 minutes' where token_hash=$1",
      [normal.hash],
    );
  });
  expect((await request.get('/api/auth/me')).status()).toBe(401);
  const remembered = await session(true);
  await database('owner', async (client) => {
    const row = (
      await client.query(
        'select remember_session,extract(epoch from expires_at-created_at)::integer as seconds from auth_sessions where token_hash=$1',
        [remembered.hash],
      )
    ).rows[0];
    expect(row).toEqual({ remember_session: true, seconds: 2592000 });
    await client.query(
      "update auth_sessions set last_seen_at=now()-interval '2 days' where token_hash=$1",
      [remembered.hash],
    );
  });
  expect((await request.get('/api/auth/me')).status()).toBe(200);
  await database('owner', async (client) => {
    await client.query(
      "update auth_sessions set expires_at=created_at+interval '1 millisecond' where token_hash=$1",
      [remembered.hash],
    );
  });
  expect((await request.get('/api/auth/me')).status()).toBe(401);
  const reset = await session(true);
  await database('owner', async () => {
    const pool = new Pool({ connectionString: (await state()).ownerUrl, max: 1 });
    try {
      await provisionUser(
        pool,
        { username: auth.username, password: auth.password, displayName: auth.displayName },
        { replaceExisting: true },
      );
    } finally {
      await pool.end();
    }
  });
  expect((await request.get('/api/auth/me', { headers: { Cookie: reset.pair } })).status()).toBe(
    401,
  );
  const finalSession = await session(true);
  expect(
    (await request.post('/api/auth/logout', { headers: { Origin: origin }, data: {} })).status(),
  ).toBe(201);
  expect(
    (await request.get('/api/auth/me', { headers: { Cookie: finalSession.pair } })).status(),
  ).toBe(401);
});
