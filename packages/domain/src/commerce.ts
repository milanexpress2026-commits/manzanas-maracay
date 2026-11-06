import { z } from 'zod';
import Decimal from 'decimal.js';

const text = z.string().trim();
const note = text.max(500).default('');
export const presentationSchema = z.enum(['box', 'half_box', 'blister']);
export const priceBasisSchema = z.enum(['usd_cash_promo', 'ves_regular']);
export type Presentation = z.infer<typeof presentationSchema>;
export type PriceBasis = z.infer<typeof priceBasisSchema>;
export type SalePriceBasis = PriceBasis | 'manual';
export type SettlementBasis = 'divisa' | 'bcv' | 'legacy_bcv';
export type PaymentCurrency = 'USD' | 'USDT' | 'VES';
export const paymentMethodOptions = [
  { id: 'usd_cash', label: 'Efectivo USD', currency: 'USD' },
  { id: 'usdt_transfer', label: 'Transferencia USDT', currency: 'USDT' },
  { id: 'bolivares', label: 'Bolívares', currency: 'VES' },
] as const;
export function paymentMethodLabel(method: string): string {
  return paymentMethodOptions.find((option) => option.id === method)?.label ?? method;
}
export function paymentMethodIsCompatible(currency: PaymentCurrency, method: string): boolean {
  if (paymentMethodOptions.some((option) => option.currency === currency && option.id === method))
    return true;
  // Keep exact historical input strings to preserve committed idempotency hashes.
  return (
    currency === 'USD' &&
    ['efectivo', 'usd efectivo', 'efectivo usd'].includes(method.toLocaleLowerCase('es'))
  );
}
export function settlementBasisForLines(
  lines: readonly { priceBasis: PriceBasis }[],
): Exclude<SettlementBasis, 'legacy_bcv'> {
  const bases = new Set(
    lines.map((line) =>
      line.priceBasis === 'usd_cash_promo' ? ('divisa' as const) : ('bcv' as const),
    ),
  );
  if (bases.size !== 1)
    throw new Error(
      'Usa un solo acuerdo de precio por venta: divisa o bolívares BCV. Registra acuerdos distintos por separado.',
    );
  return [...bases][0]!;
}
export function paymentSettlementBasis(
  bases: readonly SettlementBasis[],
  currency: PaymentCurrency = 'VES',
): Exclude<SettlementBasis, 'legacy_bcv'> {
  const normalized = new Set(
    bases.map((basis) => (basis === 'divisa' ? ('divisa' as const) : ('bcv' as const))),
  );
  if (normalized.size === 0 || (currency === 'VES' && normalized.size !== 1))
    throw new Error(
      'Estos comprobantes tienen acuerdos de cobro diferentes. Registra sus abonos por separado.',
    );
  return [...normalized][0]!;
}
export function quotedVesToUsd(
  amount: string,
  rate: {
    rate: string;
    source: 'BCV' | 'BINANCE_P2P_BUY';
    verifiedAt: Date;
    validFrom: Date;
    validUntil: Date;
  },
  basis: Exclude<SettlementBasis, 'legacy_bcv'>,
  at: Date,
): string {
  const value = new Decimal(rate.rate),
    received = new Decimal(amount);
  if (
    rate.source !== (basis === 'divisa' ? 'BINANCE_P2P_BUY' : 'BCV') ||
    !value.isFinite() ||
    value.lte(0) ||
    !received.isFinite() ||
    received.lte(0) ||
    !Number.isFinite(at.getTime()) ||
    [rate.verifiedAt, rate.validFrom, rate.validUntil].some(
      (time) => !Number.isFinite(time.getTime()),
    ) ||
    rate.verifiedAt > at ||
    rate.validUntil <= rate.validFrom ||
    at < rate.validFrom ||
    at >= rate.validUntil
  )
    throw new Error(
      'La tasa seleccionada no está vigente o no corresponde al acuerdo de esta venta.',
    );
  return received.div(value).toFixed(2, Decimal.ROUND_HALF_UP);
}
/** Settle the USD amount whose displayed, cent-rounded VES amount was received.
 * No arbitrary USD tolerance: the forward conversion must match exactly.
 * The adjustment is persisted separately for an auditable rounding decision.
 */
export function settleQuotedVes(
  amount: string,
  rate: Parameters<typeof quotedVesToUsd>[1],
  basis: Exclude<SettlementBasis, 'legacy_bcv'>,
  at: Date,
  intendedUsd?: string,
): { amountUsd: string; roundingUsd: string } {
  const converted = quotedVesToUsd(amount, rate, basis, at);
  if (intendedUsd !== undefined) {
    const target = new Decimal(intendedUsd);
    if (!target.isFinite() || target.lte(0) || target.decimalPlaces() > 2)
      throw new Error('El importe USD a liquidar debe ser positivo y tener hasta dos decimales.');
    if (
      target.times(rate.rate).toFixed(2, Decimal.ROUND_HALF_UP) === new Decimal(amount).toFixed(2)
    )
      return { amountUsd: target.toFixed(2), roundingUsd: target.sub(converted).toFixed(2) };
  }
  return { amountUsd: converted, roundingUsd: '0.00' };
}
export const commercialPriceSchema = text
  .regex(/^\d{1,11}(\.\d{1,4})?$/, 'Escribe un precio USD con hasta cuatro decimales.')
  .transform((v) => new Decimal(v).toFixed(4));
export const paymentAmountSchema = text
  .regex(/^\d{1,14}(\.\d{1,2})?$/, 'Escribe un monto con hasta dos decimales.')
  .refine((v) => new Decimal(v).gt(0), 'El abono debe ser mayor que cero.')
  .transform((v) => new Decimal(v).toFixed(2));
export function normalizePhone(value: string): string {
  const normalized = value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized))
    throw new Error(
      'Usa el teléfono con prefijo internacional, por ejemplo +58, sin omitir el código de país.',
    );
  return normalized;
}
const phoneSchema = text
  .max(40)
  .default('')
  .transform((v, ctx) => {
    if (!v) return '';
    try {
      return normalizePhone(v);
    } catch {
      ctx.addIssue({
        code: 'custom',
        message: 'Usa un teléfono internacional válido que comience con + y código de país.',
      });
      return z.NEVER;
    }
  });
export const clientSchema = z
  .object({
    name: text.min(2).max(120),
    phone: phoneSchema,
    taxId: text.max(40).default(''),
    address: text.max(250).default(''),
    notes: note,
    isDemo: z.boolean().default(false),
  })
  .strict();
export const updateClientSchema = clientSchema
  .omit({ isDemo: true })
  .extend({ active: z.boolean(), version: z.number().int().positive() })
  .strict();
export const presentationPricesSchema = z
  .object({
    variantId: z.uuid(),
    presentation: presentationSchema,
    promoUsd: commercialPriceSchema,
    regularUsd: commercialPriceSchema,
  })
  .strict();
export const updatePricesSchema = z
  .object({ items: z.array(presentationPricesSchema).min(1).max(100) })
  .strict();
export const initialPaymentSchema = z
  .object({
    currency: z.enum(['USD', 'USDT', 'VES']),
    amount: paymentAmountSchema,
    method: text.min(2).max(80),
    receivedAt: z.iso.datetime({ offset: true }),
    rateId: z.uuid().optional(),
    informationalUsdtRateId: z.uuid().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!paymentMethodIsCompatible(value.currency, value.method))
      ctx.addIssue({
        code: 'custom',
        path: ['method'],
        message: 'Selecciona un método confirmado y compatible con la moneda.',
      });
    if (value.currency === 'VES' && !value.rateId)
      ctx.addIssue({
        code: 'custom',
        path: ['rateId'],
        message: 'Actualiza y selecciona la tasa verificada antes de cobrar bolívares.',
      });
    if (value.currency !== 'VES' && value.rateId)
      ctx.addIssue({
        code: 'custom',
        path: ['rateId'],
        message: 'Los cobros USD y USDT se aplican 1:1 y no usan una tasa de bolívares.',
      });
    if (value.currency !== 'USDT' && value.informationalUsdtRateId)
      ctx.addIssue({
        code: 'custom',
        path: ['informationalUsdtRateId'],
        message:
          'La referencia informativa en bolívares corresponde solo a un pago recibido en USDT.',
      });
  });
// Keep the previous parsed shape unchanged: committed command hashes depend on it.
export const legacySaleSchema = z
  .object({
    clientId: z.uuid(),
    condition: z.enum(['cash', 'credit']),
    soldAt: z.iso.datetime({ offset: true }),
    dueDate: z.iso.date().nullable().default(null),
    reminderDate: z.iso.date().nullable().default(null),
    notes: note,
    lines: z
      .array(
        z
          .object({
            configurationId: z.uuid(),
            presentation: presentationSchema,
            quantity: z.number().int().min(1).max(1000),
            priceBasis: priceBasisSchema,
            agreedUnitUsd: commercialPriceSchema,
          })
          .strict(),
      )
      .min(1)
      .max(50),
    initialPayment: initialPaymentSchema.optional(),
  })
  .strict()
  .refine(
    (v) => v.lines.reduce((n, line) => n + line.quantity, 0) <= 1000,
    'Divide las ventas de más de 1.000 presentaciones.',
  )
  .superRefine((value, ctx) => {
    try {
      settlementBasisForLines(value.lines);
    } catch (error) {
      ctx.addIssue({ code: 'custom', path: ['lines'], message: (error as Error).message });
    }
    // The API repeats this check after converting any non-USD payment using
    // its verified server rate. The request must never supply that conversion.
    const totalUsd = totalSaleLines(
      value.lines.map((line) => ({ ...line, referenceUnitUsd: line.agreedUnitUsd })),
    ).totalUsd;
    const paidUsd =
      value.initialPayment && value.initialPayment.currency !== 'VES'
        ? value.initialPayment.amount
        : '0';
    const error = saleCollectionDatesError(value, totalUsd, paidUsd);
    if (!error) return;
    for (const field of ['dueDate', 'reminderDate'] as const)
      if (value[field] !== null) ctx.addIssue({ code: 'custom', path: [field], message: error });
  });

export const manualSaleSchema = z
  .object({
    schemaVersion: z.literal(2),
    clientId: z.uuid(),
    condition: z.enum(['cash', 'credit']),
    settlementBasis: z.enum(['divisa', 'bcv']),
    soldAt: z.iso.datetime({ offset: true }),
    dueDate: z.iso.date().nullable().default(null),
    reminderDate: z.iso.date().nullable().default(null),
    notes: note,
    lines: z
      .array(
        z
          .object({
            configurationId: z.uuid(),
            presentation: presentationSchema,
            quantity: z.number().int().min(1).max(1000),
            agreedUnitUsd: commercialPriceSchema.refine(
              (value) => new Decimal(value).gt(0),
              'Escribe un precio de venta mayor que cero.',
            ),
          })
          .strict(),
      )
      .min(1)
      .max(50),
    initialPayment: initialPaymentSchema.optional(),
  })
  .strict()
  .refine(
    (sale) => sale.lines.reduce((sum, line) => sum + line.quantity, 0) <= 1000,
    'Divide las ventas de más de 1.000 presentaciones.',
  )
  .superRefine((sale, ctx) => {
    const total = totalSaleLines(sale.lines.map((line) => ({ ...line, referenceUnitUsd: null })));
    if (new Decimal(total.totalUsd).lte(0))
      ctx.addIssue({
        code: 'custom',
        path: ['lines'],
        message: 'El total de la venta debe alcanzar al menos un centavo USD.',
      });
    const paid =
      sale.initialPayment?.currency !== 'VES' ? (sale.initialPayment?.amount ?? '0') : '0';
    const error = saleCollectionDatesError(sale, total.totalUsd, paid);
    if (error)
      for (const field of ['dueDate', 'reminderDate'] as const)
        if (sale[field] !== null) ctx.addIssue({ code: 'custom', path: [field], message: error });
  });
export const saleSchema = z.union([manualSaleSchema, legacySaleSchema]);

/** Dates are an instruction to collect outstanding credit, never a paid sale. */
export function saleCollectionDatesError(
  sale: { condition: 'cash' | 'credit'; dueDate: string | null; reminderDate: string | null },
  totalUsd: string,
  paidUsd: string,
): string | null {
  if (sale.dueDate === null && sale.reminderDate === null) return null;
  if (sale.condition === 'cash')
    return 'Contado no admite fecha pactada ni recordatorio. Retira esas fechas para cobrar.';
  if (new Decimal(paidUsd).gte(totalUsd))
    return 'Esta venta queda pagada. Retira la fecha pactada y el recordatorio de cobranza.';
  return null;
}
export const paymentSchema = initialPaymentSchema
  .safeExtend({
    clientId: z.uuid(),
    applications: z
      .array(z.object({ saleId: z.uuid(), amountUsd: paymentAmountSchema }).strict())
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (v) => new Set(v.applications.map((a) => a.saleId)).size === v.applications.length,
    'Cada comprobante debe aparecer una sola vez en el reparto.',
  );
export const changeSaleDatesSchema = z
  .object({
    dueDate: z.iso.date().nullable(),
    reminderDate: z.iso.date().nullable(),
    reason: text.min(5).max(500),
  })
  .strict();
export const commerceReversalSchema = z.object({ reason: text.min(5).max(500) }).strict();
export const commerceListSchema = z
  .object({
    clientId: z.uuid().optional(),
    search: text.max(120).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  })
  .strict();
export const businessDate = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
export function addBusinessDays(date: string, days: number) {
  z.iso.date().parse(date);
  if (!Number.isSafeInteger(days) || days < 0 || days > 3660) throw new Error('Plazo inválido.');
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
export function receivableStatus(
  balance: string,
  dueDate: string | null,
  today = businessDate(),
): 'paid' | 'overdue' | 'due_soon' | 'pending' {
  if (new Decimal(balance).eq(0)) return 'paid';
  if (dueDate && dueDate < today) return 'overdue';
  if (dueDate && dueDate <= addBusinessDays(today, 3)) return 'due_soon';
  return 'pending';
}
export function totalSaleLines(
  lines: { quantity: number; agreedUnitUsd: string; referenceUnitUsd: string | null }[],
) {
  let total = new Decimal(0),
    reference = new Decimal(0);
  for (const line of lines) {
    total = total.add(
      new Decimal(line.agreedUnitUsd)
        .times(line.quantity)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    );
    reference = reference.add(
      new Decimal(line.referenceUnitUsd ?? line.agreedUnitUsd)
        .times(line.quantity)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    );
  }
  return {
    totalUsd: total.toFixed(2),
    discountUsd: lines.some((line) => line.referenceUnitUsd === null)
      ? null
      : reference.sub(total).toFixed(2),
  };
}
export function collectionWhatsApp(
  phone: string | null,
  clientName: string,
  number: string,
  balanceUsd: string,
): string | null {
  if (!phone || new Decimal(balanceUsd).lte(0)) return null;
  let normalized: string;
  try {
    normalized = normalizePhone(phone);
  } catch {
    return null;
  }
  const message = `Hola, ${clientName}. Le escribimos de Manzanas Maracay por el comprobante ${number}. Su saldo pendiente actual es USD ${new Decimal(balanceUsd).toFixed(2)}. ¿Podría confirmarnos cuándo realizará el pago? Gracias.`;
  return `https://wa.me/${normalized.slice(1)}?text=${encodeURIComponent(message)}`;
}
export type ClientSummary = {
  id: string;
  name: string;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  notes: string;
  active: boolean;
  version: number;
  isDemo: boolean;
  balanceUsd: string;
};
export type ClientSnapshot = Pick<ClientSummary, 'name' | 'phone' | 'taxId' | 'address'>;
export type PriceItem = {
  configurationId: string;
  variantId: string;
  presentation: Presentation;
  promoUsd: string | null;
  regularUsd: string | null;
};
export type SaleAllocation = {
  saleLineId: string;
  lotId: string;
  containerId: string;
  movementId: string;
  quantity: number;
  costUsd: string | null;
};
export type SaleLine = {
  id: string;
  variantId: string;
  configurationId: string;
  description: string;
  commercialUnitLabel?: string | null;
  presentation: Presentation;
  quantity: number;
  priceBasis: SalePriceBasis;
  referenceUnitUsd: string | null;
  agreedUnitUsd: string;
  totalUsd: string;
  costUsd: string | null;
  allocations: SaleAllocation[];
};
export type SaleSummary = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  condition: 'cash' | 'credit';
  settlementBasis: SettlementBasis;
  status: 'confirmed' | 'cancelled';
  soldAt: string;
  dueDate: string | null;
  reminderDate: string | null;
  originalDueDate: string | null;
  totalUsd: string;
  paidUsd: string;
  balanceUsd: string;
  costUsd: string | null;
  grossProfitUsd: string | null;
  discountUsd: string | null;
  isDemo: boolean;
  dueStatus: ReturnType<typeof receivableStatus>;
};
export type PaymentSummary = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: PaymentCurrency;
  amount: string;
  amountUsd: string;
  method: string;
  receivedAt: string;
  actor: string;
  isDemo: boolean;
  reversed: boolean;
};
export type PaymentApplication = {
  saleId: string;
  number: string;
  amountUsd: string;
  balanceAfterUsd: string;
};
export type PaymentDetail = PaymentSummary & {
  operatorName?: string;
  client: ClientSnapshot;
  bcvRate: {
    id: string;
    rate: string;
    sourceUrl: string;
    validFrom: string;
    validUntil: string;
  } | null;
  usdtRate: {
    id: string;
    rate: string;
    sourceUrl: string;
    validFrom: string;
    validUntil: string;
  } | null;
  usdtReferenceRate?: {
    id: string;
    rate: string;
    sourceUrl: string;
    validFrom: string;
    validUntil: string;
    equivalentVes: string;
  } | null;
  conversionRoundingUsd?: string;
  applications: PaymentApplication[];
  reversal: { reason: string; actor: string; createdAt: string } | null;
};
export type SaleDetail = SaleSummary & {
  client: ClientSnapshot;
  notes: string;
  actor: string;
  lines: SaleLine[];
  payments: (PaymentSummary & { appliedUsd: string })[];
  dateHistory: {
    id: string;
    dueDate: string | null;
    reminderDate: string | null;
    reason: string;
    actor: string;
    createdAt: string;
  }[];
  cancellation: { reason: string; actor: string; createdAt: string } | null;
  whatsappUrl: string | null;
};
export type ClientAccount = {
  client: ClientSummary;
  sales: SaleSummary[];
  payments: PaymentSummary[];
};
export type CollectionsOverview = {
  today: string;
  timezone: 'America/Caracas';
  totalUsd: string;
  overdueUsd: string;
  totalInvoices: number;
  truncated: boolean;
  invoices: SaleSummary[];
  todayInvoices: SaleSummary[];
  upcomingInvoices: SaleSummary[];
  overdueInvoices: SaleSummary[];
};
