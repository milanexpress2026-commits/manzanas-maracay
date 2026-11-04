import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, and, asc, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import * as schema from '../../../packages/database/src/schema';
import {
  fruitSchema,
  varietySchema,
  caliberSchema,
  configurationSchema,
  updatePackingSchema,
} from '../../../packages/domain/src/index';
import { z } from 'zod';

@Injectable()
export class CatalogService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  readonly db = drizzle(this.pool, { schema });
  constructor() {
    this.pool.on('error', () =>
      console.warn(
        'Se perdió una conexión inactiva con PostgreSQL. Se reintentará en la próxima consulta.',
      ),
    );
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async health() {
    await this.pool.query('select 1');
    return { status: 'ok', storage: 'postgresql', scope: 'local-phase-1' };
  }
  async read() {
    return this.db.transaction(
      async (tx) => {
        // One connection, one consistent snapshot: sequence queries rather than queueing them concurrently.
        const fruits = await tx
          .select({ id: schema.fruits.id, name: schema.fruits.name })
          .from(schema.fruits)
          .orderBy(asc(schema.fruits.name));
        const varieties = await tx
          .select({
            id: schema.varieties.id,
            name: schema.varieties.name,
            fruitId: schema.varieties.fruitId,
          })
          .from(schema.varieties)
          .orderBy(asc(schema.varieties.name));
        const calibers = await tx
          .select({
            id: schema.calibers.id,
            label: schema.calibers.label,
            fruitId: schema.calibers.fruitId,
          })
          .from(schema.calibers)
          .orderBy(asc(schema.calibers.label));
        const configurations = await tx
          .select({
            id: schema.packingRules.id,
            variantId: schema.variants.id,
            fruitId: schema.fruits.id,
            varietyId: schema.varieties.id,
            caliberId: schema.calibers.id,
            fruit: schema.fruits.name,
            variety: schema.varieties.name,
            caliber: schema.calibers.label,
            blistersPerBox: schema.packingRules.blistersPerBox,
            notes: schema.packingRules.notes,
            version: schema.packingRules.version,
          })
          .from(schema.packingRules)
          .innerJoin(schema.variants, eq(schema.packingRules.variantId, schema.variants.id))
          .innerJoin(schema.fruits, eq(schema.variants.fruitId, schema.fruits.id))
          .innerJoin(schema.varieties, eq(schema.variants.varietyId, schema.varieties.id))
          .innerJoin(schema.calibers, eq(schema.variants.caliberId, schema.calibers.id))
          .orderBy(asc(schema.fruits.name), asc(schema.varieties.name), asc(schema.calibers.label));
        return { fruits, varieties, calibers, configurations };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async mutate(kind: string, body: unknown, key: string | undefined, id?: string) {
    if (!key || !z.uuid().safeParse(key).success)
      throw new BadRequestException('Falta una clave válida para guardar sin duplicados.');
    const parsed =
      kind === 'fruits'
        ? fruitSchema.parse(body)
        : kind === 'varieties'
          ? varietySchema.parse(body)
          : kind === 'calibers'
            ? caliberSchema.parse(body)
            : kind === 'configurations'
              ? configurationSchema.parse(body)
              : updatePackingSchema.parse(body);
    if (id && !z.uuid().safeParse(id).success)
      throw new BadRequestException('Identificador inválido.');
    const hash = createHash('sha256')
      .update(JSON.stringify({ kind, id, body: parsed }))
      .digest('hex');
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key},0))`);
      const [receipt] = await tx
        .select()
        .from(schema.commandReceipts)
        .where(eq(schema.commandReceipts.key, key));
      if (receipt) {
        if (receipt.requestHash !== hash)
          throw new ConflictException('Esta solicitud ya se usó con otros datos.');
        return receipt.response;
      }
      let result: Record<string, unknown>,
        before: unknown = null;
      if (kind === 'fruits') {
        [result] = await tx.insert(schema.fruits).values(fruitSchema.parse(parsed)).returning();
      } else if (kind === 'varieties') {
        [result] = await tx
          .insert(schema.varieties)
          .values(varietySchema.parse(parsed))
          .returning();
      } else if (kind === 'calibers') {
        [result] = await tx.insert(schema.calibers).values(caliberSchema.parse(parsed)).returning();
      } else if (kind === 'configurations') {
        const data = configurationSchema.parse(parsed);
        const [validVariety] = await tx
          .select({ id: schema.varieties.id })
          .from(schema.varieties)
          .where(
            and(
              eq(schema.varieties.id, data.varietyId),
              eq(schema.varieties.fruitId, data.fruitId),
            ),
          );
        const [validCaliber] = await tx
          .select({ id: schema.calibers.id })
          .from(schema.calibers)
          .where(
            and(eq(schema.calibers.id, data.caliberId), eq(schema.calibers.fruitId, data.fruitId)),
          );
        if (!validVariety || !validCaliber)
          throw new BadRequestException(
            'La variedad y el calibre deben pertenecer a la fruta seleccionada.',
          );
        const [variant] = await tx
          .insert(schema.variants)
          .values({ fruitId: data.fruitId, varietyId: data.varietyId, caliberId: data.caliberId })
          .returning();
        [result] = await tx
          .insert(schema.packingRules)
          .values({ variantId: variant.id, blistersPerBox: data.blistersPerBox, notes: data.notes })
          .returning();
      } else {
        const data = updatePackingSchema.parse(parsed);
        const [existing] = await tx
          .select()
          .from(schema.packingRules)
          .where(eq(schema.packingRules.id, id!))
          .for('update');
        if (!existing) throw new NotFoundException('La configuración ya no existe.');
        if (existing.version !== data.version)
          throw new ConflictException(
            'Otra edición cambió este empaque. Cierra el formulario, actualiza el catálogo y vuelve a intentarlo.',
          );
        before = existing;
        [result] = await tx
          .update(schema.packingRules)
          .set({
            blistersPerBox: data.blistersPerBox,
            notes: data.notes,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(
            and(eq(schema.packingRules.id, id!), eq(schema.packingRules.version, data.version)),
          )
          .returning();
      }
      const response = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
      await tx
        .insert(schema.auditEvents)
        .values({
          entityType: kind,
          entityId: result.id as string,
          action: id ? 'update' : 'create',
          before,
          after: response,
          actor: 'local-owner',
          requestId: key,
        });
      await tx.insert(schema.commandReceipts).values({ key, requestHash: hash, response });
      return response;
    });
  }
}
