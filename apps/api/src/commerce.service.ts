import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';
import Decimal from 'decimal.js';
import { z } from 'zod';
import {
  businessDate,
  clientSchema,
  updateClientSchema,
  commerceListSchema,
  saleSchema,
  paymentSchema,
  changeSaleDatesSchema,
  commerceReversalSchema,
  updatePricesSchema,
  totalSaleLines,
  saleCollectionDatesError,
  settlementBasisForLines,
  paymentSettlementBasis,
  quotedVesToUsd,
  settleQuotedVes,
  receivableStatus,
  collectionWhatsApp,
  type ClientSummary,
  type ClientAccount,
  type PriceItem,
  type SaleSummary,
  type SaleDetail,
  type SaleLine,
  type SaleAllocation,
  type PaymentSummary,
  type PaymentDetail,
  type CollectionsOverview,
  type ClientSnapshot,
  type Presentation,
  type SalePriceBasis,
  type PaymentCurrency,
  type SettlementBasis,
} from '../../../packages/domain/src/commerce';
import { InventoryService } from './inventory.service';
import { BcvService } from './bcv.service';
import { applyPresentationPrices } from './commerce-prices';
import { commandIsDemo } from './production-state';
import { authConfig } from './auth/config';
import type { HistoricalOfficialRate, HistoricalUsdtRate } from './bcv-rate';

const clientSelect = `select c.id,c.name,c.phone,c.tax_id as "taxId",c.address,c.notes,c.active,c.version,c.is_demo as "isDemo",
  coalesce((select sum(balance_usd) from receivables r where r.client_id=c.id),0)::numeric(18,2)::text as "balanceUsd" from clients c`;
const saleSelect = `select s.id,s.number,s.client_id as "clientId",s.client_snapshot->>'name' as "clientName",s.condition,s.settlement_basis as "settlementBasis",
  case when cancel.id is null then 'confirmed' else 'cancelled' end as status,s.sold_at as "soldAt",s.due_date::text as "originalDueDate",
  case when dates.id is null then s.due_date::text else dates.due_date::text end as "dueDate",
  case when dates.id is null then s.reminder_date::text else dates.reminder_date::text end as "reminderDate",
  s.total_usd::text as "totalUsd",coalesce(paid.amount,0)::numeric(18,2)::text as "paidUsd",
  case when cancel.id is null then (s.total_usd-coalesce(paid.amount,0)) else 0 end::numeric(18,2)::text as "balanceUsd",
  null::text as "costUsd",null::text as "grossProfitUsd",
  (select case when bool_and(l.reference_unit_usd is not null) then sum(round(l.quantity*l.reference_unit_usd,2))-s.total_usd end from sale_lines l where l.sale_id=s.id)::numeric(18,2)::text as "discountUsd",
  s.is_demo as "isDemo",s.notes,s.actor,s.client_snapshot as client
  from sales s left join sale_cancellations cancel on cancel.sale_id=s.id
  left join lateral(select id,due_date,reminder_date from sale_date_events where sale_id=s.id order by event_order desc limit 1) dates on true
  left join lateral(select sum(a.amount_usd) as amount from payment_applications a where a.sale_id=s.id and not exists(select 1 from payment_reversals r where r.payment_id=a.payment_id))paid on true`;
const paymentSelect = `select p.id,p.number,p.client_id as "clientId",p.client_snapshot->>'name' as "clientName",p.currency,
  p.amount::numeric(18,2)::text as amount,p.amount_usd::numeric(18,2)::text as "amountUsd",p.method,p.received_at as "receivedAt",p.actor,p.is_demo as "isDemo",
  exists(select 1 from payment_reversals r where r.payment_id=p.id) as reversed from payments p`;
const snapshot = (client: ClientSummary): ClientSnapshot => ({
  name: client.name,
  phone: client.phone,
  taxId: client.taxId,
  address: client.address,
});
type PaymentInput = z.infer<typeof paymentSchema>;
type PaymentConversion = {
  amountUsd: string;
  basis: Exclude<SettlementBasis, 'legacy_bcv'>;
  bcvRate: HistoricalOfficialRate | null;
  usdtRate: HistoricalUsdtRate | null;
  usdtReferenceRate: HistoricalUsdtRate | null;
  roundingUsd: string;
};

@Injectable()
export class CommerceService implements OnModuleDestroy {
  private readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 4,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 30000,
  });
  constructor(
    @Inject(InventoryService) private readonly inventory: InventoryService,
    @Inject(BcvService) private readonly bcv: BcvService,
  ) {
    this.pool.on('error', () =>
      console.warn('La consulta comercial se interrumpió; vuelve a intentarlo.'),
    );
  }
  async onModuleDestroy() {
    await this.pool.end();
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
  private async client(client: PoolClient, id: string, lock = false): Promise<ClientSummary> {
    const value = (
      await client.query(`${clientSelect} where c.id=$1 ${lock ? 'for update of c' : ''}`, [id])
    ).rows[0];
    if (!value) throw new NotFoundException('Este cliente no existe.');
    return value;
  }
  async clients(query: unknown = {}): Promise<ClientSummary[]> {
    const filter = commerceListSchema.parse(query);
    return this.read(
      async (client) =>
        (
          await client.query(
            `${clientSelect} where ($1::text is null or c.name ilike '%'||$1||'%' or c.phone ilike '%'||$1||'%' or c.tax_id ilike '%'||$1||'%') order by c.name,c.id limit $2 offset $3`,
            [filter.search ?? null, filter.limit, filter.offset],
          )
        ).rows,
    );
  }
  async saveClient(
    body: unknown,
    key: string | undefined,
    actor: string,
    id?: string,
  ): Promise<ClientSummary> {
    if (id) z.uuid().parse(id);
    const data = id ? updateClientSchema.parse(body) : clientSchema.parse(body);
    return this.inventory.runCommand(`client:${id ?? 'new'}`, data, key, actor, async (client) => {
      const before = id ? await this.client(client, id, true) : null;
      if (before && 'version' in data && before.version !== data.version)
        throw new ConflictException('El cliente cambió. Actualiza su ficha antes de guardar.');
      const clientId = id ?? randomUUID();
      if (id && 'active' in data)
        await client.query(
          'update clients set name=$2,phone=$3,tax_id=$4,address=$5,notes=$6,active=$7,version=version+1 where id=$1',
          [
            id,
            data.name,
            data.phone || null,
            data.taxId || null,
            data.address || null,
            data.notes,
            data.active,
          ],
        );
      else
        await client.query(
          'insert into clients(id,name,phone,tax_id,address,notes,is_demo) values($1,$2,$3,$4,$5,$6,$7)',
          [
            clientId,
            data.name,
            data.phone || null,
            data.taxId || null,
            data.address || null,
            data.notes,
            commandIsDemo('isDemo' in data && data.isDemo),
          ],
        );
      const after = await this.client(client, clientId);
      await this.audit(
        client,
        'client',
        clientId,
        id ? 'update' : 'create',
        before,
        after,
        actor,
        key!,
      );
      return after;
    });
  }
  async prices(): Promise<PriceItem[]> {
    return this.read((client) => this.readPrices(client));
  }
  private async readPrices(client: PoolClient): Promise<PriceItem[]> {
    return (
      await client.query(`select r.id as "configurationId",r.variant_id as "variantId",presentations.value as presentation,
      max(i.unit_usd) filter(where l.payment_basis='usd_cash_promo')::text as "promoUsd",
      max(i.unit_usd) filter(where l.payment_basis='ves_regular')::text as "regularUsd"
      from packing_rules r cross join lateral jsonb_array_elements_text(to_jsonb(r.allowed_presentations))presentations(value)
      left join price_items i on i.variant_id=r.variant_id and i.presentation=presentations.value left join price_lists l on l.id=i.price_list_id
      group by r.id,r.variant_id,presentations.value order by r.id,presentations.value`)
    ).rows;
  }
  async savePrices(body: unknown, key: string | undefined, actor: string): Promise<PriceItem[]> {
    const data = updatePricesSchema.parse(body);
    return this.inventory.runCommand('prices', data, key, actor, async (client) => {
      await applyPresentationPrices(client, data.items, actor, key!);
      return this.readPrices(client);
    });
  }
  private saleSummary(row: Record<string, unknown>): SaleSummary {
    return {
      ...row,
      soldAt: new Date(row.soldAt as string).toISOString(),
      dueStatus: receivableStatus(row.balanceUsd as string, row.dueDate as string | null),
    } as SaleSummary;
  }
  private paymentSummary(row: Record<string, unknown>): PaymentSummary {
    return {
      ...row,
      receivedAt: new Date(row.receivedAt as string).toISOString(),
    } as PaymentSummary;
  }
  private async salesFor(client: PoolClient, query: unknown = {}): Promise<SaleSummary[]> {
    const filter = commerceListSchema.parse(query);
    const rows = (
      await client.query(
        `${saleSelect} where ($1::uuid is null or s.client_id=$1) and ($2::text is null or s.number ilike '%'||$2||'%' or s.client_snapshot->>'name' ilike '%'||$2||'%') order by s.sold_at desc,s.id limit $3 offset $4`,
        [filter.clientId ?? null, filter.search ?? null, filter.limit, filter.offset],
      )
    ).rows;
    return rows.map((row) => this.saleSummary(row));
  }
  async sales(query: unknown = {}): Promise<SaleSummary[]> {
    return this.read((client) => this.salesFor(client, query));
  }
  private async paymentsFor(client: PoolClient, query: unknown = {}): Promise<PaymentSummary[]> {
    const filter = commerceListSchema.parse(query);
    return (
      await client.query(
        `${paymentSelect} where ($1::uuid is null or p.client_id=$1) order by p.received_at desc,p.id limit $2 offset $3`,
        [filter.clientId ?? null, filter.limit, filter.offset],
      )
    ).rows.map((row) => this.paymentSummary(row));
  }
  async payments(query: unknown = {}): Promise<PaymentSummary[]> {
    return this.read((client) => this.paymentsFor(client, query));
  }
  async account(id: string): Promise<ClientAccount> {
    z.uuid().parse(id);
    return this.read(async (client) => ({
      client: await this.client(client, id),
      sales: await this.salesFor(client, { clientId: id, limit: 200 }),
      payments: await this.paymentsFor(client, { clientId: id, limit: 200 }),
    }));
  }
  private async saleDetail(client: PoolClient, id: string): Promise<SaleDetail> {
    const row = (await client.query(`${saleSelect} where s.id=$1`, [id])).rows[0];
    if (!row) throw new NotFoundException('Este comprobante no existe.');
    const lines = (
      await client.query(
        `select l.id,l.variant_id as "variantId",r.id as "configurationId",l.description_snapshot as description,l.presentation,l.quantity,l.price_basis as "priceBasis",
      l.reference_unit_usd::text as "referenceUnitUsd",l.agreed_unit_usd::text as "agreedUnitUsd",l.line_total_usd::text as "totalUsd",null::text as "costUsd",l.commercial_unit_label_snapshot as "commercialUnitLabel"
      from sale_lines l join packing_rules r on r.variant_id=l.variant_id where l.sale_id=$1 order by l.id`,
        [id],
      )
    ).rows as SaleLine[];
    const allocations = (
      await client.query(
        `select a.sale_line_id as "saleLineId",a.lot_id as "lotId",a.container_id as "containerId",a.movement_id as "movementId",a.quantity,null::text as "costUsd"
      from sale_allocations a join sale_lines l on l.id=a.sale_line_id where l.sale_id=$1 order by a.created_at,a.id`,
        [id],
      )
    ).rows as SaleAllocation[];
    for (const line of lines)
      line.allocations = allocations.filter((a) => a.saleLineId === line.id);
    const payments = (
      await client.query(
        `${paymentSelect} join payment_applications a on a.payment_id=p.id where a.sale_id=$1 order by p.received_at,p.id`,
        [id],
      )
    ).rows;
    const applications = (
      await client.query(
        'select payment_id,amount_usd::numeric(18,2)::text as amount from payment_applications where sale_id=$1',
        [id],
      )
    ).rows;
    const dateHistory = (
      await client.query(
        'select id,due_date::text as "dueDate",reminder_date::text as "reminderDate",reason,actor,created_at as "createdAt" from sale_date_events where sale_id=$1 order by event_order',
        [id],
      )
    ).rows.map((event) => ({ ...event, createdAt: new Date(event.createdAt).toISOString() }));
    const cancellation =
      (
        await client.query(
          'select reason,actor,created_at as "createdAt" from sale_cancellations where sale_id=$1',
          [id],
        )
      ).rows[0] ?? null;
    if (cancellation) cancellation.createdAt = new Date(cancellation.createdAt).toISOString();
    // Follow-ups use the current contact and current balance; the document keeps its original snapshot.
    const currentClient = await this.client(client, row.clientId);
    return {
      ...this.saleSummary(row),
      client: row.client,
      notes: row.notes,
      actor: row.actor,
      lines,
      payments: payments.map((p) => ({
        ...this.paymentSummary(p),
        appliedUsd: applications.find((a) => a.payment_id === p.id)!.amount,
      })),
      dateHistory,
      cancellation,
      whatsappUrl:
        row.status === 'confirmed'
          ? collectionWhatsApp(currentClient.phone, currentClient.name, row.number, row.balanceUsd)
          : null,
    };
  }
  async sale(id: string): Promise<SaleDetail> {
    z.uuid().parse(id);
    return this.read((client) => this.saleDetail(client, id));
  }
  private async paymentDetail(client: PoolClient, id: string): Promise<PaymentDetail> {
    const row = (await client.query(`${paymentSelect} where p.id=$1`, [id])).rows[0];
    if (!row) throw new NotFoundException('Este recibo no existe.');
    const info = (
      await client.query(
        'select client_snapshot,bcv_rate_id,usdt_rate_id,usdt_reference_rate_id,conversion_rounding_usd::text,coalesce((select display_name from app_users u where u.id::text=p.actor),p.actor) as operator_name from payments p where id=$1',
        [id],
      )
    ).rows[0];
    const bcvRate = info.bcv_rate_id
      ? (
          await client.query(
            'select id,rate::text,source_url as "sourceUrl",valid_from as "validFrom",valid_until as "validUntil" from bcv_rates where id=$1',
            [info.bcv_rate_id],
          )
        ).rows[0]
      : null;
    if (bcvRate) {
      bcvRate.validFrom = new Date(bcvRate.validFrom).toISOString();
      bcvRate.validUntil = new Date(bcvRate.validUntil).toISOString();
    }
    const usdtRate = info.usdt_rate_id
      ? (
          await client.query(
            'select id,rate::text,source_url as "sourceUrl",valid_from as "validFrom",valid_until as "validUntil" from usdt_rates where id=$1',
            [info.usdt_rate_id],
          )
        ).rows[0]
      : null;
    if (usdtRate) {
      usdtRate.validFrom = new Date(usdtRate.validFrom).toISOString();
      usdtRate.validUntil = new Date(usdtRate.validUntil).toISOString();
    }
    const usdtReferenceRate = info.usdt_reference_rate_id
      ? (
          await client.query(
            'select id,rate::text,source_url as "sourceUrl",valid_from as "validFrom",valid_until as "validUntil" from usdt_rates where id=$1',
            [info.usdt_reference_rate_id],
          )
        ).rows[0]
      : null;
    if (usdtReferenceRate) {
      usdtReferenceRate.validFrom = new Date(usdtReferenceRate.validFrom).toISOString();
      usdtReferenceRate.validUntil = new Date(usdtReferenceRate.validUntil).toISOString();
      usdtReferenceRate.equivalentVes = new Decimal(row.amount)
        .times(usdtReferenceRate.rate)
        .toFixed(2, Decimal.ROUND_HALF_UP);
    }
    const applications = (
      await client.query(
        `select a.sale_id as "saleId",s.number,a.amount_usd::numeric(18,2)::text as "amountUsd",a.balance_after_usd::text as "balanceAfterUsd" from payment_applications a join sales s on s.id=a.sale_id where a.payment_id=$1 order by s.number`,
        [id],
      )
    ).rows;
    const reversal =
      (
        await client.query(
          'select reason,actor,created_at as "createdAt" from payment_reversals where payment_id=$1',
          [id],
        )
      ).rows[0] ?? null;
    if (reversal) reversal.createdAt = new Date(reversal.createdAt).toISOString();
    return {
      ...this.paymentSummary(row),
      client: info.client_snapshot,
      operatorName: info.operator_name,
      bcvRate,
      usdtRate,
      usdtReferenceRate,
      conversionRoundingUsd: info.conversion_rounding_usd,
      applications,
      reversal,
    };
  }
  async payment(id: string): Promise<PaymentDetail> {
    z.uuid().parse(id);
    return this.read((client) => this.paymentDetail(client, id));
  }
  private validateTimestamp(value: string) {
    if (new Date(value).getTime() > Date.now())
      throw new BadRequestException('No se puede registrar una operación con fecha futura.');
  }
  private async conversion(
    input: {
      currency: PaymentCurrency;
      amount: string;
      receivedAt: string;
      rateId?: string;
      informationalUsdtRateId?: string;
    },
    basis: Exclude<SettlementBasis, 'legacy_bcv'>,
    intendedUsd?: string,
  ): Promise<PaymentConversion> {
    this.validateTimestamp(input.receivedAt);
    if (input.currency !== 'VES') {
      let usdtReferenceRate: HistoricalUsdtRate | null = null;
      if (input.currency === 'USDT' && input.informationalUsdtRateId) {
        const candidate = await this.bcv.getUsdtById(
          input.informationalUsdtRateId,
          new Date(input.receivedAt),
        );
        if (candidate) {
          try {
            quotedVesToUsd(input.amount, candidate, 'divisa', new Date());
            usdtReferenceRate = candidate;
          } catch {
            /* Informational only: USDT still settles USD 1:1. */
          }
        }
      }
      return {
        amountUsd: new Decimal(input.amount).toFixed(2),
        basis,
        bcvRate: null,
        usdtRate: null,
        usdtReferenceRate,
        roundingUsd: '0.00',
      };
    }
    const at = new Date(input.receivedAt),
      rate =
        basis === 'divisa'
          ? await this.bcv.getUsdtById(input.rateId!, at)
          : await this.bcv.getById(input.rateId!, at);
    if (!rate)
      throw new ServiceUnavailableException(
        basis === 'divisa'
          ? 'La tasa USDT de compra seleccionada no está vigente y verificada. Actualiza la tasa o registra el cobro en USD/USDT.'
          : 'La tasa BCV oficial seleccionada no está vigente y verificada. Actualiza la tasa o registra el cobro en USD/USDT.',
      );
    try {
      quotedVesToUsd(input.amount, rate, basis, new Date());
    } catch {
      throw new ConflictException(
        'La tasa cotizada venció antes de confirmar. Actualiza la tasa y revisa el cobro.',
      );
    }
    const { amountUsd, roundingUsd } = settleQuotedVes(input.amount, rate, basis, at, intendedUsd);
    if (new Decimal(amountUsd).lte(0))
      throw new BadRequestException(
        'El monto no alcanza un centavo USD; no se registró ningún abono.',
      );
    return {
      amountUsd,
      basis,
      bcvRate: rate.source === 'BCV' ? rate : null,
      usdtRate: rate.source === 'BINANCE_P2P_BUY' ? rate : null,
      usdtReferenceRate: null,
      roundingUsd,
    };
  }
  async createSale(body: unknown, key: string | undefined, actor: string): Promise<SaleDetail> {
    const requested = saleSchema.parse(body);
    return this.inventory.runCommand('sale', requested, key, actor, async (client, hash) => {
      // Resolve time only after the original request's idempotency check and locks.
      // A slow review or an inaccurate device clock must not date a normal sale.
      const now = new Date().toISOString();
      const automatic = 'dateMode' in requested && requested.dateMode === 'automatic';
      const data = {
        ...requested,
        soldAt: automatic ? now : requested.soldAt,
        ...(requested.initialPayment
          ? {
              initialPayment: {
                ...requested.initialPayment,
                receivedAt:
                  automatic || requested.initialPayment.dateMode === 'automatic'
                    ? now
                    : requested.initialPayment.receivedAt,
              },
            }
          : {}),
      };
      const settlementBasis =
        'schemaVersion' in data ? data.settlementBasis : settlementBasisForLines(data.lines);
      this.validateTimestamp(data.soldAt);
      if (data.dueDate && data.dueDate < businessDate(new Date(data.soldAt)))
        throw new BadRequestException('La fecha pactada no puede ser anterior a la venta.');
      if (data.initialPayment && new Date(data.initialPayment.receivedAt) < new Date(data.soldAt))
        throw new BadRequestException('El abono no puede ser anterior a la venta.');
      // The command receipt is checked before consulting rates, so a committed retry
      // remains recoverable even when the official rate later becomes unavailable.
      // BcvService reads the local verified cache only; it performs no network request.
      const customer = await this.client(client, data.clientId, true);
      if (!customer.active)
        throw new ConflictException('Este cliente está inactivo. Actívalo antes de vender.');
      const isDemo = commandIsDemo(customer.isDemo);
      if (customer.isDemo !== isDemo)
        throw new ConflictException(
          'Este entorno no puede mezclar clientes reales con operaciones DEMO.',
        );
      const lines: {
        id: string;
        configurationId: string;
        variantId: string;
        description: string;
        presentation: Presentation;
        quantity: number;
        priceBasis: SalePriceBasis;
        referenceUnitUsd: string | null;
        commercialUnitLabel: string | null;
        agreedUnitUsd: string;
        totalUsd: string;
      }[] = [];
      // The historical reader orders by UUID. Assign independent random UUIDs in
      // byte/hex order to the original request positions, without reordering the
      // document or physical FIFO dispatch. Existing rows and replay stay intact.
      const lineIds = data.lines.map(() => randomUUID()).sort();
      for (const input of data.lines) {
        const rule = (
          await client.query(
            `select r.id,r.variant_id,r.allowed_presentations,r.confirmation_status,r.commercial_unit_label,f.name as fruit,v.name as variety,c.label as caliber,p.commercial_line
          from packing_rules r join product_variants p on p.id=r.variant_id join fruits f on f.id=p.fruit_id
          left join varieties v on v.id=p.variety_id left join calibers c on c.id=p.caliber_id where r.id=$1 for update of r`,
            [input.configurationId],
          )
        ).rows[0];
        if (!rule) throw new NotFoundException('El producto no existe. Actualiza el catálogo.');
        if (authConfig().environment === 'production' && rule.confirmation_status !== 'confirmed')
          throw new ConflictException(
            'Confirma la configuración comercial antes de vender mercancía real.',
          );
        if (!(rule.allowed_presentations as string[]).includes(input.presentation))
          throw new BadRequestException('Esa presentación no está habilitada para el producto.');
        const price =
          'priceBasis' in input
            ? (
                await client.query(
                  'select i.unit_usd::text from price_items i join price_lists l on l.id=i.price_list_id where i.variant_id=$1 and i.presentation=$2 and l.payment_basis=$3',
                  [rule.variant_id, input.presentation, input.priceBasis],
                )
              ).rows[0]
            : null;
        if ('priceBasis' in input && !price)
          throw new ConflictException(
            'Configura el precio de referencia de esa presentación antes de vender.',
          );
        const description = [
          rule.fruit,
          rule.variety,
          rule.caliber ? `Cal. ${rule.caliber}` : null,
          rule.commercial_line,
        ]
          .filter(Boolean)
          .join(' · ');
        lines.push({
          ...input,
          id: lineIds[lines.length],
          variantId: rule.variant_id,
          description,
          priceBasis: 'priceBasis' in input ? input.priceBasis : 'manual',
          referenceUnitUsd: price?.unit_usd ?? null,
          commercialUnitLabel: rule.commercial_unit_label ?? null,
          totalUsd: new Decimal(input.agreedUnitUsd)
            .times(input.quantity)
            .toFixed(2, Decimal.ROUND_HALF_UP),
        });
      }
      const totals = totalSaleLines(lines);
      const conversion = data.initialPayment
        ? await this.conversion(data.initialPayment, settlementBasis, totals.totalUsd)
        : null;
      if (
        data.condition === 'cash' &&
        !new Decimal(conversion?.amountUsd ?? '0').eq(totals.totalUsd)
      )
        throw new BadRequestException(
          'Para contado, el abono debe cubrir el total. Usa Crédito si queda un saldo pendiente.',
        );
      if (conversion && new Decimal(conversion.amountUsd).gt(totals.totalUsd))
        throw new BadRequestException(
          'El abono supera el total. Revisa el monto; no se asignará excedente automáticamente.',
        );
      const datesError = saleCollectionDatesError(
        data,
        totals.totalUsd,
        conversion?.amountUsd ?? '0',
      );
      if (datesError) throw new BadRequestException(datesError);
      const id = randomUUID();
      const allocations = await this.inventory.consumeSale(
        client,
        lines.map((line) => ({
          lineId: line.id,
          configurationId: line.configurationId,
          presentation: line.presentation,
          quantity: line.quantity,
        })),
        actor,
        key!,
        hash,
        isDemo,
        data.soldAt,
      );
      if (
        (
          await client.query(
            'select 1 from lots where id=any($1::uuid[]) and received_at>$2::timestamptz limit 1',
            [allocations.map((a) => a.lotId), data.soldAt],
          )
        ).rowCount
      )
        throw new BadRequestException(
          'La venta no puede tener una fecha anterior a la recepción de su mercancía.',
        );
      const costUsd = allocations.some((item) => item.costUsd === null)
        ? null
        : allocations.reduce((sum, item) => sum.add(item.costUsd!), new Decimal(0)).toFixed(4);
      const number = (
        await client.query("select 'V-'||lpad(nextval('mm_sale_number_seq')::text,8,'0') as number")
      ).rows[0].number;
      await client.query(
        `insert into sales(id,number,client_id,condition,status,sold_at,due_date,reminder_date,client_snapshot,notes,actor,is_demo,total_usd,cost_usd,settlement_basis) values($1,$2,$3,$4,'confirmed',$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          number,
          customer.id,
          data.condition,
          data.soldAt,
          data.dueDate,
          data.reminderDate,
          JSON.stringify(snapshot(customer)),
          data.notes,
          actor,
          isDemo,
          totals.totalUsd,
          costUsd,
          settlementBasis,
        ],
      );
      for (const line of lines) {
        const lineAllocations = allocations.filter((a) => a.saleLineId === line.id);
        const cost = lineAllocations.some((a) => a.costUsd === null)
          ? null
          : lineAllocations.reduce((sum, a) => sum.add(a.costUsd!), new Decimal(0)).toFixed(4);
        await client.query(
          `insert into sale_lines(id,sale_id,variant_id,presentation,quantity,reference_unit_usd,agreed_unit_usd,price_basis,description_snapshot,line_total_usd,cost_usd,commercial_unit_label_snapshot) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            line.id,
            id,
            line.variantId,
            line.presentation,
            line.quantity,
            line.referenceUnitUsd,
            line.agreedUnitUsd,
            line.priceBasis,
            line.description,
            line.totalUsd,
            cost,
            line.commercialUnitLabel,
          ],
        );
      }
      for (const a of allocations)
        await client.query(
          'insert into sale_allocations(sale_line_id,lot_id,container_id,movement_id,quantity,cost_usd) values($1,$2,$3,$4,$5,$6)',
          [a.saleLineId, a.lotId, a.containerId, a.movementId, a.quantity, a.costUsd],
        );
      if (data.initialPayment && conversion)
        await this.insertPayment(
          client,
          {
            ...data.initialPayment,
            clientId: customer.id,
            applications: [{ saleId: id, amountUsd: conversion.amountUsd }],
          },
          conversion,
          actor,
          key!,
          customer,
        );
      const result = await this.saleDetail(client, id);
      await this.audit(
        client,
        'sale',
        id,
        'confirm',
        null,
        { ...totals, costUsd, allocations },
        actor,
        key!,
      );
      return result;
    });
  }
  private async insertPayment(
    client: PoolClient,
    data: PaymentInput,
    conversion: PaymentConversion,
    actor: string,
    key: string,
    customer: ClientSummary,
  ): Promise<string> {
    const rate = conversion.bcvRate ?? conversion.usdtRate;
    if (conversion.usdtReferenceRate) {
      try {
        quotedVesToUsd(data.amount, conversion.usdtReferenceRate, 'divisa', new Date());
      } catch {
        conversion.usdtReferenceRate = null;
      }
    }
    if (rate) {
      try {
        quotedVesToUsd(data.amount, rate, conversion.basis, new Date());
      } catch {
        throw new ConflictException(
          'La tasa cotizada venció antes de confirmar. Actualiza la tasa y revisa el cobro.',
        );
      }
    }
    if (
      rate &&
      settleQuotedVes(
        data.amount,
        rate,
        conversion.basis,
        new Date(data.receivedAt),
        conversion.amountUsd,
      ).amountUsd !== conversion.amountUsd
    )
      throw new ConflictException('La tasa del cobro dejó de ser válida.');
    if (
      !new Decimal(conversion.amountUsd).eq(
        data.applications.reduce((sum, a) => sum.add(a.amountUsd), new Decimal(0)),
      )
    )
      throw new BadRequestException(
        'El reparto debe coincidir exactamente con el equivalente USD recibido. Revisa cualquier excedente.',
      );
    // runCommand already holds the common advisory tree lock; all commercial INSERT
    // triggers take that same lock. These immutable documents need no UPDATE grant.
    const sales = (
      await client.query(
        'select id,client_id,is_demo,sold_at,settlement_basis from sales where id=any($1::uuid[]) order by id',
        [data.applications.map((a) => a.saleId)],
      )
    ).rows;
    if (
      sales.length !== data.applications.length ||
      sales.some((s) => s.client_id !== customer.id || s.is_demo !== customer.isDemo)
    )
      throw new BadRequestException('Selecciona comprobantes del mismo cliente y entorno.');
    if (sales.some((s) => new Date(s.sold_at) > new Date(data.receivedAt)))
      throw new BadRequestException(
        'El abono no puede ser anterior a los comprobantes seleccionados.',
      );
    if (
      data.currency === 'VES' &&
      this.paymentBasis(
        sales.map((sale) => sale.settlement_basis),
        data.currency,
      ) !== conversion.basis
    )
      throw new ConflictException(
        'El acuerdo de cobro no coincide con los comprobantes seleccionados.',
      );
    const balances = (
      await client.query(
        'select sale_id,balance_usd::text from receivables where sale_id=any($1::uuid[])',
        [data.applications.map((a) => a.saleId)],
      )
    ).rows;
    for (const application of data.applications) {
      const invoice = balances.find((r) => r.sale_id === application.saleId);
      if (!invoice || new Decimal(application.amountUsd).gt(invoice.balance_usd))
        throw new ConflictException(
          'El abono supera el saldo actual de un comprobante o este fue anulado. Actualiza el reparto.',
        );
    }
    const id = randomUUID();
    const persisted = await client.query<{ usdt_reference_rate_id: string | null }>(
      'insert into payments(id,client_id,currency,amount,amount_usd,bcv_rate_id,received_at,idempotency_key,method,actor,client_snapshot,is_demo,usdt_rate_id,usdt_reference_rate_id,conversion_rounding_usd) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15) returning usdt_reference_rate_id',
      [
        id,
        customer.id,
        data.currency,
        data.amount,
        conversion.amountUsd,
        conversion.bcvRate?.id ?? null,
        data.receivedAt,
        key,
        data.method,
        actor,
        JSON.stringify(snapshot(customer)),
        customer.isDemo,
        conversion.usdtRate?.id ?? null,
        conversion.usdtReferenceRate?.id ?? null,
        conversion.roundingUsd,
      ],
    );
    // An informational quote can expire in the final INSERT boundary. Its
    // omission by the guard must also be reflected in this operation's audit.
    if (persisted.rows[0]?.usdt_reference_rate_id === null) conversion.usdtReferenceRate = null;
    for (const application of data.applications) {
      const balance = balances.find((r) => r.sale_id === application.saleId)!.balance_usd;
      await client.query(
        'insert into payment_applications(payment_id,sale_id,client_id,amount_usd,balance_after_usd) values($1,$2,$3,$4,$5)',
        [
          id,
          application.saleId,
          customer.id,
          application.amountUsd,
          new Decimal(balance).sub(application.amountUsd).toFixed(2),
        ],
      );
    }
    await this.audit(
      client,
      'payment',
      id,
      'receive',
      null,
      {
        currency: data.currency,
        amount: data.amount,
        amountUsd: conversion.amountUsd,
        applications: data.applications,
        method: data.method,
        settlementBasis: data.currency === 'VES' ? conversion.basis : null,
        rateId: rate?.id ?? null,
        informationalUsdtRateId: conversion.usdtReferenceRate?.id ?? null,
        conversionRoundingUsd: conversion.roundingUsd,
      },
      actor,
      key,
    );
    return id;
  }
  async createPayment(
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<PaymentDetail> {
    const requested = paymentSchema.parse(body);
    return this.inventory.runCommand('payment', requested, key, actor, async (client) => {
      const data =
        requested.dateMode === 'automatic'
          ? { ...requested, receivedAt: new Date().toISOString() }
          : requested;
      const customer = await this.client(client, data.clientId, true);
      if (commandIsDemo(customer.isDemo) !== customer.isDemo)
        throw new ConflictException('Este entorno acepta únicamente cobros DEMO.');
      const sales = (
        await client.query<{ settlement_basis: SettlementBasis }>(
          'select settlement_basis from sales where id=any($1::uuid[]) and client_id=$2 and is_demo=$3 order by id',
          [
            data.applications.map((application) => application.saleId),
            customer.id,
            customer.isDemo,
          ],
        )
      ).rows;
      if (sales.length !== data.applications.length)
        throw new BadRequestException('Selecciona comprobantes del mismo cliente y entorno.');
      const conversion = await this.conversion(
        data,
        this.paymentBasis(
          sales.map((sale) => sale.settlement_basis),
          data.currency,
        ),
        data.applications
          .reduce((sum, application) => sum.add(application.amountUsd), new Decimal(0))
          .toFixed(2),
      );
      const id = await this.insertPayment(client, data, conversion, actor, key!, customer);
      return this.paymentDetail(client, id);
    });
  }
  private paymentBasis(bases: SettlementBasis[], currency: PaymentCurrency) {
    try {
      return paymentSettlementBasis(bases, currency);
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }
  async changeDates(
    id: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<SaleDetail> {
    z.uuid().parse(id);
    const data = changeSaleDatesSchema.parse(body);
    return this.inventory.runCommand(`sale-dates:${id}`, data, key, actor, async (client) => {
      const before = await this.saleDetail(client, id);
      if (before.condition !== 'credit')
        throw new ConflictException('Solo las ventas a crédito admiten fechas de cobranza.');
      if (before.status === 'cancelled' || new Decimal(before.balanceUsd).lte(0))
        throw new ConflictException('Solo se reprograman comprobantes con saldo pendiente.');
      await client.query(
        'insert into sale_date_events(sale_id,due_date,reminder_date,reason,actor) values($1,$2,$3,$4,$5)',
        [id, data.dueDate, data.reminderDate, data.reason, actor],
      );
      await this.audit(
        client,
        'sale',
        id,
        'reschedule',
        { dueDate: before.dueDate, reminderDate: before.reminderDate },
        data,
        actor,
        key!,
      );
      return this.saleDetail(client, id);
    });
  }
  async cancelSale(
    id: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<SaleDetail> {
    z.uuid().parse(id);
    const data = commerceReversalSchema.parse(body);
    return this.inventory.runCommand(
      `sale-cancel:${id}`,
      data,
      key,
      actor,
      async (client, hash) => {
        const before = await this.saleDetail(client, id);
        if (before.status === 'cancelled')
          throw new ConflictException('El comprobante ya está anulado.');
        if (new Decimal(before.paidUsd).gt(0))
          throw new ConflictException(
            'Primero rectifica los abonos asociados. La anulación no devuelve dinero automáticamente.',
          );
        const movementIds = [
          ...new Set(before.lines.flatMap((line) => line.allocations.map((a) => a.movementId))),
        ];
        await this.inventory.reverseSale(client, movementIds, actor, key!, hash);
        await client.query(
          'insert into sale_cancellations(sale_id,reason,actor) values($1,$2,$3)',
          [id, data.reason, actor],
        );
        await this.audit(
          client,
          'sale',
          id,
          'cancel',
          before,
          { reason: data.reason },
          actor,
          key!,
        );
        return this.saleDetail(client, id);
      },
    );
  }
  async reversePayment(
    id: string,
    body: unknown,
    key: string | undefined,
    actor: string,
  ): Promise<PaymentDetail> {
    z.uuid().parse(id);
    const data = commerceReversalSchema.parse(body);
    return this.inventory.runCommand(`payment-reverse:${id}`, data, key, actor, async (client) => {
      const before = await this.paymentDetail(client, id);
      if (before.reversed) throw new ConflictException('El abono ya tiene una reversa registrada.');
      await client.query(
        'insert into payment_reversals(payment_id,reason,actor) values($1,$2,$3)',
        [id, data.reason, actor],
      );
      await this.audit(client, 'payment', id, 'reverse', before, data, actor, key!);
      return this.paymentDetail(client, id);
    });
  }
  async collections(): Promise<CollectionsOverview> {
    return this.read(async (client) => {
      const today = businessDate();
      const totals = (
        await client.query(
          'select coalesce(sum(balance_usd),0)::numeric(18,2)::text as total,coalesce(sum(balance_usd) filter(where due_date<$1::date),0)::numeric(18,2)::text as overdue,count(*)::integer as count from receivables where balance_usd>0',
          [today],
        )
      ).rows[0];
      const rows = (
        await client.query(`${saleSelect} where cancel.id is null and s.total_usd>coalesce(paid.amount,0)
        order by coalesce(case when dates.id is null then s.reminder_date else dates.reminder_date end,case when dates.id is null then s.due_date else dates.due_date end) nulls last,s.sold_at,s.id limit 200`)
      ).rows;
      const invoices = rows.map((row) => this.saleSummary(row));
      return {
        today,
        timezone: 'America/Caracas',
        totalUsd: totals.total,
        overdueUsd: totals.overdue,
        totalInvoices: totals.count,
        truncated: totals.count > invoices.length,
        invoices,
        todayInvoices: invoices.filter((s) => s.reminderDate === today || s.dueDate === today),
        upcomingInvoices: invoices.filter(
          (s) => (s.reminderDate && s.reminderDate > today) || (s.dueDate && s.dueDate > today),
        ),
        overdueInvoices: invoices.filter((s) => s.dueDate && s.dueDate < today),
      };
    });
  }
}
