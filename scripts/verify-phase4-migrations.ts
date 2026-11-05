import 'reflect-metadata';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Client, Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { migrateDatabase } from './migrate';

const phase3Commit = 'f6cff80ddaea19fa9c2ac1954cf0b4f6c6de4e94';
const allowedName = /^manzanas_maracay_migration_test_[a-f0-9]{12}$/;
const tables = [
  'fruits',
  'varieties',
  'calibers',
  'product_variants',
  'packing_rules',
  'warehouses',
  'suppliers',
  'purchases',
  'purchase_lines',
  'lots',
  'containers',
  'stock_balances',
  'inventory_movements',
  'inventory_entries',
  'audit_events',
  'command_receipts',
  'clients',
  'price_lists',
  'price_items',
  'sales',
  'sale_lines',
  'sale_allocations',
  'sale_date_events',
  'sale_cancellations',
  'payments',
  'payment_applications',
  'payment_reversals',
  'bcv_rates',
  'inventory_cost_openings',
  'inventory_cost_entries',
  'app_users',
  'auth_sessions',
  'auth_login_buckets',
  'push_devices',
  'push_notices',
];
type Snapshot = {
  columns: Record<string, string[]>;
  rows: Record<string, unknown[]>;
  hashes: string[];
};
const root = process.cwd();
const runId = randomBytes(12).toString('hex');
const scratch = path.resolve(root, '.local', 'migration-phase4-qa', runId);
const report: Record<string, unknown> = {
  runId,
  phase3Commit,
  startedAt: new Date().toISOString(),
  fresh: false,
  upgrade: false,
  cleanup: [],
};
const created = new Set<string>();
function oldFile(name: string): Buffer {
  return execFileSync('git', ['show', `${phase3Commit}:${name}`], {
    cwd: root,
    maxBuffer: 5 * 1024 * 1024,
  });
}
function target(base: URL, name: string) {
  if (!allowedName.test(name)) throw new Error('Nombre temporal no permitido.');
  const url = new URL(base);
  url.pathname = `/${name}`;
  return url.toString();
}
async function snapshot(client: Client, columns?: Record<string, string[]>): Promise<Snapshot> {
  const definitions: Record<string, string[]> = {},
    rows: Record<string, unknown[]> = {};
  for (const table of tables) {
    definitions[table] =
      columns?.[table] ??
      (
        await client.query(
          "select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
          [table],
        )
      ).rows.map((r) => r.column_name);
    if (
      !definitions[table].length ||
      definitions[table].some((column) => !/^[a-z_][a-z0-9_]*$/.test(column))
    )
      throw new Error(`Columnas de fixture inesperadas en ${table}.`);
    const list = definitions[table].map((column) => `"${column}"`).join(',');
    rows[table] = (
      await client.query(
        `select to_jsonb(t) as value from (select ${list} from "${table}")t order by to_jsonb(t)::text`,
      )
    ).rows.map((r) => r.value);
  }
  const hashes = (
    await client.query('select hash from drizzle.__drizzle_migrations order by created_at')
  ).rows.map((r) => r.hash);
  return { columns: definitions, rows, hashes };
}
async function main() {
  if (process.env.MM_APP_ENV !== 'test')
    throw new Error('Usa MM_APP_ENV=test para verificar migraciones.');
  if (!process.env.MIGRATION_DATABASE_URL) throw new Error('Falta la conexión local de migración.');
  const base = new URL(process.env.MIGRATION_DATABASE_URL);
  if (
    !['postgres:', 'postgresql:'].includes(base.protocol) ||
    !['127.0.0.1', 'localhost'].includes(base.hostname) ||
    base.port !== '55432' ||
    base.username !== 'mm_owner'
  )
    throw new Error('Solo mm_owner en PostgreSQL local 127.0.0.1:55432. Nunca staging.');
  const resolved = path.resolve(scratch),
    expectedParent = path.resolve(root, '.local', 'migration-phase4-qa') + path.sep;
  if (!resolved.startsWith(expectedParent))
    throw new Error('Directorio temporal fuera del proyecto.');
  await fs.mkdir(scratch, { recursive: true });
  const oldRoot = path.join(scratch, 'phase3');
  const sourceFiles = execFileSync(
    'git',
    [
      'ls-tree',
      '-r',
      '--name-only',
      phase3Commit,
      'apps/api/src',
      'packages/domain/src',
      'packages/database/src',
    ],
    { cwd: root, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter((name) => name.endsWith('.ts'));
  for (const name of [...sourceFiles, 'apps/api/tsconfig.json', 'tsconfig.base.json']) {
    const destination = path.join(oldRoot, name);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, oldFile(name));
  }
  // Compile the immutable historical sources with their historical configuration.
  // Loading these services through tsx mixes loader settings for constructor decorators.
  // tsc emits CommonJS JavaScript wholly inside this run's isolated archive.
  execFileSync(
    process.execPath,
    [
      path.join(root, 'node_modules/typescript/bin/tsc'),
      '-p',
      path.join(oldRoot, 'apps/api/tsconfig.json'),
      '--noEmitOnError',
    ],
    { cwd: oldRoot, maxBuffer: 5 * 1024 * 1024 },
  );
  const legacyRequire = createRequire(
    pathToFileURL(path.join(oldRoot, 'apps/api/dist/apps/api/src/main.js')),
  );
  const importLegacy = (name: string) =>
    legacyRequire(path.join(oldRoot, 'apps/api/dist', name.replace(/\.ts$/, '.js')));
  const oldMigrations = path.join(oldRoot, 'packages/database/migrations');
  const journal = JSON.parse(
    oldFile('packages/database/migrations/meta/_journal.json').toString(),
  ) as { entries: { idx: number; tag: string }[] };
  assert.equal(
    journal.entries.length,
    11,
    'La base fija debe incluir exactamente las migraciones 0000..0010.',
  );
  await fs.mkdir(path.join(oldMigrations, 'meta'), { recursive: true });
  await fs.writeFile(path.join(oldMigrations, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries)
    await fs.writeFile(
      path.join(oldMigrations, `${entry.tag}.sql`),
      oldFile(`packages/database/migrations/${entry.tag}.sql`),
    );
  // An intermediate upgrade verifies the actual 0012 -> 0013 boundary as well
  // as the original phase-3 fixture. No applied SQL or original journal is edited.
  const currentMigrations = path.join(root, 'packages/database/migrations');
  const currentJournal = JSON.parse(
    await fs.readFile(path.join(currentMigrations, 'meta/_journal.json'), 'utf8'),
  ) as { entries: { idx: number; tag: string }[] };
  const phase4Journal = {
    ...currentJournal,
    entries: currentJournal.entries.filter((entry) => entry.idx <= 12),
  };
  assert.equal(phase4Journal.entries.length, 13);
  assert.equal(currentJournal.entries.length, 14, 'La prueba está fijada al hotfix aditivo 0013.');
  const phase4Migrations = path.join(scratch, 'phase4-13-migrations');
  await fs.mkdir(path.join(phase4Migrations, 'meta'), { recursive: true });
  await fs.writeFile(
    path.join(phase4Migrations, 'meta/_journal.json'),
    JSON.stringify(phase4Journal),
  );
  for (const entry of phase4Journal.entries)
    await fs.copyFile(
      path.join(currentMigrations, `${entry.tag}.sql`),
      path.join(phase4Migrations, `${entry.tag}.sql`),
    );
  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString(), statement_timeout: 30000 });
  await admin.connect();
  async function create() {
    const name = `manzanas_maracay_migration_test_${randomBytes(6).toString('hex')}`;
    if (
      !allowedName.test(name) ||
      (await admin.query('select 1 from pg_database where datname=$1', [name])).rowCount
    )
      throw new Error('La base temporal ya existe o su nombre no es seguro.');
    await admin.query(`create database "${name}" owner mm_owner`);
    created.add(name);
    await admin.query(`comment on database "${name}" is 'MM_PHASE4_MIGRATION_QA:${runId}'`);
    await admin.query(`revoke connect on database "${name}" from public`);
    return name;
  }
  try {
    const freshName = await create(),
      freshUrl = target(base, freshName);
    await migrateDatabase(freshUrl);
    const fresh = new Client({ connectionString: freshUrl });
    await fresh.connect();
    try {
      const expected = JSON.parse(
        await fs.readFile(
          path.join(root, 'packages/database/migrations/meta/_journal.json'),
          'utf8',
        ),
      ).entries.length;
      assert.equal(
        Number(
          (await fresh.query('select count(*) from drizzle.__drizzle_migrations')).rows[0].count,
        ),
        expected,
      );
      assert.equal(Number((await fresh.query('select count(*) from lots')).rows[0].count), 0);
      assert.equal(Number((await fresh.query('select count(*) from usdt_rates')).rows[0].count), 0);
      assert.equal(
        (
          await fresh.query(
            "select count(*) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public' and not c.convalidated",
          )
        ).rows[0].count,
        '0',
      );
      assert.equal(
        (await fresh.query("select has_table_privilege('mm_app','sales','insert') as allowed"))
          .rows[0].allowed,
        true,
      );
      report.fresh = {
        migrationCount: expected,
        noSyntheticOperationalData: true,
        constraintsValidated: true,
      };
    } finally {
      await fresh.end();
    }
    const upgradeName = await create(),
      upgradeUrl = target(base, upgradeName);
    const oldPool = new Pool({ connectionString: upgradeUrl, max: 1 });
    try {
      await migrate(drizzle(oldPool), { migrationsFolder: oldMigrations });
    } finally {
      await oldPool.end();
    }
    const db = new Client({ connectionString: upgradeUrl });
    await db.connect();
    let before: Snapshot, lotId: string;
    try {
      const fruit = randomUUID(),
        variety = randomUUID(),
        caliber = randomUUID(),
        variant = randomUUID(),
        configuration = randomUUID();
      await db.query("insert into fruits(id,name) values($1,'DEMO migración Manzana')", [fruit]);
      await db.query("insert into varieties(id,fruit_id,name) values($1,$2,'Gala')", [
        variety,
        fruit,
      ]);
      await db.query("insert into calibers(id,fruit_id,label) values($1,$2,'80')", [
        caliber,
        fruit,
      ]);
      await db.query(
        'insert into product_variants(id,fruit_id,variety_id,caliber_id) values($1,$2,$3,$4)',
        [variant, fruit, variety, caliber],
      );
      await db.query('insert into packing_rules(id,variant_id,blisters_per_box) values($1,$2,5)', [
        configuration,
        variant,
      ]);
      const savedUrl = process.env.DATABASE_URL;
      process.env.DATABASE_URL = upgradeUrl;
      try {
        const legacy = await importLegacy('apps/api/src/inventory.service.ts');
        const inventory = new legacy.InventoryService();
        try {
          const actor = randomUUID(),
            supplier = await inventory.saveSupplier(
              { name: 'DEMO proveedor migración' },
              randomUUID(),
              actor,
            );
          const receipt = await inventory.receive(
            {
              supplierId: supplier.id,
              reference: `DEMO-${runId}`,
              receivedAt: new Date().toISOString(),
              isDemo: true,
              lines: [{ configurationId: configuration, boxes: 3, unitCostUsd: '30' }],
            },
            randomUUID(),
            actor,
          );
          lotId = receipt.lots[0].id;
          await inventory.operate(
            lotId,
            'withdraw-blisters',
            { quantity: 1, reason: 'Retiro DEMO previo a actualización' },
            randomUUID(),
            actor,
          );
          const old = await inventory.detail(lotId);
          assert.equal(old.lot.closedBoxes, 2);
          assert.equal(old.lot.intactBlisters, 4);
          assert.equal(old.lot.equivalentIntactBlisters, 14);
          const commerceModule = await importLegacy('apps/api/src/commerce.service.ts');
          const bcvModule = await importLegacy('apps/api/src/bcv.service.ts');
          const bcv = new bcvModule.BcvService();
          const commerce = new commerceModule.CommerceService(inventory, bcv);
          try {
            const customer = await commerce.saveClient(
              { name: 'DEMO historial previo Fase 4', isDemo: true },
              randomUUID(),
              actor,
            );
            await commerce.savePrices(
              {
                items: [
                  { variantId: variant, presentation: 'blister', promoUsd: '10', regularUsd: '12' },
                ],
              },
              randomUUID(),
              actor,
            );
            const sale = await commerce.createSale(
              {
                clientId: customer.id,
                condition: 'credit',
                soldAt: new Date().toISOString(),
                lines: [
                  {
                    configurationId: configuration,
                    presentation: 'blister',
                    quantity: 1,
                    priceBasis: 'usd_cash_promo',
                    agreedUnitUsd: '10',
                  },
                ],
              },
              randomUUID(),
              actor,
            );
            const payment = await commerce.createPayment(
              {
                clientId: customer.id,
                currency: 'USD',
                amount: '4',
                method: 'QA efectivo',
                receivedAt: new Date().toISOString(),
                applications: [{ saleId: sale.id, amountUsd: '4' }],
              },
              randomUUID(),
              actor,
            );
            await commerce.reversePayment(
              payment.id,
              { reason: 'Reversa histórica de QA previa a migración' },
              randomUUID(),
              actor,
            );
            await commerce.cancelSale(
              sale.id,
              { reason: 'Anulación histórica de QA previa a migración' },
              randomUUID(),
              actor,
            );
          } finally {
            await commerce.onModuleDestroy();
            await bcv.onModuleDestroy();
          }
        } finally {
          await inventory.onModuleDestroy();
        }
      } finally {
        if (savedUrl === undefined) delete process.env.DATABASE_URL;
        else process.env.DATABASE_URL = savedUrl;
      }
      before = await snapshot(db);
    } finally {
      await db.end();
    }
    const phase4Pool = new Pool({ connectionString: upgradeUrl, max: 1 });
    let phase4Before: Snapshot;
    let phase4Binding: unknown;
    try {
      await migrate(drizzle(phase4Pool), { migrationsFolder: phase4Migrations });
      const phase4Read = await phase4Pool.connect();
      try {
        phase4Before = await snapshot(phase4Read as unknown as Client);
        assert.equal(phase4Before.hashes.length, 13);
        phase4Binding = (
          await phase4Read.query('select to_jsonb(e) as value from runtime_environment e')
        ).rows;
      } finally {
        phase4Read.release();
      }
    } finally {
      await phase4Pool.end();
    }
    await migrateDatabase(upgradeUrl);
    const updated = new Client({ connectionString: upgradeUrl });
    await updated.connect();
    try {
      const phase4After = await snapshot(updated, phase4Before!.columns);
      assert.deepEqual(
        phase4After.rows,
        phase4Before!.rows,
        '0013 modificó una fila comercial o de acceso previa de fase 4.',
      );
      assert.deepEqual(
        phase4After.hashes.slice(0, 13),
        phase4Before!.hashes,
        '0013 cambió alguno de los trece hashes históricos.',
      );
      assert.deepEqual(
        (await updated.query('select to_jsonb(e) as value from runtime_environment e')).rows,
        phase4Binding,
        'Cambió el vínculo inmutable del entorno.',
      );
      assert.equal(
        (
          await updated.query(
            "select count(*)::int as count from sales where settlement_basis<>'legacy_bcv'",
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (
          await updated.query(
            'select count(*)::int as count from payments where usdt_rate_id is not null',
          )
        ).rows[0].count,
        0,
      );
      assert.equal(
        (await updated.query('select count(*)::int as count from usdt_rates')).rows[0].count,
        0,
      );
      report.phase4Upgrade = {
        fromMigrationCount: 13,
        toMigrationCount: phase4After.hashes.length,
        preservedTables: tables.length,
        preservedPriorMigrationHashes: 13,
        runtimeBindingPreserved: true,
        oldSalesRemainLegacyBcv: true,
        historicalPaymentsNotReclassified: true,
        noSyntheticRates: true,
      };
      const after = await snapshot(updated, before!.columns);
      assert.deepEqual(
        after.rows,
        before!.rows,
        'La migración modificó una identidad, cantidad, costo, documento o snapshot histórico de fase 3.',
      );
      assert.deepEqual(
        after.hashes.slice(0, 11),
        before!.hashes,
        'Cambió el historial de migraciones ya aplicado.',
      );
      const stock = (
        await updated.query(
          `select count(*) filter(where s.unit='sealed_box' and s.quantity=1)::integer as boxes,
        count(*) filter(where s.unit='intact_blister' and s.quantity=1)::integer as blisters,
        sum(s.cost_usd)::numeric(18,4)::text as cost,count(*) filter(where s.counted_pieces is not null)::integer as counted
        from stock_balances s join containers c on c.id=s.container_id where c.lot_id=$1`,
          [lotId!],
        )
      ).rows[0];
      assert.deepEqual(stock, { boxes: 2, blisters: 4, cost: '84.0000', counted: 0 });
      const openings = (
        await updated.query('select count(*)::integer as count from inventory_cost_openings')
      ).rows[0].count;
      assert.equal(
        openings,
        0,
        'Fase 3 ya conserva el ledger de costo; no debe inventar aperturas nuevas.',
      );
      assert.equal(
        (
          await updated.query(
            "select count(*)::int as count from lots where confirmation_status_snapshot='legacy_unverified'",
          )
        ).rows[0].count,
        1,
      );
      assert.equal(
        (await updated.query('select count(*)::int as count from sale_cancellations')).rows[0]
          .count,
        1,
      );
      assert.equal(
        (await updated.query('select count(*)::int as count from payment_reversals')).rows[0].count,
        1,
      );
      assert.equal(
        (await updated.query('select environment from runtime_environment where singleton')).rows[0]
          .environment,
        'test',
      );
      report.upgrade = {
        oldConfirmationNotInvented: true,
        cancelledSaleAndReversedPaymentPreserved: true,
        preservedTables: tables.length,
        preservedOldMigrationHashes: 11,
        closedBoxes: 2,
        intactBlisters: 4,
        equivalentBlisters: 14,
        remainingCostUsd: '84.0000',
        originalCostUsd: '90.0000',
        unknownPiecesPreserved: true,
        costOpeningRows: openings,
      };
    } finally {
      await updated.end();
    }
  } finally {
    const cleanup: { database: string; removed: boolean }[] = [];
    for (const name of created) {
      try {
        if (!allowedName.test(name)) throw new Error('Nombre no autorizado.');
        const row = (
          await admin.query(
            "select pg_get_userbyid(datdba) as owner,shobj_description(oid,'pg_database') as marker from pg_database where datname=$1",
            [name],
          )
        ).rows[0];
        if (row?.owner !== 'mm_owner' || row.marker !== `MM_PHASE4_MIGRATION_QA:${runId}`)
          throw new Error('No coincide la marca de esta ejecución.');
        await admin.query(`drop database "${name}"`);
        cleanup.push({ database: name, removed: true });
      } catch {
        cleanup.push({ database: name, removed: false });
      }
    }
    report.cleanup = cleanup;
    await admin.end();
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(path.join(scratch, 'report.json'), JSON.stringify(report, null, 2));
    if (cleanup.some((item) => !item.removed))
      throw new Error(
        `Quedó una base temporal sin retirar; no se forzó su borrado. Revisa ${path.join(scratch, 'report.json')}.`,
      );
  }
  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidencia local: ${path.join(scratch, 'report.json')}`);
}
main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falló la verificación aislada de migraciones.',
  );
  process.exitCode = 1;
});
