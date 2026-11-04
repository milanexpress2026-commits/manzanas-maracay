import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {
  fruits,
  varieties,
  calibers,
  variants,
  packingRules,
  auditEvents,
} from '../packages/database/src/schema';
import { assertDatabase } from './migrate';
import { randomUUID } from 'node:crypto';
async function seed() {
  const pool = new Pool({
    connectionString: assertDatabase(process.env.MIGRATION_DATABASE_URL),
    max: 1,
  });
  try {
    const db = drizzle(pool);
    await db.transaction(async (tx) => {
      await tx.execute(`select pg_advisory_xact_lock(68493002)`);
      // Seed only a completely empty catalog. Re-runs never restore or overwrite edited examples.
      if ((await tx.select().from(fruits).limit(1)).length) {
        console.log('Catálogo existente conservado.');
        return;
      }
      const requestId = randomUUID();
      const [apple] = await tx.insert(fruits).values({ name: 'Manzana' }).returning();
      await tx.insert(fruits).values({ name: 'Pera' });
      const [gala] = await tx
        .insert(varieties)
        .values({ fruitId: apple.id, name: 'Gala' })
        .returning();
      await tx.insert(varieties).values({ fruitId: apple.id, name: 'Pink Lady' });
      for (const [label, blistersPerBox] of [
        ['80', 5],
        ['180', 4],
      ] as const) {
        const [caliber] = await tx
          .insert(calibers)
          .values({ fruitId: apple.id, label })
          .returning();
        const [variant] = await tx
          .insert(variants)
          .values({ fruitId: apple.id, varietyId: gala.id, caliberId: caliber.id })
          .returning();
        const [rule] = await tx
          .insert(packingRules)
          .values({
            variantId: variant.id,
            blistersPerBox,
            notes:
              'Configuración inicial indicada por el propietario. Verificar el empaque de cada lote.',
          })
          .returning();
        await tx
          .insert(auditEvents)
          .values({
            entityType: 'packing_rule',
            entityId: rule.id,
            action: 'seed',
            actor: 'initial-catalog',
            requestId,
            after: rule,
          });
      }
      console.log('Ejemplos de catálogo cargados; no se crearon existencias, ventas ni tasas.');
    });
  } finally {
    await pool.end();
  }
}
seed().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
