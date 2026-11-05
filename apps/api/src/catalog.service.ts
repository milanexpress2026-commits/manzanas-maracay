import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  OnModuleDestroy,
} from '@nestjs/common';
import { Pool } from 'pg';
import { drizzle, type NodePgTransaction } from 'drizzle-orm/node-postgres';
import { eq, and, asc, sql, type ExtractTablesWithRelations } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import * as schema from '../../../packages/database/src/schema';
import {
  fruitSchema,
  varietySchema,
  caliberSchema,
  caliberBatchSchema,
  configurationSchema,
  updatePackingSchema,
  updateVarietySchema,
  confirmedPresentationsReady,
  catalogPreparationInputSchema,
  catalogPreparationSchema,
  catalogConfigurationBatchSchema,
  catalogNameKey,
  previewCatalogPreparation,
  emptyCatalogPreparationCounts,
  type Catalog,
  type CatalogPreparedConfiguration,
  type CatalogPreparationResult,
} from '../../../packages/domain/src/index';
import { z } from 'zod';
import { assertBusinessWritesReady, operationsReady } from './production-state';
import { authConfig } from './auth/config';
type CatalogTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

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
    return {
      status: 'ok',
      storage: 'postgresql',
      scope: 'phase-4',
      release: process.env.MM_RELEASE ?? 'local',
      environment: authConfig().environment,
      ready: operationsReady(),
    };
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
            commercialLine: schema.variants.commercialLine,
            packingModel: schema.packingRules.packingModel,
            halfPreparation: schema.packingRules.halfPreparation,
            allowedPresentations: schema.packingRules.allowedPresentations,
            boxWeightKg: schema.packingRules.boxWeightKg,
            confirmationStatus: schema.packingRules.confirmationStatus,
            notes: schema.packingRules.notes,
            version: schema.packingRules.version,
          })
          .from(schema.packingRules)
          .innerJoin(schema.variants, eq(schema.packingRules.variantId, schema.variants.id))
          .innerJoin(schema.fruits, eq(schema.variants.fruitId, schema.fruits.id))
          .leftJoin(schema.varieties, eq(schema.variants.varietyId, schema.varieties.id))
          .leftJoin(schema.calibers, eq(schema.variants.caliberId, schema.calibers.id))
          .orderBy(asc(schema.fruits.name), asc(schema.varieties.name), asc(schema.calibers.label));
        const prices = await tx
          .select({
            variantId: schema.priceItems.variantId,
            presentation: schema.priceItems.presentation,
            unitUsd: schema.priceItems.unitUsd,
            basis: schema.priceLists.paymentBasis,
          })
          .from(schema.priceItems)
          .innerJoin(schema.priceLists, eq(schema.priceItems.priceListId, schema.priceLists.id));
        return {
          fruits,
          varieties,
          calibers,
          configurations: configurations.map((c) => ({
            ...c,
            prices: c.allowedPresentations.map((presentation) => ({
              presentation,
              promoUsd:
                prices.find(
                  (p) =>
                    p.variantId === c.variantId &&
                    p.presentation === presentation &&
                    p.basis === 'usd_cash_promo',
                )?.unitUsd ?? null,
              regularUsd:
                prices.find(
                  (p) =>
                    p.variantId === c.variantId &&
                    p.presentation === presentation &&
                    p.basis === 'ves_regular',
                )?.unitUsd ?? null,
            })),
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async preparationPreview(body: unknown) {
    const data = catalogPreparationInputSchema.parse(body);
    return previewCatalogPreparation(data, (await this.read()) as Catalog);
  }
  private async ensureConfiguration(
    tx: CatalogTransaction,
    data: z.infer<typeof configurationSchema>,
  ): Promise<CatalogPreparedConfiguration> {
    const [fruit] = await tx
      .select({ id: schema.fruits.id })
      .from(schema.fruits)
      .where(eq(schema.fruits.id, data.fruitId));
    const [variety] = data.varietyId
      ? await tx
          .select({ id: schema.varieties.id })
          .from(schema.varieties)
          .where(
            and(
              eq(schema.varieties.id, data.varietyId),
              eq(schema.varieties.fruitId, data.fruitId),
            ),
          )
      : [true];
    const [caliber] = data.caliberId
      ? await tx
          .select({ id: schema.calibers.id })
          .from(schema.calibers)
          .where(
            and(eq(schema.calibers.id, data.caliberId), eq(schema.calibers.fruitId, data.fruitId)),
          )
      : [true];
    if (!fruit || !variety || !caliber)
      throw new BadRequestException(
        'La fruta, variedad y calibre deben corresponder a la combinación revisada.',
      );
    const [inserted] = await tx
      .insert(schema.variants)
      .values({
        fruitId: data.fruitId,
        varietyId: data.varietyId,
        caliberId: data.caliberId,
        commercialLine: data.commercialLine,
      })
      .onConflictDoNothing()
      .returning();
    const [existing] = inserted
      ? [inserted]
      : await tx
          .select()
          .from(schema.variants)
          .where(
            and(
              eq(schema.variants.fruitId, data.fruitId),
              sql`${schema.variants.varietyId} is not distinct from ${data.varietyId}::uuid`,
              sql`${schema.variants.caliberId} is not distinct from ${data.caliberId}::uuid`,
              eq(schema.variants.commercialLine, data.commercialLine),
            ),
          );
    if (!existing) throw new ConflictException('Cambió la combinación. Actualiza el catálogo.');
    const [packing] = await tx
      .insert(schema.packingRules)
      .values({
        variantId: existing.id,
        blistersPerBox: data.blistersPerBox,
        packingModel: data.packingModel,
        halfPreparation: data.halfPreparation,
        allowedPresentations: data.allowedPresentations,
        boxWeightKg: data.boxWeightKg,
        confirmationStatus: 'pending',
        notes: data.notes,
      })
      .onConflictDoNothing()
      .returning();
    const [rule] = packing
      ? [packing]
      : await tx
          .select()
          .from(schema.packingRules)
          .where(eq(schema.packingRules.variantId, existing.id));
    if (!rule) throw new ConflictException('Cambió el empaque. Actualiza el catálogo.');
    // Reusing a combination never changes its name, version, prices or confirmed packaging.
    return {
      id: rule.id,
      variantId: existing.id,
      created: !!packing,
      confirmationStatus: rule.confirmationStatus as 'pending' | 'confirmed',
    };
  }
  async mutate(kind: string, body: unknown, key: string | undefined, id?: string, actor?: string) {
    assertBusinessWritesReady();
    if (!actor || !z.uuid().safeParse(actor).success)
      throw new BadRequestException('Falta el usuario autenticado.');
    if (!key || !z.uuid().safeParse(key).success)
      throw new BadRequestException('Falta una clave válida para guardar sin duplicados.');
    const parsed =
      kind === 'preparation'
        ? catalogPreparationSchema.parse(body)
        : kind === 'configurations-batch'
          ? catalogConfigurationBatchSchema.parse(body)
          : kind === 'calibers-batch'
            ? caliberBatchSchema.parse(body)
            : kind === 'update-variety'
              ? updateVarietySchema.parse(body)
              : kind === 'fruits'
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
    if (
      authConfig().environment === 'production' &&
      'confirmationStatus' in parsed &&
      !confirmedPresentationsReady(parsed)
    )
      throw new BadRequestException(
        'Confirma únicamente presentaciones con cantidad de blíster y preparación de media conocidas. Puedes dejar solo Caja habilitada.',
      );
    const hash = createHash('sha256')
      .update(JSON.stringify({ kind, id, body: parsed, actor }))
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
      // Catalog commands share a short lock; unique indexes additionally protect
      // external concurrent writers. Always acquire this after the command key.
      await tx.execute(sql`select pg_advisory_xact_lock(68493004)`);
      let result: Record<string, unknown>,
        before: unknown = null;
      if (kind === 'preparation') {
        const data = catalogPreparationSchema.parse(parsed);
        const response: CatalogPreparationResult = {
          id: key,
          created: emptyCatalogPreparationCounts(),
          reused: emptyCatalogPreparationCounts(),
          fruits: [],
        };
        for (const fruit of [...data.fruits].sort((a, b) =>
          catalogNameKey(a.name).localeCompare(catalogNameKey(b.name)),
        )) {
          const [inserted] = await tx
            .insert(schema.fruits)
            .values({ name: fruit.name })
            .onConflictDoNothing()
            .returning();
          const [existing] = inserted
            ? [inserted]
            : await tx
                .select()
                .from(schema.fruits)
                .where(sql`lower(btrim(${schema.fruits.name}))=lower(btrim(${fruit.name}))`);
          if (!existing) throw new ConflictException('Cambió el catálogo. Vuelve a intentar.');
          (inserted ? response.created : response.reused).fruits++;
          const createdVarieties = fruit.varieties.length
            ? await tx
                .insert(schema.varieties)
                .values(fruit.varieties.map((name) => ({ fruitId: existing.id, name })))
                .onConflictDoNothing()
                .returning()
            : [];
          const createdCalibers = fruit.calibers.length
            ? await tx
                .insert(schema.calibers)
                .values(fruit.calibers.map((label) => ({ fruitId: existing.id, label })))
                .onConflictDoNothing()
                .returning()
            : [];
          const varieties = (
            await tx
              .select()
              .from(schema.varieties)
              .where(eq(schema.varieties.fruitId, existing.id))
          ).filter((row) =>
            fruit.varieties.some((name) => catalogNameKey(name) === catalogNameKey(row.name)),
          );
          const calibers = (
            await tx.select().from(schema.calibers).where(eq(schema.calibers.fruitId, existing.id))
          ).filter((row) =>
            fruit.calibers.some((label) => catalogNameKey(label) === catalogNameKey(row.label)),
          );
          response.created.varieties += createdVarieties.length;
          response.created.calibers += createdCalibers.length;
          response.reused.varieties += varieties.length - createdVarieties.length;
          response.reused.calibers += calibers.length - createdCalibers.length;
          const configurations: CatalogPreparedConfiguration[] = [];
          for (const draft of fruit.drafts) {
            const rule = await this.ensureConfiguration(
              tx,
              configurationSchema.parse({
                fruitId: existing.id,
                varietyId: draft.varietyName
                  ? varieties.find(
                      (row) => catalogNameKey(row.name) === catalogNameKey(draft.varietyName!),
                    )!.id
                  : null,
                caliberId: draft.caliberLabel
                  ? calibers.find(
                      (row) => catalogNameKey(row.label) === catalogNameKey(draft.caliberLabel!),
                    )!.id
                  : null,
                commercialLine: draft.commercialLine,
                blistersPerBox: draft.blistersPerBox,
                packingModel: draft.packingModel,
                halfPreparation: draft.halfPreparation,
                allowedPresentations: draft.allowedPresentations,
                boxWeightKg: draft.boxWeightKg,
                confirmationStatus: 'pending',
                notes: draft.notes,
              }),
            );
            configurations.push(rule);
            (rule.created ? response.created : response.reused).configurations++;
          }
          response.fruits.push({
            id: existing.id,
            name: existing.name,
            varieties: varieties.map(({ id, name }) => ({ id, name })),
            calibers: calibers.map(({ id, label }) => ({ id, label })),
            configurations,
          });
        }
        result = { ...response };
      } else if (kind === 'configurations-batch') {
        const data = catalogConfigurationBatchSchema.parse(parsed);
        const configurations: CatalogPreparedConfiguration[] = [];
        for (const row of data.configurations)
          configurations.push(await this.ensureConfiguration(tx, row));
        const createdCount = configurations.filter((row) => row.created).length;
        result = {
          id: key,
          configurations,
          createdCount,
          reusedCount: configurations.length - createdCount,
        };
      } else if (kind === 'calibers-batch') {
        const data = caliberBatchSchema.parse(parsed);
        const [fruit] = await tx
          .select()
          .from(schema.fruits)
          .where(eq(schema.fruits.id, data.fruitId));
        if (!fruit) throw new NotFoundException('Selecciona una fruta existente.');
        // Serialize each fruit's batch, then insert in a stable order. The unique index
        // also protects this path against concurrent single-caliber creation.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${'calibers:' + data.fruitId},0))`,
        );
        const labels = [
          ...new Map(data.labels.map((label) => [label.toLowerCase(), label])).values(),
        ].sort();
        const calibers: { id: string; fruitId: string; label: string }[] = [];
        let createdCount = 0;
        for (const label of labels) {
          const [created] = await tx
            .insert(schema.calibers)
            .values({ fruitId: data.fruitId, label })
            .onConflictDoNothing()
            .returning();
          if (created) {
            calibers.push(created);
            createdCount++;
          } else {
            const [existing] = await tx
              .select()
              .from(schema.calibers)
              .where(
                and(
                  eq(schema.calibers.fruitId, data.fruitId),
                  sql`lower(btrim(${schema.calibers.label}))=lower(btrim(${label}))`,
                ),
              );
            if (!existing) throw new ConflictException('Cambió el catálogo. Vuelve a intentar.');
            calibers.push(existing);
          }
        }
        result = {
          id: data.fruitId,
          calibers: calibers.map(({ id, fruitId, label }) => ({ id, fruitId, label })),
          createdCount,
          reusedCount: calibers.length - createdCount,
        };
      } else if (kind === 'update-variety') {
        const data = updateVarietySchema.parse(parsed);
        const [existing] = await tx
          .select()
          .from(schema.varieties)
          .where(eq(schema.varieties.id, id!))
          .for('update');
        if (!existing) throw new NotFoundException('La variedad ya no existe.');
        if (existing.name !== data.expectedName)
          throw new ConflictException('Otra persona editó el nombre. Actualiza el catálogo.');
        before = existing;
        [result] = await tx
          .update(schema.varieties)
          .set({ name: data.name })
          .where(eq(schema.varieties.id, id!))
          .returning();
      } else if (kind === 'fruits') {
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
        const [validVariety] = data.varietyId
          ? await tx
              .select({ id: schema.varieties.id })
              .from(schema.varieties)
              .where(
                and(
                  eq(schema.varieties.id, data.varietyId),
                  eq(schema.varieties.fruitId, data.fruitId),
                ),
              )
          : [true];
        const [validCaliber] = data.caliberId
          ? await tx
              .select({ id: schema.calibers.id })
              .from(schema.calibers)
              .where(
                and(
                  eq(schema.calibers.id, data.caliberId),
                  eq(schema.calibers.fruitId, data.fruitId),
                ),
              )
          : [true];
        if (!validVariety || !validCaliber)
          throw new BadRequestException(
            'La variedad y el calibre deben pertenecer a la fruta seleccionada.',
          );
        const [variant] = await tx
          .insert(schema.variants)
          .values({
            fruitId: data.fruitId,
            varietyId: data.varietyId,
            caliberId: data.caliberId,
            commercialLine: data.commercialLine,
          })
          .returning();
        [result] = await tx
          .insert(schema.packingRules)
          .values({
            variantId: variant.id,
            blistersPerBox: data.blistersPerBox,
            notes: data.notes,
            packingModel: data.packingModel,
            halfPreparation: data.halfPreparation,
            allowedPresentations: data.allowedPresentations,
            boxWeightKg: data.boxWeightKg,
            confirmationStatus: data.confirmationStatus,
          })
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
            packingModel: data.packingModel,
            halfPreparation: data.halfPreparation,
            allowedPresentations: data.allowedPresentations,
            boxWeightKg: data.boxWeightKg,
            confirmationStatus: data.confirmationStatus,
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
      await tx.insert(schema.auditEvents).values({
        entityType: kind,
        entityId: result.id as string,
        action: id ? 'update' : 'create',
        before,
        after: response,
        actor,
        requestId: key,
      });
      await tx.insert(schema.commandReceipts).values({ key, requestHash: hash, response });
      return response;
    });
  }
}
