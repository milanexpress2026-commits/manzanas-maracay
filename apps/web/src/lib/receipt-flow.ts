import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  simpleReceiptSchema,
  receiptProductSchema,
  type HabitualCatalogOption,
  type ReceiptPacking,
  type Configuration,
  type SimpleReceipt,
} from '@mm/domain';
import { caracasInstant } from './commercial-ui';
import type { PendingReceipt } from './receipt-storage';

export type PickerOption = {
  optionKey: string;
  label: string;
  fruit: string;
  description: string;
  configurationId: string | null;
  needsPresentation: boolean;
};

const packing = z.object({
  packingModel: z.enum(['blister', 'halves', 'whole']),
  halfPreparation: z.enum(['pending', 'none', 'counted', 'commercial']),
  allowedPresentations: z.array(z.enum(['box', 'half_box', 'blister'])).max(3),
  blistersPerBox: z.number().int().min(1).max(100).nullable(),
  boxWeightKg: z.string().max(30).nullable(),
  commercialUnitLabel: z.string().max(80).nullable().optional(),
});
const lineSchema = z.object({
  key: z.uuid(),
  optionKey: z.string().max(400),
  product: receiptProductSchema,
  selectionPacking: packing.nullable(),
  boxes: z.string().max(8),
  packing: packing.nullable(),
  packingChanged: z.boolean(),
  packingConfirmed: z.boolean(),
  discrepancyAccepted: z.boolean(),
  blisterOverride: z.string().max(3),
  overrideReason: z.string().max(500),
  overrideConfirmed: z.boolean(),
  notes: z.string().max(500),
});
export type QuickLine = z.infer<typeof lineSchema>;
const currentReceiptDraftSchema = z.object({
  version: z.literal(3),
  scope: z.string().max(150),
  supplierId: z.string().max(36),
  reference: z.string().max(80),
  date: z.string().max(30),
  notes: z.string().max(500),
  lines: z.array(lineSchema).max(50),
  pending: z
    .object({
      key: z.uuid(),
      body: z.string().max(65536),
      hash: z.string().regex(/^[a-f0-9]{64}$/),
    })
    .nullable(),
});
// Upgrade only editable local fields; an uncertain legacy command retains its exact body/key/hash.
export const receiptDraftSchema = z.preprocess((value) => {
  if (value && typeof value === 'object' && 'version' in value && value.version === 2)
    return { ...value, version: 3 };
  return value;
}, currentReceiptDraftSchema);
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
export function emptyReceiptDraft(scope: string): ReceiptDraft {
  return {
    version: 3,
    scope,
    supplierId: '',
    reference: '',
    date: '',
    notes: '',
    lines: [],
    pending: null,
  };
}
export function pickerOptions(options: HabitualCatalogOption[]): PickerOption[] {
  return options.map((option) => ({
    optionKey: option.optionKey,
    label: option.label,
    fruit: option.fruitName,
    configurationId: option.configurationId,
    needsPresentation: option.needsPresentation,
    description:
      option.currentPacking?.commercialUnitLabel && option.confirmationStatus === 'confirmed'
        ? option.currentPacking.commercialUnitLabel
        : option.requiresCommercialUnit
          ? 'Confirmar unidad comercial'
          : option.currentPacking?.blistersPerBox != null &&
              option.confirmationStatus === 'confirmed'
            ? `${option.currentPacking.blistersPerBox} blíster por caja · ${option.commercialLine}`
            : option.suggestedPacking?.blistersPerBox != null
              ? `${option.suggestedPacking.blistersPerBox} blíster por caja · ${option.commercialLine}`
              : option.suggestedPacking?.boxWeightKg
                ? `Caja ${new Decimal(option.suggestedPacking.boxWeightKg).toString()} kg · media comercial`
                : option.suggestedPacking?.packingModel === 'halves'
                  ? 'Caja y media caja comercial'
                  : option.suggestedPacking
                    ? 'Caja completa'
                    : option.commercialLine,
  }));
}
export function receiptLine(
  option: HabitualCatalogOption,
  _configuration?: Configuration,
): QuickLine {
  const initialPacking =
    option.confirmationStatus === 'confirmed'
      ? option.currentPacking
      : (option.suggestedPacking ?? option.currentPacking);
  return {
    key: crypto.randomUUID(),
    optionKey: option.optionKey,
    product: structuredClone(option.product),
    selectionPacking: initialPacking ? structuredClone(initialPacking) : null,
    boxes: '1',
    packing: initialPacking ? structuredClone(initialPacking) : null,
    packingChanged: false,
    packingConfirmed: false,
    discrepancyAccepted: false,
    blisterOverride: '',
    overrideReason: '',
    overrideConfirmed: false,
    notes: '',
  };
}
export function revisePacking(line: QuickLine, value: ReceiptPacking): QuickLine {
  return {
    ...line,
    packing: value,
    packingChanged: true,
    packingConfirmed: false,
  };
}
export function receiptOptionChanged(line: QuickLine, option: HabitualCatalogOption) {
  const currentPacking =
    option.confirmationStatus === 'confirmed'
      ? option.currentPacking
      : (option.suggestedPacking ?? option.currentPacking);
  return (
    JSON.stringify(line.product) !== JSON.stringify(option.product) ||
    JSON.stringify(line.selectionPacking) !== JSON.stringify(currentPacking)
  );
}
export function productSearchMatches(label: string, description: string, query: string) {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es');
  const haystack = normalize(`${label} ${description}`);
  return normalize(query)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}
export function buildQuickReceipt(
  draft: ReceiptDraft,
  options: HabitualCatalogOption[],
): SimpleReceipt {
  return simpleReceiptSchema.parse({
    schemaVersion: 3,
    supplierId: draft.supplierId || null,
    reference: draft.reference.trim() || null,
    ...(draft.date ? { receivedAt: caracasInstant(draft.date) } : {}),
    notes: draft.notes,
    lines: draft.lines.map((line, index) => {
      const option = options.find((item) => item.optionKey === line.optionKey);
      if (!option)
        throw new Error(`Vuelve a elegir el producto ${index + 1}; sus opciones cambiaron.`);
      if (receiptOptionChanged(line, option))
        throw new Error(
          `El empaque del producto ${index + 1} cambió. Vuelve a elegirlo para revisar la versión actual; se conservará la cantidad.`,
        );
      if (
        (option.needsPresentation || line.packingChanged) &&
        (!line.packing || !line.packingConfirmed)
      )
        throw new Error(`Confirma la presentación del producto ${index + 1} antes de continuar.`);
      if (option.packingDiscrepancy && !line.discrepancyAccepted && !line.overrideConfirmed)
        throw new Error(
          `Revisa el empaque distinto del producto ${index + 1}; los lotes anteriores se conservan.`,
        );
      if (line.blisterOverride && !line.overrideConfirmed)
        throw new Error(`Confirma la excepción del producto ${index + 1}.`);
      if (option.requiresCommercialUnit && !line.packing?.commercialUnitLabel?.trim())
        throw new Error(`Indica la unidad comercial del producto ${index + 1}.`);
      const usePacking =
        line.packing &&
        (line.packingChanged ||
          option.needsPresentation ||
          option.confirmationStatus === 'pending');
      return {
        product: line.product,
        boxes: Number(line.boxes),
        ...(usePacking
          ? {
              packing: {
                ...line.packing,
                boxWeightKg: line.packing?.boxWeightKg?.replace(',', '.') ?? null,
                confirmed: true,
              },
            }
          : {}),
        ...(line.blisterOverride
          ? {
              blisterOverride: {
                blistersPerBox: Number(line.blisterOverride),
                confirmed: true,
                reason: line.overrideReason,
              },
            }
          : {}),
        notes: line.notes,
      };
    }),
  });
}
export function withPendingReceipt(
  draft: ReceiptDraft,
  pending: PendingReceipt | null,
): ReceiptDraft {
  return { ...draft, pending };
}
