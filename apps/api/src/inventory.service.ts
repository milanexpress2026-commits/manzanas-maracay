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
import {
  supplierSchema,
  updateSupplierSchema,
  receiptSchema,
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
} from '../../../packages/domain/src/index';

type LotRow = {
  id: string;
  code: string;
  blisters_per_box_snapshot: number;
  inventory_version: number;
};
type StateMap = Map<string, ContainerStock>;
const containerSelect = `select c.id,c.lot_id as "lotId",c.warehouse_id as "warehouseId",c.parent_id as "parentId",
  c.kind,c.state,s.unit,s.quantity,s.counted_pieces as "countedPieces",s.version
  from containers c join stock_balances s on s.container_id=c.id`;
const supplierSelect = `select id,name,tax_id as "taxId",phone,notes,active,version from suppliers`;
const lotSelect = `select l.id,l.code,l.packing_rule_id as "configurationId",v.fruit_id as "fruitId",
  v.variety_id as "varietyId",v.caliber_id as "caliberId",f.name as fruit,vr.name as variety,cl.label as caliber,
  l.supplier_id as "supplierId",sp.name as supplier,l.received_at as "receivedAt",l.received_boxes as "receivedBoxes",
  l.blisters_per_box_snapshot as "blistersPerBox",l.unit_cost_usd as "unitCostUsd",l.notes,l.is_demo as "isDemo",
  l.inventory_version as version from lots l join product_variants v on v.id=l.variant_id
  join fruits f on f.id=v.fruit_id join varieties vr on vr.id=v.variety_id join calibers cl on cl.id=v.caliber_id
  join suppliers sp on sp.id=l.supplier_id`;

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
          ...summarizeContainers(containers, row.blistersPerBox),
        },
        containers,
        movements,
      };
    });
  }
  private async command<T>(
    kind: string,
    data: unknown,
    key: string | undefined,
    actor: string,
    fn: (client: PoolClient, hash: string) => Promise<T>,
    inventory = true,
  ): Promise<T> {
    if (!actor) throw new UnauthorizedException('Inicia sesión para registrar esta operación.');
    if (!key || !z.uuid().safeParse(key).success)
      throw new BadRequestException('Falta una clave válida para guardar sin duplicados.');
    const hash = createHash('sha256').update(JSON.stringify({ kind, data, actor })).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='5s'");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const receipt = (
        await client.query('select request_hash,response from command_receipts where key=$1', [key])
      ).rows[0];
      if (receipt) {
        if (receipt.request_hash !== hash)
          throw new ConflictException(
            'Esta solicitud ya se usó con otros datos o por otra persona.',
          );
        await client.query('commit');
        return receipt.response as T;
      }
      // Same lock as the database's tree triggers, acquired before individual lot/stock rows.
      if (inventory) await client.query('select pg_advisory_xact_lock(68493003)');
      const result = await fn(client, hash);
      await client.query(
        'insert into command_receipts(key,request_hash,response) values($1,$2,$3::jsonb)',
        [key, hash, JSON.stringify(result)],
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
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
    return this.command(
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
        'select id,code,blisters_per_box_snapshot,inventory_version from lots where id=$1 for update',
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
    };
  }
  private openBox(map: StateMap, box: ContainerStock, blisters: number) {
    if (
      box.kind !== 'box' ||
      box.state !== 'sealed' ||
      box.unit !== 'sealed_box' ||
      box.quantity !== 1
    )
      throw new ConflictException('Selecciona una caja cerrada disponible.');
    box.quantity = 0;
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
          'insert into stock_balances(container_id,unit,quantity,counted_pieces,version) values($1,$2,$3,$4,$5)',
          [current.id, current.unit, current.quantity, current.countedPieces, current.version],
        );
      } else {
        await client.query('update containers set state=$2,parent_id=$3 where id=$1', [
          current.id,
          current.state,
          current.parentId,
        ]);
        await client.query(
          'update stock_balances set unit=$2,quantity=$3,counted_pieces=$4,version=$5 where container_id=$1',
          [current.id, current.unit, current.quantity, current.countedPieces, current.version],
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
  async receive(body: unknown, key: string | undefined, actor: string): Promise<ReceiptResult> {
    const data = receiptSchema.parse(body);
    return this.command('receipt', data, key, actor, async (client, hash) => {
      const supplier = (
        await client.query('select active from suppliers where id=$1 for share', [data.supplierId])
      ).rows[0];
      if (!supplier?.active) throw new BadRequestException('Selecciona un proveedor activo.');
      const warehouse = (
        await client.query('select id from warehouses order by created_at,id limit 1')
      ).rows[0];
      if (!warehouse) throw new NotFoundException('Falta el almacén inicial.');
      const demo =
        data.isDemo || ['staging', 'test', 'preview'].includes(process.env.MM_APP_ENV ?? '');
      const purchaseId = (
        await client.query(
          `insert into purchases(supplier_id,reference,purchased_at,status,notes,is_demo) values($1,$2,$3,'received',$4,$5) returning id`,
          [data.supplierId, data.reference, data.receivedAt, data.notes, demo],
        )
      ).rows[0].id;
      const lots: ReceiptResult['lots'] = [];
      for (const line of data.lines) {
        const rule = (
          await client.query(
            'select id,variant_id,version,blisters_per_box from packing_rules where id=$1 for share',
            [line.configurationId],
          )
        ).rows[0];
        if (!rule)
          throw new BadRequestException('Una configuración ya no existe. Actualiza el catálogo.');
        const lineId = (
          await client.query(
            `insert into purchase_lines(purchase_id,variant_id,quantity,presentation,unit_cost_usd,notes) values($1,$2,$3,'box',$4,$5) returning id`,
            [purchaseId, rule.variant_id, line.boxes, line.unitCostUsd, line.notes],
          )
        ).rows[0].id;
        const id = randomUUID(),
          code = `MM-${data.receivedAt.slice(0, 10).replaceAll('-', '')}-${id.slice(0, 8).toUpperCase()}`;
        const blisterCount = line.blistersPerBox ?? rule.blisters_per_box;
        await client.query(
          `insert into lots(id,code,variant_id,supplier_id,purchase_line_id,packing_rule_id,packing_rule_version,blisters_per_box_snapshot,received_at,unit_cost_usd,received_boxes,notes,is_demo)
          values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
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
          ],
        );
        const state: StateMap = new Map();
        for (let i = 0; i < line.boxes; i++) {
          const box = this.newContainer(id, warehouse.id, 'box', 'sealed_box', 1, null);
          state.set(box.id, box);
        }
        const movementId = await this.persistMovement(
          client,
          { id, code, blisters_per_box_snapshot: blisterCount, inventory_version: 0 },
          [],
          state,
          'receipt',
          `Recepción ${data.reference}`,
          actor,
          key!,
          hash,
        );
        lots.push({ id, code, movementId });
      }
      await this.audit(
        client,
        'purchase',
        purchaseId,
        'receipt',
        null,
        { supplierId: data.supplierId, reference: data.reference, lots },
        actor,
        key!,
      );
      return { purchaseId, lots, movementId: lots[0].movementId };
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
      adjust: adjustmentSchema,
    };
    const validator = validators[operation as keyof typeof validators];
    if (!validator) throw new BadRequestException('Operación de inventario desconocida.');
    const data = validator.parse(body);
    return this.command(`${operation}:${id}`, data, key, actor, async (client, hash) => {
      const lot = await this.lockedLot(client, id),
        before = await this.stock(client, id);
      const state: StateMap = new Map(before.map((item) => [item.id, { ...item }]));
      let kind: InventoryMovement['kind'],
        counts:
          { countedBefore: number; preparedPieces: number; remainingPieces: number } | undefined;
      let usedContainers: { id: string; quantity: number }[] | undefined;
      if (operation === 'open-box') {
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
            state.set(loose.id, loose);
          }
        } else {
          source.unit = 'loose_piece';
          source.quantity = input.remainingPieces;
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
          const pieces = (source.countedPieces ?? 0) + (input.piecesDelta ?? 0);
          if (pieces < 0 || (next === 0 && pieces !== 0) || (next > 0 && pieces <= 0))
            throw new BadRequestException('Indica el ajuste de piezas contado de la media caja.');
          source.countedPieces = pieces;
        } else if (input.piecesDelta != null)
          throw new BadRequestException(
            'Abre el empaque y cuenta las piezas antes de ajustar fruta.',
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
  async reverse(
    id: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<InventoryCommandResult> {
    z.uuid().parse(id);
    const data = reversalSchema.parse(body);
    return this.command(`reverse:${id}`, data, key, actor, async (client, hash) => {
      const movement = (await client.query('select * from inventory_movements where id=$1', [id]))
        .rows[0];
      if (!movement?.lot_id) throw new NotFoundException('Este movimiento no admite reversa.');
      const lot = await this.lockedLot(client, movement.lot_id);
      if (
        movement.kind === 'reversal' ||
        lot.inventory_version !== movement.lot_version_after ||
        (await client.query('select 1 from inventory_movements where reversal_of=$1', [id]))
          .rowCount
      )
        throw new ConflictException(
          'Solo se puede revertir el último movimiento del lote, una vez y sin movimientos posteriores.',
        );
      const before = await this.stock(client, lot.id),
        state: StateMap = new Map(before.map((item) => [item.id, { ...item }]));
      const old = new Map<string, ContainerStock>(
        (movement.before_state as ContainerStock[]).map((item) => [item.id, item]),
      );
      for (const prior of movement.after_state as ContainerStock[]) {
        const current = state.get(prior.id);
        if (!current)
          throw new ConflictException('No se puede recuperar el estado físico del movimiento.');
        const restored = old.get(prior.id);
        if (restored) state.set(prior.id, { ...restored, version: current.version });
        else
          state.set(prior.id, {
            ...current,
            quantity: 0,
            countedPieces: current.countedPieces === null ? null : 0,
            state: 'empty',
          });
      }
      this.retireEmptyBoxes(state);
      const movementId = await this.persistMovement(
        client,
        lot,
        before,
        state,
        'reversal',
        data.reason,
        actor,
        key!,
        hash,
        undefined,
        id,
      );
      return { movementId, lotId: lot.id };
    });
  }
}
