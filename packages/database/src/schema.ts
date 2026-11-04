import { sql } from 'drizzle-orm';
export * from './schema.auth';
import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  numeric,
  timestamp,
  date,
  jsonb,
  index,
  uniqueIndex,
  unique,
  check,
  foreignKey,
  pgView,
} from 'drizzle-orm/pg-core';
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const money = (name: string) => numeric(name, { precision: 18, scale: 4 });
const time = (name: string) => timestamp(name, { withTimezone: true });

export const fruits = pgTable(
  'fruits',
  { id: id(), name: text('name').notNull(), createdAt: createdAt() },
  (t) => [
    uniqueIndex('fruits_name_uq').on(sql`lower(btrim(${t.name}))`),
    check('fruits_name_valid', sql`length(btrim(${t.name})) between 2 and 80`),
  ],
);
export const varieties = pgTable(
  'varieties',
  {
    id: id(),
    fruitId: uuid('fruit_id')
      .notNull()
      .references(() => fruits.id),
    name: text('name').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('varieties_name_uq').on(t.fruitId, sql`lower(btrim(${t.name}))`),
    unique('varieties_fruit_id_uq').on(t.id, t.fruitId),
    check('varieties_name_valid', sql`length(btrim(${t.name})) between 2 and 80`),
  ],
);
export const calibers = pgTable(
  'calibers',
  {
    id: id(),
    fruitId: uuid('fruit_id')
      .notNull()
      .references(() => fruits.id),
    label: text('label').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('calibers_label_uq').on(t.fruitId, sql`lower(btrim(${t.label}))`),
    unique('calibers_fruit_id_uq').on(t.id, t.fruitId),
    check('calibers_label_valid', sql`length(btrim(${t.label})) between 1 and 30`),
  ],
);
export const variants = pgTable(
  'product_variants',
  {
    id: id(),
    fruitId: uuid('fruit_id')
      .notNull()
      .references(() => fruits.id),
    varietyId: uuid('variety_id').notNull(),
    caliberId: uuid('caliber_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('variant_combination_uq').on(t.varietyId, t.caliberId),
    index('variants_fruit_idx').on(t.fruitId),
    index('variants_caliber_idx').on(t.caliberId),
    foreignKey({
      columns: [t.varietyId, t.fruitId],
      foreignColumns: [varieties.id, varieties.fruitId],
    }),
    foreignKey({
      columns: [t.caliberId, t.fruitId],
      foreignColumns: [calibers.id, calibers.fruitId],
    }),
  ],
);
export const packingRules = pgTable(
  'packing_rules',
  {
    id: id(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    blistersPerBox: integer('blisters_per_box').notNull(),
    notes: text('notes').notNull().default(''),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: time('updated_at').notNull().defaultNow(),
  },
  (t) => [
    unique('packing_variant_uq').on(t.variantId),
    unique('packing_id_variant_uq').on(t.id, t.variantId),
    check('packing_positive', sql`${t.blistersPerBox} between 1 and 100`),
    check('packing_version_positive', sql`${t.version}>0`),
    check('packing_notes_length', sql`length(${t.notes})<=500`),
  ],
);
export const warehouses = pgTable(
  'warehouses',
  { id: id(), name: text('name').notNull(), createdAt: createdAt() },
  (t) => [unique('warehouses_name_uq').on(t.name)],
);
export const suppliers = pgTable(
  'suppliers',
  {
    id: id(),
    name: text('name').notNull(),
    taxId: text('tax_id'),
    phone: text('phone'),
    notes: text('notes').notNull().default(''),
    active: boolean('active').notNull().default(true),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('suppliers_name_uq').on(sql`lower(btrim(${t.name}))`),
    check(
      'suppliers_fields_valid',
      sql`length(btrim(${t.name})) between 2 and 120 and ${t.version}>0`,
    ),
  ],
);
export const purchases = pgTable(
  'purchases',
  {
    id: id(),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    reference: text('reference').notNull(),
    purchasedAt: time('purchased_at').notNull(),
    status: text('status').notNull().default('draft'),
    notes: text('notes').notNull().default(''),
    isDemo: boolean('is_demo').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    index('purchases_supplier_idx').on(t.supplierId),
    unique('purchases_reference_uq').on(t.supplierId, t.reference),
    check('purchase_status_valid', sql`${t.status} in ('draft','received','cancelled')`),
  ],
);
export const purchaseLines = pgTable(
  'purchase_lines',
  {
    id: id(),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    quantity: integer('quantity').notNull(),
    presentation: text('presentation').notNull(),
    unitCostUsd: money('unit_cost_usd').notNull(),
    notes: text('notes').notNull().default(''),
  },
  (t) => [
    index('purchase_lines_purchase_idx').on(t.purchaseId),
    index('purchase_lines_variant_idx').on(t.variantId),
    check('purchase_line_positive', sql`${t.quantity}>0 and ${t.unitCostUsd}>=0`),
    check(
      'purchase_presentation_valid',
      sql`${t.presentation} in ('box','blister','half_box','piece')`,
    ),
  ],
);
export const lots = pgTable(
  'lots',
  {
    id: id(),
    code: text('code').notNull(),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    supplierId: uuid('supplier_id')
      .notNull()
      .references(() => suppliers.id),
    purchaseLineId: uuid('purchase_line_id').references(() => purchaseLines.id),
    packingRuleId: uuid('packing_rule_id').notNull(),
    packingRuleVersion: integer('packing_rule_version').notNull(),
    blistersPerBoxSnapshot: integer('blisters_per_box_snapshot').notNull(),
    receivedAt: time('received_at').notNull(),
    unitCostUsd: money('unit_cost_usd').notNull(),
    receivedBoxes: integer('received_boxes').notNull().default(0),
    notes: text('notes').notNull().default(''),
    isDemo: boolean('is_demo').notNull().default(false),
    inventoryVersion: integer('inventory_version').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    unique('lots_code_uq').on(t.code),
    index('lots_variant_idx').on(t.variantId),
    index('lots_supplier_idx').on(t.supplierId),
    index('lots_purchase_idx').on(t.purchaseLineId),
    index('lots_rule_idx').on(t.packingRuleId),
    foreignKey({
      columns: [t.packingRuleId, t.variantId],
      foreignColumns: [packingRules.id, packingRules.variantId],
    }),
    check(
      'lots_values_valid',
      sql`${t.blistersPerBoxSnapshot} between 1 and 100 and ${t.unitCostUsd}>=0 and ${t.packingRuleVersion}>0`,
    ),
    check('lots_receipt_valid', sql`${t.receivedBoxes}>=0 and ${t.inventoryVersion}>=0`),
  ],
);
// A container is a physical location/identity, not an additional stock quantity.
export const containers = pgTable(
  'containers',
  {
    id: id(),
    lotId: uuid('lot_id')
      .notNull()
      .references(() => lots.id),
    warehouseId: uuid('warehouse_id')
      .notNull()
      .references(() => warehouses.id),
    parentId: uuid('parent_id'),
    kind: text('kind').notNull(),
    state: text('state').notNull().default('sealed'),
    createdAt: createdAt(),
  },
  (t) => [
    index('containers_lot_idx').on(t.lotId),
    index('containers_warehouse_idx').on(t.warehouseId),
    index('containers_parent_idx').on(t.parentId),
    unique('containers_context_uq').on(t.id, t.lotId, t.warehouseId),
    foreignKey({
      columns: [t.parentId, t.lotId, t.warehouseId],
      foreignColumns: [t.id, t.lotId, t.warehouseId],
    }),
    check('container_not_own_parent', sql`${t.parentId} is null or ${t.parentId}<>${t.id}`),
    check('container_kind_valid', sql`${t.kind} in ('box','blister','half_box','loose_bin')`),
    check('container_state_valid', sql`${t.state} in ('sealed','open','empty','dispatched')`),
  ],
);
export const stockBalances = pgTable(
  'stock_balances',
  {
    id: id(),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    unit: text('unit').notNull(),
    quantity: integer('quantity').notNull(),
    countedPieces: integer('counted_pieces'),
    version: integer('version').notNull().default(1),
  },
  (t) => [
    unique('stock_container_uq').on(t.containerId),
    check(
      'stock_nonnegative',
      sql`${t.quantity}>=0 and (${t.countedPieces} is null or ${t.countedPieces}>=0) and ${t.version}>0`,
    ),
    check(
      'stock_unit_valid',
      sql`${t.unit} in ('sealed_box','intact_blister','prepared_half_box','loose_piece')`,
    ),
    check(
      'loose_count_exact',
      sql`${t.unit}<>'loose_piece' or (${t.countedPieces} is not null and ${t.countedPieces}=${t.quantity})`,
    ),
    check(
      'half_box_count_required',
      sql`${t.unit}<>'prepared_half_box' or ${t.countedPieces} is not null`,
    ),
    check('physical_package_quantity', sql`${t.unit}='loose_piece' or ${t.quantity} in (0,1)`),
  ],
);
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: id(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    creationTransaction: bigint('creation_transaction', { mode: 'bigint' })
      .notNull()
      .default(sql`txid_current()`),
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    actor: text('actor').notNull(),
    lotId: uuid('lot_id').references(() => lots.id),
    reversalOf: uuid('reversal_of'),
    lotVersionBefore: integer('lot_version_before'),
    lotVersionAfter: integer('lot_version_after'),
    beforeState: jsonb('before_state')
      .notNull()
      .default(sql`'[]'::jsonb`),
    afterState: jsonb('after_state')
      .notNull()
      .default(sql`'[]'::jsonb`),
    countedBefore: integer('counted_before'),
    deliveredPieces: integer('delivered_pieces'),
    remainingPieces: integer('remaining_pieces'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('movement_idempotency_uq').on(t.idempotencyKey),
    index('movements_date_idx').on(t.createdAt),
    index('movements_lot_idx').on(t.lotId, t.createdAt),
    unique('movement_reversal_uq').on(t.reversalOf),
    foreignKey({ columns: [t.reversalOf], foreignColumns: [t.id] }),
    check(
      'movement_kind_valid',
      sql`${t.kind} in ('receipt','dispatch','open_box','open_blister','fraction','adjustment','transfer','reversal')`,
    ),
    check('movement_reason_required', sql`length(btrim(${t.reason}))>0`),
    check(
      'fraction_conservation',
      sql`${t.kind}<>'fraction' or (${t.countedBefore} is not null and ${t.deliveredPieces} is not null and ${t.remainingPieces} is not null and ${t.countedBefore}>0 and ${t.deliveredPieces}>=0 and ${t.remainingPieces}>=0 and ${t.countedBefore}=${t.deliveredPieces}+${t.remainingPieces})`,
    ),
  ],
);
export const inventoryEntries = pgTable(
  'inventory_entries',
  {
    id: id(),
    movementId: uuid('movement_id')
      .notNull()
      .references(() => inventoryMovements.id),
    containerId: uuid('container_id')
      .notNull()
      .references(() => containers.id),
    unit: text('unit').notNull(),
    quantityDelta: integer('quantity_delta').notNull(),
    piecesDelta: integer('pieces_delta'),
    entryOrder: bigint('entry_order', { mode: 'number' }).generatedAlwaysAsIdentity().notNull(),
    beforeState: jsonb('before_state'),
    afterState: jsonb('after_state')
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    index('entries_movement_idx').on(t.movementId),
    index('entries_container_idx').on(t.containerId),
    index('entries_container_order_idx').on(t.containerId, t.entryOrder),
    check(
      'entry_nonzero',
      sql`${t.quantityDelta}<>0 or coalesce(${t.piecesDelta},0)<>0 or ${t.beforeState} is distinct from ${t.afterState}`,
    ),
    check(
      'entry_unit_valid',
      sql`${t.unit} in ('sealed_box','intact_blister','prepared_half_box','loose_piece')`,
    ),
  ],
);
export const clients = pgTable('clients', {
  id: id(),
  name: text('name').notNull(),
  taxId: text('tax_id'),
  phone: text('phone'),
  address: text('address'),
  createdAt: createdAt(),
});
export const priceLists = pgTable(
  'price_lists',
  {
    id: id(),
    name: text('name').notNull(),
    paymentBasis: text('payment_basis').notNull(),
    currency: text('currency').notNull().default('USD'),
    createdAt: createdAt(),
  },
  (t) => [
    check('price_basis_valid', sql`${t.paymentBasis} in ('usd_cash_promo','ves_regular')`),
    check('price_currency_usd', sql`${t.currency}='USD'`),
  ],
);
export const priceItems = pgTable(
  'price_items',
  {
    id: id(),
    priceListId: uuid('price_list_id')
      .notNull()
      .references(() => priceLists.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    presentation: text('presentation').notNull(),
    unitUsd: money('unit_usd').notNull(),
  },
  (t) => [
    unique('price_item_uq').on(t.priceListId, t.variantId, t.presentation),
    index('price_items_variant_idx').on(t.variantId),
    check('price_positive', sql`${t.unitUsd}>=0`),
    check(
      'price_presentation_valid',
      sql`${t.presentation} in ('box','blister','half_box','piece')`,
    ),
  ],
);
export const bcvRates = pgTable(
  'bcv_rates',
  {
    id: id(),
    rate: numeric('rate', { precision: 20, scale: 8 }).notNull(),
    source: text('source').notNull().default('BCV'),
    sourceUrl: text('source_url').notNull(),
    sourceHash: text('source_hash').notNull(),
    validFrom: time('valid_from').notNull(),
    validUntil: time('valid_until').notNull(),
    fetchedAt: time('fetched_at').notNull(),
    verifiedAt: time('verified_at').notNull(),
    verifiedBy: text('verified_by').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('bcv_source_period_uq').on(t.sourceHash, t.validFrom),
    index('bcv_validity_idx').on(t.validFrom, t.validUntil),
    check(
      'bcv_verified_official',
      sql`${t.source}='BCV' and ${t.rate}>0 and ${t.validUntil}>${t.validFrom} and ${t.verifiedAt}>=${t.fetchedAt} and ${t.sourceUrl} ~ '^https://(www[.])?bcv[.]org[.]ve(/|$)'`,
    ),
  ],
);
export const sales = pgTable(
  'sales',
  {
    id: id(),
    number: text('number').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    condition: text('condition').notNull(),
    status: text('status').notNull().default('draft'),
    currency: text('currency').notNull().default('USD'),
    soldAt: time('sold_at').notNull(),
    dueDate: date('due_date'),
    createdAt: createdAt(),
  },
  (t) => [
    unique('sales_number_uq').on(t.number),
    unique('sales_id_client_uq').on(t.id, t.clientId),
    index('sales_client_date_idx').on(t.clientId, t.soldAt),
    index('sales_due_idx').on(t.dueDate),
    check('sales_condition_valid', sql`${t.condition} in ('cash','credit')`),
    check('sales_status_valid', sql`${t.status} in ('draft','confirmed','cancelled')`),
    check('sales_currency_usd', sql`${t.currency}='USD'`),
    check('credit_due_required', sql`${t.condition}<>'credit' or ${t.dueDate} is not null`),
  ],
);
export const saleLines = pgTable(
  'sale_lines',
  {
    id: id(),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id),
    variantId: uuid('variant_id')
      .notNull()
      .references(() => variants.id),
    presentation: text('presentation').notNull(),
    quantity: integer('quantity').notNull(),
    referenceUnitUsd: money('reference_unit_usd').notNull(),
    agreedUnitUsd: money('agreed_unit_usd').notNull(),
    priceBasis: text('price_basis').notNull(),
    descriptionSnapshot: text('description_snapshot').notNull(),
  },
  (t) => [
    index('sale_lines_sale_idx').on(t.saleId),
    index('sale_lines_variant_idx').on(t.variantId),
    check(
      'sale_line_valid',
      sql`${t.quantity}>0 and ${t.referenceUnitUsd}>=0 and ${t.agreedUnitUsd}>=0`,
    ),
    check(
      'sale_presentation_valid',
      sql`${t.presentation} in ('box','blister','half_box','piece')`,
    ),
    check('sale_basis_valid', sql`${t.priceBasis} in ('usd_cash_promo','ves_regular')`),
  ],
);
export const payments = pgTable(
  'payments',
  {
    id: id(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    currency: text('currency').notNull(),
    amount: money('amount').notNull(),
    amountUsd: money('amount_usd').notNull(),
    bcvRateId: uuid('bcv_rate_id').references(() => bcvRates.id),
    receivedAt: time('received_at').notNull(),
    idempotencyKey: uuid('idempotency_key').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('payments_idempotency_uq').on(t.idempotencyKey),
    unique('payments_id_client_uq').on(t.id, t.clientId),
    index('payments_client_idx').on(t.clientId),
    index('payments_rate_idx').on(t.bcvRateId),
    check('payment_positive', sql`${t.amount}>0 and ${t.amountUsd}>0`),
    check(
      'payment_currency_rate',
      sql`(${t.currency}='USD' and ${t.bcvRateId} is null and ${t.amount}=${t.amountUsd}) or (${t.currency}='VES' and ${t.bcvRateId} is not null)`,
    ),
  ],
);
export const paymentApplications = pgTable(
  'payment_applications',
  {
    id: id(),
    paymentId: uuid('payment_id').notNull(),
    saleId: uuid('sale_id').notNull(),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id),
    amountUsd: money('amount_usd').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('application_payment_sale_uq').on(t.paymentId, t.saleId),
    index('applications_sale_idx').on(t.saleId),
    index('applications_client_idx').on(t.clientId),
    foreignKey({
      columns: [t.paymentId, t.clientId],
      foreignColumns: [payments.id, payments.clientId],
    }),
    foreignKey({ columns: [t.saleId, t.clientId], foreignColumns: [sales.id, sales.clientId] }),
    check('application_positive', sql`${t.amountUsd}>0`),
  ],
);
export const auditEvents = pgTable(
  'audit_events',
  {
    id: id(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    actor: text('actor').notNull(),
    requestId: uuid('request_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_entity_date_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_request_idx').on(t.requestId),
  ],
);
export const commandReceipts = pgTable('command_receipts', {
  key: uuid('key').primaryKey(),
  requestHash: text('request_hash').notNull(),
  response: jsonb('response').notNull(),
  createdAt: createdAt(),
});
// Derived receivables prevent a separately writable debt balance from drifting.
export const receivables = pgView('receivables', {
  saleId: uuid('sale_id'),
  clientId: uuid('client_id'),
  number: text('number'),
  dueDate: date('due_date'),
  currency: text('currency'),
  totalUsd: numeric('total_usd', { precision: 18, scale: 2 }),
  paidUsd: numeric('paid_usd', { precision: 18, scale: 2 }),
  balanceUsd: numeric('balance_usd', { precision: 18, scale: 2 }),
}).as(
  sql`select s.id as sale_id, s.client_id, s.number, s.due_date, 'USD'::text as currency, coalesce(l.total,0)::numeric(18,2) as total_usd, coalesce(p.paid,0)::numeric(18,2) as paid_usd, (coalesce(l.total,0)-coalesce(p.paid,0))::numeric(18,2) as balance_usd from sales s left join (select sale_id, round(sum(quantity*agreed_unit_usd),2) as total from sale_lines group by sale_id) l on l.sale_id=s.id left join (select sale_id,sum(amount_usd) as paid from payment_applications group by sale_id) p on p.sale_id=s.id where s.status='confirmed'`,
);
