import { z } from 'zod';
import Decimal from 'decimal.js';
import { receiptProductSchema } from './catalog-options';
import {
  packingFields,
  validPacking,
  confirmedPresentationsReady,
  type PackingModel,
  type HalfPreparation,
  type Presentation,
} from './index';

const text = z.string().trim();
const optionalText = (max: number) => text.max(max).default('');
export const reasonSchema = text.min(5, 'Explica el motivo con al menos 5 caracteres.').max(500);
export const supplierSchema = z
  .object({
    name: text.min(2).max(120),
    taxId: optionalText(40),
    phone: optionalText(40),
    notes: optionalText(500),
  })
  .strict();
export const updateSupplierSchema = supplierSchema
  .extend({ active: z.boolean(), version: z.number().int().positive() })
  .strict();
export const costSchema = text
  .regex(/^\d{1,14}(\.\d{1,4})?$/, 'Usa un costo USD positivo, con hasta 4 decimales.')
  .transform((value) => new Decimal(value).toFixed(4));
export const receiptPackingConfirmationSchema = z.lazy(() =>
  z
    .object({
      expectedVersion: z.number().int().positive(),
      confirmed: z.literal(true),
      packingModel: z.enum(['blister', 'halves', 'whole']),
      halfPreparation: z.enum(['counted', 'commercial', 'pending', 'none']),
      allowedPresentations: z
        .array(z.enum(['box', 'half_box', 'blister']))
        .min(1)
        .max(3),
      blistersPerBox: z.number().int().min(1).max(100).nullable(),
      boxWeightKg: packingFields.boxWeightKg,
    })
    .strict()
    .refine(validPacking, 'Revisa el empaque que estás confirmando.')
    .refine(
      (value) => confirmedPresentationsReady({ ...value, confirmationStatus: 'confirmed' }),
      'Confirma solo presentaciones con cantidad de blíster y preparación de media conocidas.',
    ),
);
export type ReceiptPackingConfirmation = z.infer<typeof receiptPackingConfirmationSchema>;
export const receiptSchema = z
  .object({
    supplierId: z.uuid(),
    reference: text.min(1).max(80),
    receivedAt: z.iso.datetime({ offset: true }),
    notes: optionalText(500),
    isDemo: z.boolean().default(false),
    lines: z
      .array(
        z
          .object({
            configurationId: z.uuid(),
            boxes: z.number().int().min(1).max(1000),
            unitCostUsd: costSchema,
            blistersPerBox: z.number().int().min(1).max(100).optional(),
            packingConfirmation: receiptPackingConfirmationSchema.optional(),
            priceAction: z.enum(['keep', 'update']).default('keep'),
            prices: z
              .array(
                z
                  .object({
                    presentation: z.enum(['box', 'half_box', 'blister']),
                    promoUsd: costSchema,
                    regularUsd: costSchema,
                  })
                  .strict(),
              )
              .max(3)
              .default([]),
            notes: optionalText(500),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .superRefine((value, ctx) => {
    const confirmations = new Map<string, string>();
    for (const line of value.lines) {
      const confirmation = line.packingConfirmation;
      if (!confirmation) continue;
      const hash = JSON.stringify(confirmation);
      if (
        confirmations.has(line.configurationId) &&
        confirmations.get(line.configurationId) !== hash
      )
        ctx.addIssue({
          code: 'custom',
          message:
            'Dos líneas confirman empaques distintos del mismo producto. Unifica la revisión.',
        });
      confirmations.set(line.configurationId, hash);
      if (line.blistersPerBox !== undefined && line.blistersPerBox !== confirmation.blistersPerBox)
        ctx.addIssue({
          code: 'custom',
          message: 'La cantidad del lote debe coincidir con el empaque que estás confirmando.',
        });
    }
  })
  .refine(
    (value) => value.lines.reduce((total, line) => total + line.boxes, 0) <= 1000,
    'Una recepción admite hasta 1.000 cajas; divide las recepciones mayores.',
  );
// The V4 parser above stays byte-for-byte compatible with historical command hashes.
export const positiveReceiptCostSchema = costSchema.refine(
  (value) => new Decimal(value).gt(0),
  'Indica el costo real por caja, mayor que cero.',
);
export const reviewedReceiptPackingSchema = z.lazy(() =>
  z
    .object({
      confirmed: z.literal(true),
      packingModel: packingFields.packingModel,
      halfPreparation: packingFields.halfPreparation,
      allowedPresentations: packingFields.allowedPresentations,
      blistersPerBox: packingFields.blistersPerBox,
      boxWeightKg: packingFields.boxWeightKg,
    })
    .strict()
    .refine(validPacking, 'Revisa el empaque confirmado.')
    .refine(
      (value) => confirmedPresentationsReady({ ...value, confirmationStatus: 'confirmed' }),
      'Confirma únicamente presentaciones con preparación conocida.',
    ),
);
export const receiptCostConfirmationSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('entered'),
      unitCostUsd: positiveReceiptCostSchema,
      accepted: z.literal(true),
    })
    .strict(),
  z
    .object({
      kind: z.literal('previous'),
      sourceLotId: z.uuid(),
      unitCostUsd: positiveReceiptCostSchema,
      accepted: z.literal(true),
    })
    .strict(),
]);
export const quickReceiptSchema = z
  .object({
    schemaVersion: z.literal(2),
    supplierId: z.uuid().nullable().default(null),
    reference: text.min(1).max(80).nullable().default(null),
    receivedAt: z.iso.datetime({ offset: true }).optional(),
    notes: optionalText(500),
    isDemo: z.boolean().default(false),
    lines: z
      .array(
        z
          .object({
            product: receiptProductSchema,
            boxes: z.number().int().min(1).max(1000),
            cost: receiptCostConfirmationSchema,
            // Required only for an unknown presentation or an explicitly reviewed pending configuration.
            packing: reviewedReceiptPackingSchema.optional(),
            blisterOverride: z
              .object({
                blistersPerBox: z.number().int().min(1).max(100),
                confirmed: z.literal(true),
                reason: reasonSchema,
              })
              .strict()
              .optional(),
            priceAction: z.enum(['keep', 'update']).default('keep'),
            prices: z
              .array(
                z
                  .object({
                    presentation: z.enum(['box', 'half_box', 'blister']),
                    promoUsd: costSchema,
                    regularUsd: costSchema,
                  })
                  .strict(),
              )
              .max(3)
              .default([]),
            notes: optionalText(500),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) => value.lines.reduce((sum, line) => sum + line.boxes, 0) <= 1000,
    'Una recepción admite hasta 1.000 cajas; divide las recepciones mayores.',
  );
export type QuickReceipt = z.infer<typeof quickReceiptSchema>;
export type QuickReceiptInput = z.input<typeof quickReceiptSchema>;
// New operations do not collect cost or change price lists. Keep the older
// parsers unchanged: their normalized payload is part of committed replay hashes.
export const simpleReceiptPackingSchema = z.lazy(() =>
  z
    .object({
      confirmed: z.literal(true),
      packingModel: packingFields.packingModel,
      halfPreparation: packingFields.halfPreparation,
      allowedPresentations: packingFields.allowedPresentations,
      blistersPerBox: packingFields.blistersPerBox,
      boxWeightKg: packingFields.boxWeightKg,
      commercialUnitLabel: text.min(1).max(80).nullable().optional(),
    })
    .strict()
    .refine(validPacking, 'Revisa el empaque confirmado.')
    .refine(
      (value) => confirmedPresentationsReady({ ...value, confirmationStatus: 'confirmed' }),
      'Confirma únicamente presentaciones con preparación conocida.',
    )
    .refine(
      (value) =>
        !value.commercialUnitLabel ||
        (value.packingModel === 'whole' && value.boxWeightKg === null),
      'La unidad comercial indicada debe ser indivisible y sin peso inferido.',
    ),
);
export const simpleReceiptSchema = z
  .object({
    schemaVersion: z.literal(3),
    supplierId: z.uuid().nullable().default(null),
    reference: text.min(1).max(80).nullable().default(null),
    receivedAt: z.iso.datetime({ offset: true }).optional(),
    notes: optionalText(500),
    isDemo: z.boolean().default(false),
    lines: z
      .array(
        z
          .object({
            product: receiptProductSchema,
            boxes: z.number().int().min(1).max(1000),
            packing: simpleReceiptPackingSchema.optional(),
            blisterOverride: z
              .object({
                blistersPerBox: z.number().int().min(1).max(100),
                confirmed: z.literal(true),
                reason: reasonSchema,
              })
              .strict()
              .optional(),
            notes: optionalText(500),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) => value.lines.reduce((sum, line) => sum + line.boxes, 0) <= 1000,
    'Una recepción admite hasta 1.000 unidades comerciales; divide las recepciones mayores.',
  );
export type SimpleReceipt = z.infer<typeof simpleReceiptSchema>;
export type SimpleReceiptInput = z.input<typeof simpleReceiptSchema>;
export function formatReceiptNumber(value: string | bigint): string {
  const number = String(value);
  if (!/^[1-9]\d*$/.test(number)) throw new Error('Número interno de recepción inválido.');
  return `R-${number.padStart(8, '0')}`;
}

export const openBoxSchema = z.object({ containerId: z.uuid(), reason: reasonSchema }).strict();
export const withdrawBlistersSchema = z
  .object({ quantity: z.number().int().min(1).max(1000), reason: reasonSchema })
  .strict();
export const openBlisterSchema = openBoxSchema
  .extend({ countedPieces: z.number().int().min(1).max(100000) })
  .strict();
export const prepareHalfSchema = openBoxSchema
  .extend({
    countedBefore: z.number().int().min(1).max(100000),
    preparedPieces: z.number().int().min(1).max(100000),
    remainingPieces: z.number().int().min(0).max(100000),
  })
  .strict()
  .refine(
    (value) => value.preparedPieces + value.remainingPieces === value.countedBefore,
    'El conteo debe coincidir: piezas preparadas + restantes = piezas contadas.',
  );
export const adjustmentSchema = openBoxSchema
  .extend({
    quantityDelta: z.number().int().min(-100000).max(100000),
    piecesDelta: z.number().int().min(-100000).max(100000).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => value.quantityDelta !== 0 || (value.piecesDelta ?? 0) !== 0,
    'Indica un cambio distinto de cero.',
  );
export const reversalSchema = z.object({ reason: reasonSchema }).strict();
export const inventoryFilterSchema = z
  .object({
    fruitId: z.uuid().optional(),
    varietyId: z.uuid().optional(),
    caliberId: z.uuid().optional(),
    lotId: z.uuid().optional(),
    state: z.enum(['sealed', 'open', 'empty', 'dispatched']).optional(),
  })
  .strict();

export type Supplier = {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  notes: string;
  active: boolean;
  version: number;
};
export type ContainerKind = 'box' | 'blister' | 'half_box' | 'loose_bin';
export type ContainerState = 'sealed' | 'open' | 'empty' | 'dispatched';
export type StockUnit = 'sealed_box' | 'intact_blister' | 'prepared_half_box' | 'loose_piece';
export type ContainerStock = {
  id: string;
  lotId: string;
  warehouseId: string;
  parentId: string | null;
  kind: ContainerKind;
  state: ContainerState;
  unit: StockUnit;
  quantity: number;
  countedPieces: number | null;
  version: number;
  costUsd?: string | null;
};
export type StockSummary = {
  closedBoxes: number;
  openBoxes: number;
  intactBlisters: number;
  openBlisters: number;
  preparedHalfBoxes: number;
  preparedPieces: number;
  loosePieces: number;
  equivalentIntactBlisters: number;
  equivalentBoxes: number;
};
export type LotSummary = StockSummary & {
  id: string;
  code: string;
  configurationId: string;
  fruitId: string;
  varietyId: string | null;
  caliberId: string | null;
  fruit: string;
  variety: string | null;
  caliber: string | null;
  commercialLine: string;
  supplierId: string | null;
  supplier: string | null;
  receivedAt: string;
  receivedBoxes: number;
  blistersPerBox: number | null;
  packingModel: PackingModel;
  halfPreparation: HalfPreparation;
  allowedPresentations: Presentation[];
  boxWeightKgSnapshot: string | null;
  unitCostUsd: string | null;
  commercialUnitLabel: string | null;
  notes: string;
  isDemo: boolean;
  version: number;
};
export type InventoryEntry = {
  id: string;
  containerId: string;
  unit: StockUnit;
  quantityDelta: number;
  piecesDelta: number | null;
};
export type InventoryMovement = {
  id: string;
  lotId: string;
  kind:
    | 'receipt'
    | 'dispatch'
    | 'open_box'
    | 'open_blister'
    | 'fraction'
    | 'commercial_split'
    | 'adjustment'
    | 'transfer'
    | 'reversal';
  reason: string;
  actor: string;
  createdAt: string;
  reversalOf: string | null;
  reversedBy: string | null;
  countedBefore: number | null;
  preparedPieces: number | null;
  remainingPieces: number | null;
  entries: InventoryEntry[];
};
export type InventoryOverview = {
  warehouse: { id: string; name: string };
  lots: LotSummary[];
  totals: StockSummary;
};
export type LotDetail = {
  lot: LotSummary;
  containers: ContainerStock[];
  movements: InventoryMovement[];
};
export type InventoryCommandResult = {
  movementId: string;
  lotId: string;
  usedContainers?: { id: string; quantity: number }[];
};
export type ReceiptResult = {
  purchaseId: string;
  receiptNumber?: string;
  receivedAt?: string;
  movementId: string;
  lots: { id: string; code: string; movementId: string }[];
};
export function emptyStockSummary(): StockSummary {
  return {
    closedBoxes: 0,
    openBoxes: 0,
    intactBlisters: 0,
    openBlisters: 0,
    preparedHalfBoxes: 0,
    preparedPieces: 0,
    loosePieces: 0,
    equivalentIntactBlisters: 0,
    equivalentBoxes: 0,
  };
}
export function summarizeContainers(
  containers: ContainerStock[],
  blistersPerBox: number | null,
  packingModel: PackingModel = 'blister',
): StockSummary {
  const total = emptyStockSummary();
  for (const container of containers) {
    if (
      container.state === 'open' &&
      container.kind === 'box' &&
      containers.some((child) => child.parentId === container.id && child.quantity > 0)
    )
      total.openBoxes++;
    if (container.state === 'open' && container.kind === 'blister' && container.quantity > 0)
      total.openBlisters++;
    if (container.quantity <= 0 || container.state === 'empty' || container.state === 'dispatched')
      continue;
    if (container.unit === 'sealed_box') total.closedBoxes += container.quantity;
    if (container.unit === 'intact_blister') total.intactBlisters += container.quantity;
    if (container.unit === 'loose_piece') total.loosePieces += container.quantity;
    if (container.unit === 'prepared_half_box') {
      total.preparedHalfBoxes += container.quantity;
      total.preparedPieces += container.countedPieces ?? 0;
    }
  }
  total.equivalentIntactBlisters = total.closedBoxes * (blistersPerBox ?? 0) + total.intactBlisters;
  // Counted fruit/halves do not have an invented equivalence to sealed boxes.
  total.equivalentBoxes =
    total.closedBoxes +
    (packingModel === 'halves' ? total.preparedHalfBoxes / 2 : 0) +
    (packingModel === 'blister' && blistersPerBox ? total.intactBlisters / blistersPerBox : 0);
  return total;
}
