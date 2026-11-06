import { expect, type APIRequestContext } from '@playwright/test';
import { Client } from 'pg';
import dotenv from 'dotenv';
import type {
  Configuration,
  HabitualCatalogOptions,
  QuickReceiptInput,
  ReceiptOptions,
  ReceiptResult,
} from '../../../packages/domain/src/index';
import { commercePost } from './commerce';

dotenv.config({ quiet: true });

/** Read-only evidence against the existing, explicitly bound local E2E database. */
export async function receiptDatabase<T>(
  read: (db: Client) => Promise<T>,
  rollbackWrites = false,
): Promise<T> {
  const target = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(target.hostname) ||
    target.port !== '55432' ||
    target.username !== 'mm_owner'
  )
    throw new Error('La evidencia de recepción solo admite PostgreSQL local de QA.');
  target.pathname = '/manzanas_maracay_test';
  const db = new Client({ connectionString: target.toString(), statement_timeout: 10000 });
  await db.connect();
  try {
    await db.query(rollbackWrites ? 'begin' : 'begin read only');
    const binding = (await db.query('select * from runtime_environment where singleton')).rows[0];
    if (binding?.environment !== 'test' || binding.database_name !== 'manzanas_maracay_test')
      throw new Error('La base no está vinculada al entorno local de pruebas.');
    return await read(db);
  } finally {
    await db.query('rollback');
    await db.end();
  }
}

export async function receiptCounts() {
  return receiptDatabase(
    async (db) =>
      (
        await db.query(`select
        (select count(*)::int from fruits) fruits,
        (select count(*)::int from varieties) varieties,
        (select count(*)::int from calibers) calibers,
        (select count(*)::int from product_variants) variants,
        (select count(*)::int from packing_rules) configurations,
        (select count(*)::int from suppliers) suppliers,
        (select count(*)::int from clients) clients,
        (select count(*)::int from purchases) purchases,
        (select count(*)::int from purchase_lines) purchase_lines,
        (select count(*)::int from lots) lots,
        (select count(*)::int from inventory_movements) movements,
        (select count(*)::int from inventory_cost_entries) cost_entries,
        (select count(*)::int from price_items) prices,
        (select count(*)::int from price_lists) price_lists,
        (select count(*)::int from sales) sales,
        (select count(*)::int from payments) payments`)
      ).rows[0] as Record<string, number>,
  );
}

export async function habitualOptions(request: APIRequestContext): Promise<HabitualCatalogOptions> {
  const response = await request.get('/api/catalog/options');
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}

export async function previousReceiptCost(request: APIRequestContext, configurationId: string) {
  const response = await request.get('/api/receipts/options', { params: { configurationId } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<ReceiptOptions>;
}

export function quickLine(rule: Configuration, boxes: number, unitCostUsd: string) {
  return {
    product: { configurationId: rule.id, expectedPackingVersion: rule.version },
    boxes,
    cost: { kind: 'entered' as const, unitCostUsd, accepted: true as const },
  } satisfies QuickReceiptInput['lines'][number];
}

export async function quickReceipt(
  request: APIRequestContext,
  lines: QuickReceiptInput['lines'],
  extras: Omit<QuickReceiptInput, 'schemaVersion' | 'lines'> = {},
  key?: string,
) {
  return commercePost<ReceiptResult>(
    request,
    '/api/receipts',
    { schemaVersion: 2, ...extras, lines },
    key,
  );
}
