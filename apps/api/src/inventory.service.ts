import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  UnauthorizedException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { allocateCost, replayLegacyCosts } from '../../../packages/domain/src/costing';
import { applyPresentationPrices } from './commerce-prices';
import { resolveReceiptProduct, type ReceiptRule } from './catalog-receipt';
import { assertBusinessWritesReady, commandIsDemo } from './production-state';
import { authConfig } from './auth/config';
import { markBusinessCommandRejection } from './command-rejection';
import {
  countSellablePresentation,
  type SaleAvailability,
} from '../../../packages/domain/src/sale-availability';
import {
  salePreviewSchema,
  planPhysicalSale,
  previewPhysicalSale,
  type SalePreviewResult,
  type SalePlannerRule,
  type SalePlannerLot,
  type SalePlannerStock,
} from '../../../packages/domain/src/sale-planner';
import {
  supplierSchema,
  updateSupplierSchema,
  receiptSchema,
  quickReceiptSchema,
  simpleReceiptSchema,
  formatReceiptNumber,
  businessDate,
  type QuickReceipt,
  type SimpleReceipt,
  type ReceiptOptions,
  type PreviousReceiptCost,
  openBoxSchema,
  withdrawBlistersSchema,
  openBlisterSchema,
  prepareHalfSchema,
  adjustmentSchema,
  reversalSchema,
  inventoryFilterSchema,
  summarizeContainers,
  emptyStockSummary,
  type Supplier,
  type ContainerStock,
  type LotSummary,
  type InventoryOverview,
  type LotDetail,
  type InventoryMovement,
  type ReceiptResult,
  type InventoryCommandResult,
  type PackingModel,
  type HalfPreparation,
  type Presentation,
  type SaleAllocation,
} from '../../../packages/domain/src/index';

type LotRow = {
  id: string;
  code: string;
  blisters_per_box_snapshot: number | null;
  packing_model_snapshot: PackingModel;
  half_preparation_snapshot: HalfPreparation;
  allowed_presentations_snapshot: Presentation[];
  unit_cost_usd: string | null;
  commercial_unit_label_snapshot: string | null;
  inventory_version: number;
};
type StateMap = Map<string, ContainerStock>;
type ResolvedReceipt = Omit<z.infer<typeof receiptSchema>, 'supplierId' | 'reference' | 'lines'> & {
  supplierId: string | null;
  reference: string | null;
  lines: (Omit<z.infer<typeof receiptSchema>['lines'][number], 'unitCostUsd'> & {
    unitCostUsd: string | null;
  })[];
};
const containerSelect = `select c.id,c.lot_id as "lotId",c.warehouse_id as "warehouseId",c.parent_id as "parentId",
  c.kind,c.state,s.unit,s.quantity,s.counted_pieces as "countedPieces",s.version,s.cost_usd as "costUsd"
  from containers c join stock_balances s on s.container_id=c.id`;
const supplierSelect = `select id,name,tax_id as "taxId",phone,notes,active,version from suppliers`;
const lotSelect = `select l.id,l.code,l.packing_rule_id as "configurationId",v.fruit_id as "fruitId",
  v.variety_id as "varietyId",v.caliber_id as "caliberId",f.name as fruit,vr.name as variety,cl.label as caliber,
  v.commercial_line as "commercialLine",l.packing_model_snapshot as "packingModel",l.half_preparation_snapshot as "halfPreparation",
  l.allowed_presentations_snapshot as "allowedPresentations",l.box_weight_kg_snapshot as "boxWeightKgSnapshot",
  l.supplier_id as "supplierId",sp.name as supplier,l.received_at as "receivedAt",l.received_boxes as "receivedBoxes",
  l.blisters_per_box_snapshot as "blistersPerBox",null::numeric as "unitCostUsd",l.commercial_unit_label_snapshot as "commercialUnitLabel",l.notes,l.is_demo as "isDemo",
  l.inventory_version as version from lots l join product_variants v on v.id=l.variant_id
  join fruits f on f.id=v.fruit_id left join varieties vr on vr.id=v.variety_id left join calibers cl on cl.id=v.caliber_id
  left join suppliers sp on sp.id=l.supplier_id`;

@Injectable()
export class InventoryService implements OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  constructor() {
    this.pool.on('error', () =>
      console.warn('Conexión de inventario interrumpida; se reintentará al consultar.'),
    );
  }
  async onModuleDestroy() {
    await this.pool.end();
  }
  async suppliers(): Promise<Supplier[]> {
    return (await this.pool.query(`${supplierSelect} order by lower(name),id`)).rows;
  }

  private async read<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin isolation level repeatable read read only');
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  async overview(query: unknown = {}): Promise<InventoryOverview> {
    const filter = inventoryFilterSchema.parse(query);
    return this.read(async (client) => {
      const params: string[] = [],
        clauses: string[] = [];
      for (const [key, column] of [
        ['fruitId', 'v.fruit_id'],
        ['varietyId', 'v.variety_id'],
        ['caliberId', 'v.caliber_id'],
        ['lotId', 'l.id'],
      ] as const) {
        if (filter[key]) {
          params.push(filter[key]);
          clauses.push(`${column}=$${params.length}`);
        }
      }
      if (filter.state) {
        params.push(filter.state);
        clauses.push(
          `exists(select 1 from containers c where c.lot_id=l.id and c.state=$${params.length})`,
        );
      }
      const rows = (
        await client.query(
          `${lotSelect}${clauses.length ? ' where ' + clauses.join(' and ') : ''} order by l.received_at desc,l.id`,
          params,
        )
      ).rows;
      const containers: ContainerStock[] = rows.length
        ? (
            await client.query(
              `${containerSelect} where c.lot_id=any($1::uuid[]) order by c.created_at,c.id`,
              [rows.map((row) => row.id)],
            )
          ).rows
        : [];
      const lots = rows.map((row) => ({
        ...row,
        receivedAt: row.receivedAt.toISOString(),
        ...summarizeContainers(
          containers.filter((c) => c.lotId === row.id),
          row.blistersPerBox,
          row.packingModel,
        ),
      })) as LotSummary[];
      const totals = emptyStockSummary();
      for (const lot of lots)
        for (const key of Object.keys(totals) as (keyof typeof totals)[]) totals[key] += lot[key];
      const warehouse = (
        await client.query('select id,name from warehouses order by created_at,id limit 1')
      ).rows[0];
      if (!warehouse)
        throw new NotFoundException('Falta preparar el almacén inicial. Ejecuta las migraciones.');
      return { warehouse, lots, totals };
    });
  }

  async saleAvailability(): Promise<SaleAvailability> {
    return this.read(async (client) => {
      const checkedAt = new Date().toISOString();
      const production = authConfig().environment === 'production';
      const rules = (
        await client.query<{
          id: string;
          variant_id: string;
          confirmation_status: string;
          allowed_presentations: Presentation[];
          commercial_unit_label: string | null;
        }>(
          'select id,variant_id,confirmation_status,allowed_presentations,commercial_unit_label from packing_rules order by id',
        )
      ).rows;
      const lots = (
        await client.query<{
          id: string;
          variant_id: string;
          packingModel: PackingModel;
          halfPreparation: HalfPreparation;
          allowedPresentations: Presentation[];
          blistersPerBox: number | null;
          confirmed: boolean;
          commercial_unit_label_snapshot: string | null;
        }>(
          `select id,variant_id,packing_model_snapshot as "packingModel",
            half_preparation_snapshot as "halfPreparation",allowed_presentations_snapshot as "allowedPresentations",
            blisters_per_box_snapshot as "blistersPerBox",confirmation_status_snapshot='confirmed' as confirmed,commercial_unit_label_snapshot
           from lots where is_demo=$1 and received_at<=$2::timestamptz order by received_at,created_at,id`,
          [commandIsDemo(false), checkedAt],
        )
      ).rows;
      const containers = lots.length
        ? (
            await client.query<ContainerStock>(
              `${containerSelect} where c.lot_id=any($1::uuid[]) order by c.id`,
              [lots.map((lot) => lot.id)],
            )
          ).rows
        : [];
      const byLot = new Map<string, ContainerStock[]>();
      for (const container of containers) {
        const list = byLot.get(container.lotId) ?? [];
        list.push(container);
        byLot.set(container.lotId, list);
      }
      const projected = lots.map((lot) => ({ ...lot, containers: byLot.get(lot.id) ?? [] }));
      return {
        checkedAt,
        items: rules.flatMap((rule) =>
          rule.allowed_presentations.map((presentation) => ({
            configurationId: rule.id,
            presentation,
            ...(production && rule.confirmation_status !== 'confirmed'
              ? {
                  availableQuantity: 0,
                  blockedReason: 'Confirma el empaque del producto antes de vender.',
                }
              : countSellablePresentation(
                  projected.filter(
                    (lot) =>
                      lot.variant_id === rule.variant_id &&
                      lot.commercial_unit_label_snapshot === rule.commercial_unit_label,
                  ),
                  presentation,
                  production,
                )),
          })),
        ),
      };
    });
  }
  private async saleStock(
    client: PoolClient,
    configurationIds: string[],
    isDemo: boolean,
    lock: boolean,
    soldAt: string,
  ) {
    const rules = (
      await client.query<SalePlannerRule>(
        `select id,variant_id as "variantId",commercial_unit_label as "commercialUnitLabel",
       allowed_presentations as "allowedPresentations",confirmation_status='confirmed' as confirmed
       from packing_rules where id=any($1::uuid[]) order by id${lock ? ' for share' : ''}`,
        [[...new Set(configurationIds)]],
      )
    ).rows;
    const rows = rules.length
      ? (
          await client.query<
            LotRow & {
              variant_id: string;
              received_at: Date;
              created_at: Date;
              confirmed: boolean;
              receivedBeforeSale: boolean;
            }
          >(
            `select l.id,l.code,l.blisters_per_box_snapshot,l.inventory_version,l.packing_model_snapshot,
       l.half_preparation_snapshot,l.allowed_presentations_snapshot,l.unit_cost_usd,
       l.commercial_unit_label_snapshot,l.variant_id,l.received_at,l.created_at,
       l.confirmation_status_snapshot='confirmed' as confirmed,l.received_at<=$3::timestamptz as "receivedBeforeSale"
       from lots l where l.variant_id=any($1::uuid[]) and l.is_demo=$2
       and exists(select 1 from containers c join stock_balances s on s.container_id=c.id where c.lot_id=l.id and s.quantity>0)
       order by l.received_at,l.created_at,l.id${lock ? ' for update of l' : ''}`,
            [[...new Set(rules.map((rule) => rule.variantId))], isDemo, soldAt],
          )
        ).rows
      : [];
    const containers = rows.length
      ? (
          await client.query<ContainerStock>(
            `${containerSelect} where c.lot_id=any($1::uuid[])${lock ? '' : ' and s.quantity>0'} order by c.id${lock ? ' for update of c,s' : ''}`,
            [rows.map((row) => row.id)],
          )
        ).rows
      : [];
    const before = new Map<string, ContainerStock[]>();
    for (const container of containers) {
      const list = before.get(container.lotId) ?? [];
      list.push(container);
      before.set(container.lotId, list);
    }
    const lots: SalePlannerLot[] = rows.map((row, fifoOrder) => ({
      id: row.id,
      variantId: row.variant_id,
      commercialUnitLabel: row.commercial_unit_label_snapshot,
      packingModel: row.packing_model_snapshot,
      halfPreparation: row.half_preparation_snapshot,
      allowedPresentations: row.allowed_presentations_snapshot,
      blistersPerBox: row.blisters_per_box_snapshot,
      confirmed: row.confirmed,
      fifoOrder,
      receivedBeforeSale: row.receivedBeforeSale,
      receivedAt: row.received_at.toISOString(),
      createdAt: row.created_at.toISOString(),
      containers: before.get(row.id) ?? [],
    }));
    const stock: SalePlannerStock = {
      rules,
      lots,
      requireConfirmedLots: authConfig().environment === 'production',
    };
    return { stock, before, rows: new Map(rows.map((row) => [row.id, row])) };
  }
  async salePreview(body: unknown): Promise<SalePreviewResult> {
    const requested = salePreviewSchema.parse(body);
    return this.read(async (client) => {
      const checkedAt = new Date().toISOString();
      const input =
        requested.dateMode === 'automatic' ? { ...requested, soldAt: checkedAt } : requested;
      const { stock } = await this.saleStock(
        client,
        input.lines.map((line) => line.configurationId),
        commandIsDemo(false),
        false,
        input.soldAt,
      );
      return previewPhysicalSale(input, stock, checkedAt);
    });
  }
  async detail(id: string): Promise<LotDetail> {
    z.uuid().parse(id);
    return this.read(async (client) => {
      const row = (await client.query(`${lotSelect} where l.id=$1`, [id])).rows[0];
      if (!row) throw new NotFoundException('Este lote no existe.');
      const containers: ContainerStock[] = (
        await client.query(`${containerSelect} where c.lot_id=$1 order by c.created_at,c.id`, [id])
      ).rows;
      const movements: InventoryMovement[] = (
        await client.query(
          `select m.id,m.lot_id as "lotId",m.kind,m.reason,m.actor,
        m.created_at as "createdAt",m.reversal_of as "reversalOf",r.id as "reversedBy",m.counted_before as "countedBefore",
        m.delivered_pieces as "preparedPieces",m.remaining_pieces as "remainingPieces"
        from inventory_movements m left join inventory_movements r on r.reversal_of=m.id
        where m.lot_id=$1 order by m.lot_version_after desc,m.id`,
          [id],
        )
      ).rows;
      const entries = (
        await client.query(
          `select e.id,e.movement_id as "movementId",e.container_id as "containerId",e.unit,
        e.quantity_delta as "quantityDelta",e.pieces_delta as "piecesDelta" from inventory_entries e
        join inventory_movements m on m.id=e.movement_id where m.lot_id=$1 order by e.entry_order`,
          [id],
        )
      ).rows;
      for (const movement of movements) {
        movement.createdAt = new Date(movement.createdAt).toISOString();
        movement.entries = entries
          .filter((entry) => entry.movementId === movement.id)
          .map(({ movementId: _, ...entry }) => entry);
      }
      return {
        lot: {
          ...row,
          receivedAt: row.receivedAt.toISOString(),
          ...summarizeContainers(containers, row.blistersPerBox, row.packingModel),
        },
        containers: containers.map((container) => ({ ...container, costUsd: null })),
        movements,
      };
    });
  }
  async runCommand<T>(
    kind: string,
    data: unknown,
    key: string | undefined,
    actor: string,
    fn: (client: PoolClient, hash: string) => Promise<T>,
    inventory = true,
  ): Promise<T> {
    assertBusinessWritesReady();
    if (!actor) throw new UnauthorizedException('Inicia sesión para registrar esta operación.');
    if (!key || !z.uuid().safeParse(key).success)
      throw new BadRequestException('Falta una clave válida para guardar sin duplicados.');
    const hash = createHash('sha256').update(JSON.stringify({ kind, data, actor })).digest('hex');
    const client = await this.pool.connect();
    const phase = { kind, callbackStarted: false, commitStarted: false, rollbackConfirmed: false };
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='5s'");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const receipt = (
        await client.query(
          'select request_hash,response,created_at from command_receipts where key=$1',
          [key],
        )
      ).rows[0];
      if (receipt) {
        if (receipt.request_hash !== hash)
          throw new ConflictException(
            'Esta solicitud ya se usó con otros datos o por otra persona.',
          );
        if (['sale', 'payment', 'receipt', 'simple-receipt', 'quick-receipt'].includes(kind)) {
          const reset = await client.query(
            "select 1 from command_receipts where response->>'kind'='owner_authorized_operation_reset' and created_at >= $1 limit 1",
            [receipt.created_at],
          );
          if (reset.rowCount)
            throw new ConflictException(
              'Esta operación pertenece al período que se vació. Vuelve al inicio para comenzar un registro nuevo.',
            );
        }
        phase.commitStarted = true;
        await client.query('commit');
        return receipt.response as T;
      }
      // Same lock as the database's tree triggers, acquired before individual lot/stock rows.
      if (inventory) await client.query('select pg_advisory_xact_lock(68493003)');
      phase.callbackStarted = true;
      const result = await fn(client, hash);
      await client.query(
        'insert into command_receipts(key,request_hash,response) values($1,$2,$3::jsonb)',
        [key, hash, JSON.stringify(result)],
      );
      phase.commitStarted = true;
      await client.query('commit');
      return result;
    } catch (error) {
      await client
        .query('rollback')
        .then(() => {
          phase.rollbackConfirmed = true;
        })
        .catch(() => undefined);
      markBusinessCommandRejection(error, key, phase);
      if (['40P01', '40001', '55P03'].includes((error as { code?: string }).code ?? ''))
        throw new ConflictException(
          'Hay otra operación en curso. Reintenta con la misma solicitud.',
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async saveSupplier(
    body: unknown,
    key: string | undefined,
    actor: string,
    id?: string,
  ): Promise<Supplier> {
    if (id) z.uuid().parse(id);
    const data = id ? updateSupplierSchema.parse(body) : supplierSchema.parse(body);
    return this.runCommand(
      `supplier:${id ?? 'new'}`,
      data,
      key,
      actor,
      async (client) => {
        let before: Supplier | null = null,
          resultId = id;
        if (id) {
          before = (await client.query(`${supplierSelect} where id=$1 for update`, [id])).rows[0];
          if (!before) throw new NotFoundException('Este proveedor no existe.');
          const edit = updateSupplierSchema.parse(data);
          if (edit.version !== before.version)
            throw new ConflictException('Otra persona editó este proveedor. Actualiza la lista.');
          await client.query(
            'update suppliers set name=$2,tax_id=$3,phone=$4,notes=$5,active=$6,version=version+1 where id=$1',
            [id, data.name, data.taxId || null, data.phone || null, data.notes, edit.active],
          );
        } else
          resultId = (
            await client.query(
              'insert into suppliers(name,tax_id,phone,notes) values($1,$2,$3,$4) returning id',
              [data.name, data.taxId || null, data.phone || null, data.notes],
            )
          ).rows[0].id;
        const result = (await client.query(`${supplierSelect} where id=$1`, [resultId]))
          .rows[0] as Supplier;
        await this.audit(
          client,
          'supplier',
          result.id,
          id ? 'update' : 'create',
          before,
          result,
          actor,
          key!,
        );
        return result;
      },
      false,
    );
  }
  private async audit(
    client: PoolClient,
    entity: string,
    id: string,
    action: string,
    before: unknown,
    after: unknown,
    actor: string,
    key: string,
  ) {
    await client.query(
      'insert into audit_events(entity_type,entity_id,action,before,after,actor,request_id) values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)',
      [entity, id, action, JSON.stringify(before), JSON.stringify(after), actor, key],
    );
  }
  private async lockedLot(client: PoolClient, id: string): Promise<LotRow> {
    const lot = (
      await client.query(
        'select id,code,blisters_per_box_snapshot,inventory_version,packing_model_snapshot,half_preparation_snapshot,allowed_presentations_snapshot,unit_cost_usd,commercial_unit_label_snapshot from lots where id=$1 for update',
        [id],
      )
    ).rows[0];
    if (!lot) throw new NotFoundException('Este lote no existe.');
    return lot;
  }
  private async stock(client: PoolClient, id: string): Promise<ContainerStock[]> {
    return (
      await client.query(`${containerSelect} where c.lot_id=$1 order by c.id for update of c,s`, [
        id,
      ])
    ).rows;
  }
  private physical(map: StateMap, id: string): ContainerStock {
    const container = map.get(id);
    if (!container || container.quantity <= 0)
      throw new ConflictException(
        'El contenedor ya no tiene existencia disponible. Actualiza el lote.',
      );
    return container;
  }
  private newContainer(
    lotId: string,
    warehouseId: string,
    kind: ContainerStock['kind'],
    unit: ContainerStock['unit'],
    quantity: number,
    countedPieces: number | null,
    parentId: string | null = null,
  ): ContainerStock {
    return {
      id: randomUUID(),
      lotId,
      warehouseId,
      parentId,
      kind,
      unit,
      quantity,
      countedPieces,
      state: unit === 'loose_piece' ? 'open' : 'sealed',
      version: 1,
      costUsd: null,
    };
  }
  private openBox(map: StateMap, box: ContainerStock, blisters: number | null) {
    if (!blisters)
      throw new BadRequestException('Confirma los blíster por caja de este lote antes de abrirlo.');
    if (
      box.kind !== 'box' ||
      box.state !== 'sealed' ||
      box.unit !== 'sealed_box' ||
      box.quantity !== 1
    )
      throw new ConflictException('Selecciona una caja cerrada disponible.');
    const costs = allocateCost(
      box.costUsd ?? null,
      Array.from({ length: blisters }, () => 1),
    );
    box.quantity = 0;
    box.costUsd = '0.0000';
    box.state = 'open';
    box.countedPieces = null;
    for (let i = 0; i < blisters; i++) {
      const blister = this.newContainer(
        box.lotId,
        box.warehouseId,
        'blister',
        'intact_blister',
        1,
        null,
        box.id,
      );
      blister.costUsd = costs[i];
      map.set(blister.id, blister);
    }
  }
  private retireEmptyBoxes(map: StateMap) {
    for (const box of map.values())
      if (
        box.kind === 'box' &&
        box.state === 'open' &&
        ![...map.values()].some((child) => child.parentId === box.id && child.quantity > 0)
      )
        box.state = 'empty';
  }
  private async persistMovement(
    client: PoolClient,
    lot: LotRow,
    before: ContainerStock[],
    state: StateMap,
    kind: InventoryMovement['kind'],
    reason: string,
    actor: string,
    key: string,
    hash: string,
    counts?: { countedBefore: number; preparedPieces: number; remainingPieces: number },
    reversalOf: string | null = null,
  ) {
    const previous = new Map(before.map((item) => [item.id, item]));
    const changed = [...state.values()].filter(
      (item) => JSON.stringify(previous.get(item.id)) !== JSON.stringify(item),
    );
    if (!changed.length)
      throw new BadRequestException('La operación no cambia ninguna existencia.');
    for (const item of changed) item.version = (previous.get(item.id)?.version ?? 0) + 1;
    const movementId = randomUUID();
    const priorState = changed.map((item) => previous.get(item.id)).filter(Boolean);
    await client.query(
      `insert into inventory_movements(id,idempotency_key,request_hash,kind,reason,actor,lot_id,lot_version_before,lot_version_after,before_state,after_state,reversal_of,counted_before,delivered_pieces,remaining_pieces)
      values($1,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14)`,
      [
        movementId,
        hash,
        kind,
        reason,
        actor,
        lot.id,
        lot.inventory_version,
        lot.inventory_version + 1,
        JSON.stringify(priorState),
        JSON.stringify(changed),
        reversalOf,
        counts?.countedBefore ?? null,
        counts?.preparedPieces ?? null,
        counts?.remainingPieces ?? null,
      ],
    );
    for (const current of changed) {
      const old = previous.get(current.id);
      if (!old) {
        await client.query(
          'insert into containers(id,lot_id,warehouse_id,parent_id,kind,state) values($1,$2,$3,$4,$5,$6)',
          [
            current.id,
            current.lotId,
            current.warehouseId,
            current.parentId,
            current.kind,
            current.state,
          ],
        );
        await client.query(
          'insert into stock_balances(container_id,unit,quantity,counted_pieces,version,cost_usd) values($1,$2,$3,$4,$5,$6)',
          [
            current.id,
            current.unit,
            current.quantity,
            current.countedPieces,
            current.version,
            current.costUsd ?? null,
          ],
        );
      } else {
        await client.query('update containers set state=$2,parent_id=$3 where id=$1', [
          current.id,
          current.state,
          current.parentId,
        ]);
        await client.query(
          'update stock_balances set unit=$2,quantity=$3,counted_pieces=$4,version=$5,cost_usd=$6 where container_id=$1',
          [
            current.id,
            current.unit,
            current.quantity,
            current.countedPieces,
            current.version,
            current.costUsd ?? null,
          ],
        );
      }
      const entries: { unit: string; quantity: number; pieces: number | null }[] = [];
      if (old && old.unit !== current.unit) {
        entries.push({
          unit: old.unit,
          quantity: -old.quantity,
          pieces: old.countedPieces === null ? null : -old.countedPieces,
        });
        entries.push({
          unit: current.unit,
          quantity: current.quantity,
          pieces: current.countedPieces,
        });
      } else
        entries.push({
          unit: current.unit,
          quantity: current.quantity - (old?.quantity ?? 0),
          pieces:
            current.countedPieces === null
              ? old?.countedPieces == null
                ? null
                : -old.countedPieces
              : current.countedPieces - (old?.countedPieces ?? 0),
        });
      for (const entry of entries)
        await client.query(
          `insert into inventory_entries(movement_id,container_id,unit,quantity_delta,pieces_delta,before_state,after_state) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb)`,
          [
            movementId,
            current.id,
            entry.unit,
            entry.quantity,
            entry.pieces,
            old ? JSON.stringify(old) : null,
            JSON.stringify(current),
          ],
        );
      await client.query(
        'insert into inventory_cost_entries(movement_id,container_id,before_usd,after_usd) values($1,$2,$3,$4)',
        [movementId, current.id, old?.costUsd ?? null, current.costUsd ?? null],
      );
    }
    await client.query('update lots set inventory_version=inventory_version+1 where id=$1', [
      lot.id,
    ]);
    await this.audit(
      client,
      'inventory_movement',
      movementId,
      kind,
      priorState,
      changed,
      actor,
      key,
    );
    return movementId;
  }
  private async previousCost(
    client: PoolClient,
    configurationId: string,
    demo: boolean,
  ): Promise<PreviousReceiptCost | null> {
    const row = (
      await client.query(
        `select l.id as "sourceLotId",l.unit_cost_usd::text as "unitCostUsd",l.received_at as "receivedAt"
      from lots l join purchase_lines pl on pl.id=l.purchase_line_id join purchases p on p.id=pl.purchase_id
      where l.packing_rule_id=$1 and l.is_demo=$2 and p.is_demo=$2 and p.status='received'
        and l.confirmation_status_snapshot='confirmed' and l.unit_cost_usd>0 and l.received_at<=now()
        and exists(select 1 from inventory_movements m where m.lot_id=l.id and m.kind='receipt'
          and not exists(select 1 from inventory_movements r where r.reversal_of=m.id))
      order by l.received_at desc,l.created_at desc,l.id desc limit 1`,
        [configurationId, demo],
      )
    ).rows[0];
    return row ? { ...row, receivedAt: row.receivedAt.toISOString() } : null;
  }
  async receiptOptions(query: unknown): Promise<ReceiptOptions> {
    const { configurationId } = z.object({ configurationId: z.uuid() }).strict().parse(query);
    return this.read(async (client) => {
      if (
        !(await client.query('select id from packing_rules where id=$1', [configurationId]))
          .rowCount
      )
        throw new NotFoundException('El producto no existe.');
      return {
        configurationId,
        previousCost: null,
      };
    });
  }
  private async resolveQuickReceipt(
    client: PoolClient,
    input: QuickReceipt | SimpleReceipt,
    actor: string,
    key: string,
  ): Promise<ResolvedReceipt> {
    await client.query('select pg_advisory_xact_lock(68493004)');
    const demo = commandIsDemo(input.isDemo);
    const resolved = new Map<string, { fingerprint: string; rule: ReceiptRule }>();
    const lines: ResolvedReceipt['lines'] = [];
    for (const line of input.lines) {
      const productKey = JSON.stringify(line.product),
        fingerprint = JSON.stringify(line.packing ?? null);
      const previous = resolved.get(productKey);
      if (previous && previous.fingerprint !== fingerprint)
        throw new BadRequestException(
          'Dos líneas revisan empaques diferentes del mismo producto. Usa excepciones por lote para cambiar solo blísteres.',
        );
      const rule =
        previous?.rule ??
        (await resolveReceiptProduct(
          client,
          line.product,
          line.packing,
          actor,
          key,
          input.schemaVersion === 3 ? 'v4.5' : 'v4.2',
        ));
      resolved.set(productKey, { fingerprint, rule });
      if (line.blisterOverride && rule.packing_model !== 'blister')
        throw new BadRequestException('Este producto no utiliza blíster.');
      if ('cost' in line && line.cost.kind === 'previous') {
        const cost = await this.previousCost(client, rule.id, demo);
        if (
          !cost ||
          cost.sourceLotId !== line.cost.sourceLotId ||
          !new Decimal(cost.unitCostUsd).eq(line.cost.unitCostUsd)
        )
          throw new ConflictException(
            'Cambió el último costo confirmado. Revisa y acepta el costo actual o escribe el nuevo costo.',
          );
      }
      lines.push({
        configurationId: rule.id,
        boxes: line.boxes,
        unitCostUsd: 'cost' in line ? line.cost.unitCostUsd : null,
        ...(line.blisterOverride ? { blistersPerBox: line.blisterOverride.blistersPerBox } : {}),
        priceAction: 'priceAction' in line ? line.priceAction : 'keep',
        prices: 'prices' in line ? line.prices : [],
        notes: line.notes,
      });
    }
    return {
      supplierId: input.supplierId,
      reference: input.reference,
      receivedAt: input.receivedAt ?? new Date().toISOString(),
      notes: input.notes,
      isDemo: input.isDemo,
      lines,
    };
  }
  async receive(body: unknown, key: string | undefined, actor: string): Promise<ReceiptResult> {
    // Never include server-generated dates/numbers or resolved IDs in the request hash.
    // The legacy parser/hash is retained so a pre-upgrade confirmed request can still replay.
    const input =
      body && typeof body === 'object' && 'schemaVersion' in body
        ? body.schemaVersion === 3
          ? simpleReceiptSchema.parse(body)
          : quickReceiptSchema.parse(body)
        : receiptSchema.parse(body);
    return this.runCommand('receipt', input, key, actor, async (client, hash) => {
      const data: ResolvedReceipt =
        'schemaVersion' in input
          ? await this.resolveQuickReceipt(client, input, actor, key!)
          : input;
      if (
        data.lines.some((line) => line.unitCostUsd !== null && new Decimal(line.unitCostUsd).lte(0))
      )
        throw new BadRequestException('Confirma un costo real por caja mayor que cero.');
      if (data.supplierId !== null) {
        const supplier = (
          await client.query('select active from suppliers where id=$1 for share', [
            data.supplierId,
          ])
        ).rows[0];
        if (!supplier?.active)
          throw new BadRequestException(
            'Selecciona un proveedor activo o deja el proveedor sin indicar.',
          );
      }
      const warehouse = (
        await client.query('select id from warehouses order by created_at,id limit 1')
      ).rows[0];
      if (!warehouse) throw new NotFoundException('Falta el almacén inicial.');
      const demo = commandIsDemo(data.isDemo);
      const confirmations = new Map(
        data.lines
          .filter((line) => line.packingConfirmation)
          .map((line) => [line.configurationId, line.packingConfirmation!]),
      );
      if (confirmations.size) {
        // The operator explicitly confirms the catalog for this receipt and future
        // lots. Prior lot snapshots remain immutable. One transaction also covers
        // failed costs/prices/stock and the idempotent response.
        await client.query('select pg_advisory_xact_lock(68493004)');
        for (const [configurationId, confirmation] of [...confirmations].sort(([a], [b]) =>
          a.localeCompare(b),
        )) {
          const before = (
            await client.query('select * from packing_rules where id=$1 for update', [
              configurationId,
            ])
          ).rows[0];
          if (!before)
            throw new BadRequestException('El empaque ya no existe. Actualiza el catálogo.');
          if (before.version !== confirmation.expectedVersion)
            throw new ConflictException(
              'Otra persona cambió este empaque. Actualiza y revisa la confirmación de la recepción.',
            );
          const after = (
            await client.query(
              `update packing_rules set packing_model=$2,half_preparation=$3,
            allowed_presentations=$4,blisters_per_box=$5,box_weight_kg=$6,confirmation_status='confirmed',
            version=version+1,updated_at=now() where id=$1 returning *`,
              [
                configurationId,
                confirmation.packingModel,
                confirmation.halfPreparation,
                confirmation.allowedPresentations,
                confirmation.blistersPerBox,
                confirmation.boxWeightKg,
              ],
            )
          ).rows[0];
          await this.audit(
            client,
            'packing_rules',
            configurationId,
            'confirm_on_receipt',
            before,
            after,
            actor,
            key!,
          );
        }
      }
      const purchase = (
        await client.query(
          `insert into purchases(supplier_id,reference,purchased_at,status,notes,is_demo) values($1,$2,$3,'received',$4,$5) returning id,receipt_number::text`,
          [data.supplierId, data.reference, data.receivedAt, data.notes, demo],
        )
      ).rows[0];
      const purchaseId = purchase.id,
        receiptNumber = formatReceiptNumber(purchase.receipt_number);
      const lots: ReceiptResult['lots'] = [];
      const priceUpdates = new Map<string, Parameters<typeof applyPresentationPrices>[1][number]>();
      for (const line of data.lines) {
        const rule = (
          await client.query('select * from packing_rules where id=$1 for share', [
            line.configurationId,
          ])
        ).rows[0];
        if (!rule)
          throw new BadRequestException('Una configuración ya no existe. Actualiza el catálogo.');
        if (authConfig().environment === 'production' && rule.confirmation_status !== 'confirmed')
          throw new ConflictException(
            'Confirma la configuración comercial antes de recibir mercancía real.',
          );
        if (rule.packing_model !== 'blister' && line.blistersPerBox !== undefined)
          throw new BadRequestException('Este empaque no utiliza blíster.');
        if (line.priceAction === 'update') {
          if (!line.prices.length)
            throw new BadRequestException('Indica los precios que quieres actualizar.');
          if (
            new Set(line.prices.map((p) => p.presentation)).size !== line.prices.length ||
            line.prices.some((p) => !rule.allowed_presentations.includes(p.presentation))
          )
            throw new BadRequestException('Revisa las presentaciones y precios de la recepción.');
          for (const price of line.prices) {
            const priceKey = `${rule.variant_id}:${price.presentation}`;
            const prior = priceUpdates.get(priceKey);
            if (
              prior &&
              (prior.promoUsd !== price.promoUsd || prior.regularUsd !== price.regularUsd)
            )
              throw new BadRequestException(
                'Dos líneas proponen precios distintos para la misma presentación. Unifica los precios antes de confirmar.',
              );
            priceUpdates.set(priceKey, { ...price, variantId: rule.variant_id });
          }
        } else if (line.prices.length)
          throw new BadRequestException('Selecciona Actualizar precios para cambiar la lista.');
        const lineId = (
          await client.query(
            `insert into purchase_lines(purchase_id,variant_id,quantity,presentation,unit_cost_usd,notes) values($1,$2,$3,'box',$4,$5) returning id`,
            [purchaseId, rule.variant_id, line.boxes, line.unitCostUsd, line.notes],
          )
        ).rows[0].id;
        const id = randomUUID(),
          code = `MM-${businessDate(new Date(data.receivedAt)).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;
        const blisterCount = line.blistersPerBox ?? rule.blisters_per_box;
        await client.query(
          `insert into lots(id,code,variant_id,supplier_id,purchase_line_id,packing_rule_id,packing_rule_version,blisters_per_box_snapshot,received_at,unit_cost_usd,received_boxes,notes,is_demo,packing_model_snapshot,half_preparation_snapshot,allowed_presentations_snapshot,box_weight_kg_snapshot,confirmation_status_snapshot,commercial_unit_label_snapshot)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            id,
            code,
            rule.variant_id,
            data.supplierId,
            lineId,
            rule.id,
            rule.version,
            blisterCount,
            data.receivedAt,
            line.unitCostUsd,
            line.boxes,
            line.notes,
            demo,
            rule.packing_model,
            rule.half_preparation,
            rule.allowed_presentations,
            rule.box_weight_kg,
            rule.confirmation_status,
            rule.commercial_unit_label,
          ],
        );
        const state: StateMap = new Map();
        for (let i = 0; i < line.boxes; i++) {
          const box = this.newContainer(id, warehouse.id, 'box', 'sealed_box', 1, null);
          box.costUsd = line.unitCostUsd;
          state.set(box.id, box);
        }
        const movementId = await this.persistMovement(
          client,
          {
            id,
            code,
            blisters_per_box_snapshot: blisterCount,
            inventory_version: 0,
            packing_model_snapshot: rule.packing_model,
            half_preparation_snapshot: rule.half_preparation,
            allowed_presentations_snapshot: rule.allowed_presentations,
            unit_cost_usd: line.unitCostUsd,
            commercial_unit_label_snapshot: rule.commercial_unit_label,
          },
          [],
          state,
          'receipt',
          `Recepción ${receiptNumber}`,
          actor,
          key!,
          hash,
        );
        lots.push({ id, code, movementId });
      }
      if (priceUpdates.size)
        await applyPresentationPrices(client, [...priceUpdates.values()], actor, key!);
      await this.audit(
        client,
        'purchase',
        purchaseId,
        'receipt',
        null,
        {
          supplierId: data.supplierId,
          reference: data.reference,
          receiptNumber,
          receivedAt: data.receivedAt,
          lots,
          ...('schemaVersion' in input
            ? {
                schemaVersion: input.schemaVersion,
                confirmations: input.lines.map((line, index) => ({
                  lotId: lots[index].id,
                  product: line.product,
                  ...('cost' in line ? { cost: line.cost } : { costKnown: false }),
                  blisterOverride: line.blisterOverride ?? null,
                  packing: line.packing ?? null,
                })),
              }
            : {}),
        },
        actor,
        key!,
      );
      return {
        purchaseId,
        receiptNumber,
        receivedAt: data.receivedAt,
        lots,
        movementId: lots[0].movementId,
      };
    });
  }
  async operate(
    id: string,
    operation: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<InventoryCommandResult> {
    z.uuid().parse(id);
    const validators = {
      'open-box': openBoxSchema,
      'withdraw-blisters': withdrawBlistersSchema,
      'open-blister': openBlisterSchema,
      'prepare-half': prepareHalfSchema,
      'split-halves': openBoxSchema,
      adjust: adjustmentSchema,
    };
    const validator = validators[operation as keyof typeof validators];
    if (!validator) throw new BadRequestException('Operación de inventario desconocida.');
    const data = validator.parse(body);
    return this.runCommand(`${operation}:${id}`, data, key, actor, async (client, hash) => {
      const lot = await this.lockedLot(client, id),
        before = await this.stock(client, id);
      const state: StateMap = new Map(before.map((item) => [item.id, { ...item }]));
      if (
        ['open-box', 'withdraw-blisters', 'open-blister'].includes(operation) &&
        lot.packing_model_snapshot !== 'blister'
      )
        throw new BadRequestException('Este lote no utiliza blíster.');
      if (operation === 'prepare-half' && lot.half_preparation_snapshot !== 'counted')
        throw new BadRequestException('Este lote no usa media caja con conteo de piezas.');
      let kind: InventoryMovement['kind'],
        counts:
          { countedBefore: number; preparedPieces: number; remainingPieces: number } | undefined;
      let usedContainers: { id: string; quantity: number }[] | undefined;
      if (operation === 'split-halves') {
        if (
          lot.packing_model_snapshot !== 'halves' ||
          lot.half_preparation_snapshot !== 'commercial'
        )
          throw new BadRequestException('Este lote no permite mitades comerciales sin conteo.');
        const input = openBoxSchema.parse(data),
          box = this.physical(state, input.containerId);
        if (box.unit !== 'sealed_box' || box.state !== 'sealed')
          throw new BadRequestException('Selecciona una caja cerrada.');
        const costs = allocateCost(box.costUsd ?? null, [1, 1]);
        box.quantity = 0;
        box.costUsd = '0.0000';
        box.state = 'open';
        for (let i = 0; i < 2; i++) {
          const half = this.newContainer(
            id,
            box.warehouseId,
            'half_box',
            'prepared_half_box',
            1,
            null,
            box.id,
          );
          half.costUsd = costs[i];
          state.set(half.id, half);
        }
        kind = 'commercial_split';
      } else if (operation === 'open-box') {
        const input = openBoxSchema.parse(data);
        this.openBox(state, this.physical(state, input.containerId), lot.blisters_per_box_snapshot);
        kind = 'open_box';
      } else if (operation === 'withdraw-blisters') {
        const input = withdrawBlistersSchema.parse(data),
          available = summarizeContainers([...state.values()], lot.blisters_per_box_snapshot);
        if (input.quantity > available.equivalentIntactBlisters)
          throw new ConflictException('No hay suficientes blíster intactos en este lote.');
        let remaining = input.quantity;
        usedContainers = [];
        while (remaining > 0) {
          let blister = [...state.values()].find(
            (item) =>
              item.unit === 'intact_blister' && item.quantity === 1 && item.state === 'sealed',
          );
          if (!blister) {
            const box = [...state.values()].find(
              (item) =>
                item.unit === 'sealed_box' && item.quantity === 1 && item.state === 'sealed',
            );
            if (!box) throw new ConflictException('La existencia cambió. Actualiza el lote.');
            this.openBox(state, box, lot.blisters_per_box_snapshot);
            blister = [...state.values()].find(
              (item) =>
                item.unit === 'intact_blister' && item.quantity === 1 && item.state === 'sealed',
            )!;
          }
          blister.quantity = 0;
          blister.costUsd = '0.0000';
          blister.state = 'dispatched';
          blister.countedPieces = null;
          usedContainers.push({ id: blister.id, quantity: 1 });
          remaining--;
        }
        kind = 'dispatch';
      } else if (operation === 'open-blister') {
        const input = openBlisterSchema.parse(data),
          blister = this.physical(state, input.containerId);
        if (
          blister.kind !== 'blister' ||
          blister.unit !== 'intact_blister' ||
          blister.state !== 'sealed'
        )
          throw new ConflictException('Selecciona un blíster intacto disponible.');
        if (blister.countedPieces !== null && blister.countedPieces !== input.countedPieces)
          throw new ConflictException('El conteo no coincide con las piezas ya registradas.');
        blister.unit = 'loose_piece';
        blister.quantity = input.countedPieces;
        blister.countedPieces = input.countedPieces;
        blister.state = 'open';
        kind = 'open_blister';
      } else if (operation === 'prepare-half') {
        const input = prepareHalfSchema.parse(data),
          source = this.physical(state, input.containerId);
        const [preparedCost, remainingCost] = allocateCost(source.costUsd ?? null, [
          input.preparedPieces,
          input.remainingPieces,
        ]);
        const sealed =
          (source.unit === 'sealed_box' || source.unit === 'intact_blister') &&
          source.state === 'sealed';
        if (!sealed && source.unit !== 'loose_piece')
          throw new BadRequestException(
            'Selecciona una caja cerrada, un blíster intacto o fruta suelta contada.',
          );
        if (source.countedPieces !== null && source.countedPieces !== input.countedBefore)
          throw new ConflictException(
            'El conteo inicial no coincide con la existencia registrada.',
          );
        if (source.unit === 'sealed_box') {
          source.quantity = 0;
          source.costUsd = '0.0000';
          source.countedPieces = null;
          source.state = input.remainingPieces > 0 ? 'open' : 'empty';
          if (input.remainingPieces > 0) {
            const loose = this.newContainer(
              id,
              source.warehouseId,
              'loose_bin',
              'loose_piece',
              input.remainingPieces,
              input.remainingPieces,
              source.id,
            );
            loose.costUsd = remainingCost;
            state.set(loose.id, loose);
          }
        } else {
          source.unit = 'loose_piece';
          source.quantity = input.remainingPieces;
          source.costUsd = input.remainingPieces > 0 ? remainingCost : '0.0000';
          source.countedPieces = input.remainingPieces;
          source.state = input.remainingPieces > 0 ? 'open' : 'empty';
        }
        const half = this.newContainer(
          id,
          source.warehouseId,
          'half_box',
          'prepared_half_box',
          1,
          input.preparedPieces,
        );
        half.costUsd = preparedCost;
        state.set(half.id, half);
        counts = input;
        kind = 'fraction';
      } else {
        const input = adjustmentSchema.parse(data),
          source = state.get(input.containerId);
        if (!source) throw new NotFoundException('El contenedor no pertenece a este lote.');
        const next = source.quantity + input.quantityDelta;
        if (next < 0 || (source.unit !== 'loose_piece' && next > 1))
          throw new BadRequestException('El ajuste dejaría una cantidad física inválida.');
        if (source.unit === 'loose_piece') {
          if (input.piecesDelta != null && input.piecesDelta !== input.quantityDelta)
            throw new BadRequestException(
              'Las piezas sueltas y el ajuste de cantidad deben coincidir.',
            );
          source.countedPieces = next;
        } else if (source.unit === 'prepared_half_box') {
          if (lot.half_preparation_snapshot === 'commercial') {
            if (input.piecesDelta != null)
              throw new BadRequestException('La mitad comercial no requiere piezas.');
            source.countedPieces = null;
          } else {
            const pieces = (source.countedPieces ?? 0) + (input.piecesDelta ?? 0);
            if (pieces < 0 || (next === 0 && pieces !== 0) || (next > 0 && pieces <= 0))
              throw new BadRequestException('Indica el ajuste de piezas contado de la media caja.');
            source.countedPieces = pieces;
          }
        } else if (input.piecesDelta != null)
          throw new BadRequestException(
            'Abre el empaque y cuenta las piezas antes de ajustar fruta.',
          );
        if (next === 0) source.costUsd = '0.0000';
        else if (source.quantity > 0 && source.costUsd != null)
          source.costUsd = new Decimal(source.costUsd)
            .mul(next)
            .div(source.quantity)
            .toDecimalPlaces(4, Decimal.ROUND_DOWN)
            .toFixed(4);
        else if (source.quantity === 0)
          throw new BadRequestException(
            'Usa una reversa o recepción para restaurar existencia con su costo histórico.',
          );
        source.quantity = next;
        source.state = next === 0 ? 'empty' : source.unit === 'loose_piece' ? 'open' : 'sealed';
        kind = 'adjustment';
      }
      this.retireEmptyBoxes(state);
      const movementId = await this.persistMovement(
        client,
        lot,
        before,
        state,
        kind,
        data.reason,
        actor,
        key!,
        hash,
        counts,
      );
      return { movementId, lotId: id, ...(usedContainers ? { usedContainers } : {}) };
    });
  }
  async consumeSale(
    client: PoolClient,
    lines: {
      lineId: string;
      configurationId: string;
      presentation: Presentation;
      quantity: number;
    }[],
    actor: string,
    key: string,
    hash: string,
    isDemo: boolean,
    soldAt: string,
  ): Promise<SaleAllocation[]> {
    await client.query('select pg_advisory_xact_lock(68493003)');
    const loaded = await this.saleStock(
      client,
      lines.map((line) => line.configurationId),
      isDemo,
      true,
      soldAt,
    );
    const input = {
      soldAt,
      lines: lines.map((line) => ({
        lineKey: line.lineId,
        configurationId: line.configurationId,
        presentation: line.presentation,
        quantity: line.quantity,
      })),
    };
    const plan = planPhysicalSale(input, loaded.stock, { newContainerId: randomUUID });
    if (!plan.valid) {
      const issue = plan.issues[0]!;
      if (issue.issueCode === 'configuration_missing') throw new NotFoundException(issue.message);
      if (['presentation_not_allowed', 'receipt_after_sale'].includes(issue.issueCode))
        throw new BadRequestException(issue.message);
      const preview = previewPhysicalSale(input, loaded.stock, new Date().toISOString());
      const line = preview.lines.find((item) => item.lineKey === issue.lineKey);
      const position = lines.findIndex((item) => item.lineId === issue.lineKey) + 1;
      throw new ConflictException(`Línea ${position}: ${line?.message ?? issue.message}`);
    }
    const allocations: SaleAllocation[] = plan.allocations.map((item) => ({
      saleLineId: item.lineKey,
      lotId: item.lotId,
      containerId: item.containerId,
      movementId: '',
      quantity: item.quantity,
      costUsd: item.costUsd,
    }));
    for (const [lotId, state] of plan.states) {
      const affected = allocations.filter((item) => item.lotId === lotId);
      if (!affected.length) continue;
      const movementId = await this.persistMovement(
        client,
        loaded.rows.get(lotId)!,
        loaded.before.get(lotId)!,
        state,
        'dispatch',
        'Salida por comprobante de venta',
        actor,
        key,
        hash,
      );
      affected.forEach((item) => {
        item.movementId = movementId;
      });
    }
    return allocations;
  }

  private async reverseMovement(
    client: PoolClient,
    id: string,
    reason: string,
    actor: string,
    key: string,
    hash: string,
    commercial = false,
  ): Promise<InventoryCommandResult> {
    const movement = (await client.query('select * from inventory_movements where id=$1', [id]))
      .rows[0];
    if (!movement?.lot_id) throw new NotFoundException('Este movimiento no admite reversa.');
    if (
      !commercial &&
      (await client.query('select 1 from sale_allocations where movement_id=$1 limit 1', [id]))
        .rowCount
    )
      throw new ConflictException(
        'Anula el comprobante de venta para restituir el stock y su costo juntos.',
      );
    const lot = await this.lockedLot(client, movement.lot_id);
    if (
      movement.kind === 'reversal' ||
      lot.inventory_version !== movement.lot_version_after ||
      (await client.query('select 1 from inventory_movements where reversal_of=$1', [id])).rowCount
    )
      throw new ConflictException(
        'Solo se puede revertir el último movimiento del lote, una vez y sin movimientos posteriores.',
      );
    const before = await this.stock(client, lot.id),
      state: StateMap = new Map(before.map((c) => [c.id, { ...c }]));
    const old = new Map<string, ContainerStock>(
      (movement.before_state as ContainerStock[]).map((c) => [c.id, c]),
    );
    let historical: Map<string, string | null> | undefined;
    if ([...old.values()].some((c) => c.costUsd === undefined)) {
      const history = (
        await client.query(
          'select * from inventory_movements where lot_id=$1 order by lot_version_after',
          [lot.id],
        )
      ).rows;
      historical = replayLegacyCosts(history, lot.unit_cost_usd).beforeEvents.get(id);
    }
    for (const prior of movement.after_state as ContainerStock[]) {
      const current = state.get(prior.id);
      if (!current) throw new ConflictException('No se puede recuperar el estado físico.');
      const restored = old.get(prior.id);
      state.set(
        prior.id,
        restored
          ? {
              ...restored,
              costUsd:
                restored.costUsd === undefined
                  ? (historical?.get(prior.id) ?? null)
                  : restored.costUsd,
              version: current.version,
            }
          : {
              ...current,
              quantity: 0,
              costUsd: '0.0000',
              countedPieces: current.countedPieces === null ? null : 0,
              state: 'empty',
            },
      );
    }
    this.retireEmptyBoxes(state);
    const movementId = await this.persistMovement(
      client,
      lot,
      before,
      state,
      'reversal',
      reason,
      actor,
      key,
      hash,
      undefined,
      id,
    );
    return { movementId, lotId: lot.id };
  }
  async reverseSale(
    client: PoolClient,
    movementIds: string[],
    actor: string,
    key: string,
    hash: string,
  ) {
    await client.query('select pg_advisory_xact_lock(68493003)');
    const result: InventoryCommandResult[] = [];
    for (const id of [...new Set(movementIds)].sort())
      result.push(
        await this.reverseMovement(
          client,
          id,
          'Anulación de comprobante comercial',
          actor,
          key,
          hash,
          true,
        ),
      );
    return result;
  }
  async reverse(
    id: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<InventoryCommandResult> {
    z.uuid().parse(id);
    const data = reversalSchema.parse(body);
    return this.runCommand(`reverse:${id}`, data, key, actor, (client, hash) =>
      this.reverseMovement(client, id, data.reason, actor, key!, hash),
    );
  }
}
