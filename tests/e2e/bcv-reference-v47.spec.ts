import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { BCV_SOURCE_URL } from '../../packages/domain/src/rate-sources';
import { loginPage } from './helpers/auth';
import { commerceHeaders, commercialCustomer } from './helpers/commerce';
import { manualSale, receiveUnknown, unpricedProduct } from './helpers/operation-v45';
import { receiptDatabase } from './helpers/receipt-v42';

test('V4.8 BCV vence en la pestaña: conserva la última cifra y fecha sin habilitar VES', async ({
  page,
}) => {
  await loginPage(page);
  const clock = new Date();
  await page.clock.install({ time: clock });
  const officialValueDate = new Date(clock.getTime() - 2 * 86400000).toISOString().slice(0, 10);
  const reference = {
    usage: 'display_only',
    source: 'BCV',
    rate: '73.12500000',
    sourceUrl: BCV_SOURCE_URL,
    sourceHash: 'c'.repeat(64),
    officialValueDate,
    validFrom: new Date(clock.getTime() - 60000).toISOString(),
    validUntil: new Date(clock.getTime() + 300000).toISOString(),
    fetchedAt: new Date(clock.getTime() - 120000).toISOString(),
    verifiedAt: new Date(clock.getTime() - 90000).toISOString(),
  };
  const { usage: _usage, ...quote } = reference;
  let rateRequests = 0;
  const businessPosts: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && /\/api\/(sales|payments)(?:\?|$)/.test(request.url()))
      businessPosts.push(request.url());
  });
  await page.route('**/api/rates/current', (route) => {
    rateRequests++;
    return route.fulfill({
      json: {
        status: 'available',
        rate: { id: randomUUID(), ...quote },
        lastOfficial: reference,
        usdt: { status: 'unavailable', rate: null },
      },
    });
  });
  await page.goto('/ventas/nueva');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('bcv');
  await page.getByText('Monedas y tasas', { exact: true }).click();
  await expect(
    page.getByText('BCV oficial: 73.12500000 Bs. por USD.', { exact: true }),
  ).toBeVisible();
  const bolivares = page.getByLabel('Método de cobro', { exact: true }).getByRole('option', {
    name: 'Bolívares a tasa BCV',
    exact: true,
  });
  await expect(bolivares).toBeEnabled();
  await expect(page.getByText(/Última BCV oficial verificada:/)).toHaveCount(0);

  // The visible tab refreshes automatically; the mock returns the same observation.
  const requestsBeforeExpiration = rateRequests;
  await page.clock.fastForward(300011);
  await expect(
    page.getByText('Última BCV oficial verificada: 73,125 Bs. por USD.', { exact: true }),
  ).toBeVisible();
  const valueDate = new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(officialValueDate + 'T04:00:00.000Z'));
  await expect(
    page.getByText(`Fecha valor: ${valueDate} · Venezuela.`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('BCV oficial: 73.12500000 Bs. por USD.', { exact: true }),
  ).toHaveCount(0);
  await expect(bolivares).toBeDisabled();
  await expect(
    page.getByText(
      'Referencia histórica; no habilita cobros en bolívares. USD y USDT se aplican 1:1.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Consultar fuente BCV', exact: true }),
  ).toHaveAttribute('href', BCV_SOURCE_URL);
  expect(reference).not.toHaveProperty('id');
  await expect.poll(() => rateRequests).toBeGreaterThan(requestsBeforeExpiration);
  expect(businessPosts).toEqual([]);
});

type SyntheticObservation = {
  id: string;
  rate: string;
  sourceHash: string;
  validFrom: string;
  validUntil: string;
  fetchedAt: string;
  verifiedAt: string;
};

/**
 * This spec needs a fresh QA cache and runs before the rate-writing beta/commerce
 * specs in the serial suite. Never delete or rewrite immutable observations to
 * make a retry pass: run the directed spec with the fresh-database harness.
 */
async function appendObservations(rows: SyntheticObservation[], expectedIds: string[]) {
  const target = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55432' ||
    target.username !== 'mm_owner' ||
    target.search ||
    target.hash
  )
    throw new Error('Las referencias sintéticas solo admiten PostgreSQL local de QA.');
  target.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: target.toString(), statement_timeout: 10000 });
  await db.connect();
  try {
    await db.query('begin');
    const binding = (await db.query('select * from runtime_environment where singleton')).rows[0];
    if (binding?.environment !== 'test' || binding.database_name !== 'manzanas_maracay_test')
      throw new Error('La base debe estar vinculada exclusivamente a test.');
    await db.query('lock table bcv_rates in share row exclusive mode');
    const existing = (await db.query<{ id: string }>('select id from bcv_rates order by id')).rows;
    expect(
      existing.map((row) => row.id),
      'Esta prueba exige caché QA fresca; no borra ni cambia observaciones existentes.',
    ).toEqual([...expectedIds].sort());
    for (const row of rows)
      await db.query(
        `insert into bcv_rates
          (id,rate,source,source_url,source_hash,valid_from,valid_until,fetched_at,verified_at,verified_by)
         values($1,$2,'BCV',$3,$4,$5,$6,$7,$8,'QA V4.7 SINTÉTICA LOCAL; NO COTIZACIÓN REAL')`,
        [
          row.id,
          row.rate,
          BCV_SOURCE_URL,
          row.sourceHash,
          row.validFrom,
          row.validUntil,
          row.fetchedAt,
          row.verifiedAt,
        ],
      );
    await db.query('commit');
  } catch (error) {
    await db.query('rollback');
    throw error;
  } finally {
    await db.end();
  }
}

// Authentication may renew its own session. No commercial row, ledger entry,
// inventory projection, command receipt or audit event may change on rejection.
const protectedTables = [
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
async function protectedFingerprint() {
  return receiptDatabase(async (db) => {
    const result: Record<string, { count: number; hash: string }> = {};
    for (const table of protectedTables)
      result[table] = (
        await db.query(`select count(*)::int count,
          md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' order by to_jsonb(t)::text),'')) hash
          from ${table} t`)
      ).rows[0];
    return result;
  });
}

test('V4.7 última BCV vencida es informativa; futura y ambigua no habilitan cobros', async ({
  page,
}) => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const caracasDayStart = Math.floor((now - 4 * 60 * 60 * 1000) / day) * day + 4 * 60 * 60 * 1000;
  const observation = (rate: string, from: number): SyntheticObservation => {
    const id = randomUUID();
    return {
      id,
      rate,
      sourceHash: createHash('sha256').update(id).digest('hex'),
      validFrom: new Date(from).toISOString(),
      validUntil: new Date(from + day).toISOString(),
      fetchedAt: new Date(now - 60000).toISOString(),
      verifiedAt: new Date(now - 30000).toISOString(),
    };
  };
  const expired = observation('73.12500000', caracasDayStart - 2 * day);
  const future = observation('777.77000000', caracasDayStart + 2 * day);
  await appendObservations([expired, future], []);
  await loginPage(page);

  const statusResponse = await page.request.get('/api/rates/current');
  expect(statusResponse.status()).toBe(200);
  const status = await statusResponse.json();
  expect(status).toMatchObject({
    status: 'unavailable',
    rate: null,
    reason: 'no_verified_current_rate',
    lastOfficial: {
      usage: 'display_only',
      source: 'BCV',
      rate: expired.rate,
      sourceUrl: BCV_SOURCE_URL,
      sourceHash: expired.sourceHash,
      validFrom: expired.validFrom,
      validUntil: expired.validUntil,
      fetchedAt: expired.fetchedAt,
      verifiedAt: expired.verifiedAt,
    },
  });
  expect(status.lastOfficial).not.toHaveProperty('id');
  expect(JSON.stringify(status)).not.toContain(future.sourceHash);
  expect(JSON.stringify(status)).not.toContain(future.rate);

  await page.goto('/cobranza');
  await expect(
    page.getByText('Última BCV oficial verificada: 73,125 Bs. por USD.', { exact: true }),
  ).toBeVisible();
  const valueDate = new Intl.DateTimeFormat('es-VE', {
    dateStyle: 'short',
    timeZone: 'America/Caracas',
  }).format(new Date(expired.validFrom));
  await expect(
    page.getByText(`Fecha valor: ${valueDate} · Venezuela.`, { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Referencia histórica; no habilita cobros en bolívares. USD y USDT se aplican 1:1.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Consultar fuente BCV', exact: true }),
  ).toHaveAttribute('href', BCV_SOURCE_URL);
  await expect(page.getByText(/777,77/)).toHaveCount(0);

  await page.goto('/ventas/nueva');
  await page.getByLabel('Acuerdo de cobro', { exact: true }).selectOption('bcv');
  await page.getByText('Monedas y tasas', { exact: true }).click();
  await expect(
    page.getByText('Última BCV oficial verificada: 73,125 Bs. por USD.', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Método de cobro', { exact: true }).getByRole('option', {
      name: 'Bolívares a tasa BCV',
      exact: true,
    }),
  ).toBeDisabled();

  // Manipulating a known historical UUID cannot turn the display-only object
  // into a quote. Exercise the real API, without fulfilling a mocked response.
  const client = await commercialCustomer(page.request);
  const rule = await unpricedProduct(page.request);
  await receiveUnknown(page.request, rule, 2);
  const sale = await manualSale(page.request, client, rule, 1, '40', 'box', 'bcv');
  const before = await protectedFingerprint();
  const rejected = await page.request.post('/api/payments', {
    headers: commerceHeaders(),
    data: {
      clientId: client.id,
      currency: 'VES',
      amount: '2925.00',
      method: 'bolivares',
      rateId: expired.id,
      receivedAt: new Date().toISOString(),
      applications: [{ saleId: sale.id, amountUsd: '40.00' }],
    },
  });
  expect(rejected.status()).toBe(503);
  expect(await rejected.text()).toContain(
    'La tasa BCV oficial seleccionada no está vigente y verificada',
  );
  expect(await protectedFingerprint()).toEqual(before);
  const unchangedSale = await page.request.get('/api/sales/' + sale.id);
  expect(unchangedSale.status()).toBe(200);
  expect(await unchangedSale.json()).toMatchObject({ balanceUsd: '40.00', payments: [] });

  // Even two equal values on the latest past date are ambiguous observations.
  const duplicate = observation(expired.rate, Date.parse(expired.validFrom));
  await appendObservations([duplicate], [expired.id, future.id]);
  const beforeRead = await protectedFingerprint();
  const ambiguous = await page.request.get('/api/rates/current');
  expect(ambiguous.status()).toBe(200);
  expect(await ambiguous.json()).toMatchObject({
    status: 'unavailable',
    rate: null,
    reason: 'no_verified_current_rate',
    lastOfficial: null,
  });
  await page.goto('/cobranza');
  await expect(page.getByText(/Tasa BCV no disponible\./)).toBeVisible();
  await expect(page.getByText(/Última BCV oficial verificada:/)).toHaveCount(0);
  await expect(page.getByText(/777,77/)).toHaveCount(0);
  expect(await protectedFingerprint()).toEqual(beforeRead);
});
