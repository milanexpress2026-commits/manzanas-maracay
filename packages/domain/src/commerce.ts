import { z } from 'zod';
import Decimal from 'decimal.js';

const text = z.string().trim();
const note = text.max(500).default('');
export const presentationSchema = z.enum(['box', 'half_box', 'blister']);
export const priceBasisSchema = z.enum(['usd_cash_promo', 'ves_regular']);
export type Presentation = z.infer<typeof presentationSchema>;
export type PriceBasis = z.infer<typeof priceBasisSchema>;
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
    currency: z.enum(['USD', 'VES']),
    amount: paymentAmountSchema,
    method: text.min(2).max(80),
    receivedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
export const saleSchema = z
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
  );
export const paymentSchema = initialPaymentSchema
  .extend({
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
  lines: { quantity: number; agreedUnitUsd: string; referenceUnitUsd: string }[],
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
      new Decimal(line.referenceUnitUsd)
        .times(line.quantity)
        .toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
    );
  }
  return { totalUsd: total.toFixed(2), discountUsd: reference.sub(total).toFixed(2) };
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
  costUsd: string;
};
export type SaleLine = {
  id: string;
  variantId: string;
  configurationId: string;
  description: string;
  presentation: Presentation;
  quantity: number;
  priceBasis: PriceBasis;
  referenceUnitUsd: string;
  agreedUnitUsd: string;
  totalUsd: string;
  costUsd: string;
  allocations: SaleAllocation[];
};
export type SaleSummary = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  condition: 'cash' | 'credit';
  status: 'confirmed' | 'cancelled';
  soldAt: string;
  dueDate: string | null;
  reminderDate: string | null;
  originalDueDate: string | null;
  totalUsd: string;
  paidUsd: string;
  balanceUsd: string;
  costUsd: string;
  grossProfitUsd: string;
  discountUsd: string;
  isDemo: boolean;
  dueStatus: ReturnType<typeof receivableStatus>;
};
export type PaymentSummary = {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  currency: 'USD' | 'VES';
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
