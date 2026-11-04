import { z } from 'zod';
import Decimal from 'decimal.js';

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
            notes: optionalText(500),
          })
          .strict(),
      )
      .min(1)
      .max(50),
  })
  .strict()
  .refine(
    (value) => value.lines.reduce((total, line) => total + line.boxes, 0) <= 1000,
    'Una recepción admite hasta 1.000 cajas; divide las recepciones mayores.',
  );
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
};
export type LotSummary = StockSummary & {
  id: string;
  code: string;
  configurationId: string;
  fruitId: string;
  varietyId: string;
  caliberId: string;
  fruit: string;
  variety: string;
  caliber: string;
  supplierId: string;
  supplier: string;
  receivedAt: string;
  receivedBoxes: number;
  blistersPerBox: number;
  unitCostUsd: string;
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
  };
}
export function summarizeContainers(
  containers: ContainerStock[],
  blistersPerBox: number,
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
  total.equivalentIntactBlisters = total.closedBoxes * blistersPerBox + total.intactBlisters;
  return total;
}
