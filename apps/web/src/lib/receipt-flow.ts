import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  quickReceiptSchema,
  receiptProductSchema,
  positiveReceiptCostSchema,
  type HabitualCatalogOption,
  type ReceiptPacking,
  type PreviousReceiptCost,
  type Configuration,
  type QuickReceipt,
} from '@mm/domain';
import { normalizedMoney, caracasInstant } from './commercial-ui';
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
});
const previous = z.object({
  sourceLotId: z.uuid(),
  unitCostUsd: z.string().max(30),
  receivedAt: z.string().max(50),
});
const lineSchema = z.object({
  key: z.uuid(),
  optionKey: z.string().max(400),
  product: receiptProductSchema,
  selectionPacking: packing.nullable(),
  boxes: z.string().max(8),
  cost: z.string().max(30),
  costSource: z.enum(['entered', 'previous']),
  previousCost: previous.nullable(),
  packing: packing.nullable(),
  packingChanged: z.boolean(),
  packingConfirmed: z.boolean(),
  discrepancyAccepted: z.boolean(),
  blisterOverride: z.string().max(3),
  overrideReason: z.string().max(500),
  overrideConfirmed: z.boolean(),
  notes: z.string().max(500),
  priceAction: z.enum(['keep', 'update']),
  prices: z
    .array(
      z.object({
        presentation: z.enum(['box', 'half_box', 'blister']),
        promoUsd: z.string().max(30),
        regularUsd: z.string().max(30),
      }),
    )
    .max(3),
});
export type QuickLine = z.infer<typeof lineSchema>;
export const receiptDraftSchema = z.object({
  version: z.literal(2),
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
export type ReceiptDraft = z.infer<typeof receiptDraftSchema>;
export function emptyReceiptDraft(scope: string): ReceiptDraft {
  return {
    version: 2,
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
      option.currentPacking?.blistersPerBox != null && option.confirmationStatus === 'confirmed'
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
  configuration?: Configuration,
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
    cost: '',
    costSource: 'entered',
    previousCost: null,
    packing: initialPacking ? structuredClone(initialPacking) : null,
    packingChanged: false,
    packingConfirmed: false,
    discrepancyAccepted: false,
    blisterOverride: '',
    overrideReason: '',
    overrideConfirmed: false,
    notes: '',
    priceAction: 'keep',
    prices: (initialPacking?.allowedPresentations ?? ['box']).map((presentation) => ({
      presentation,
      promoUsd:
        configuration?.prices.find((price) => price.presentation === presentation)?.promoUsd ?? '',
      regularUsd:
        configuration?.prices.find((price) => price.presentation === presentation)?.regularUsd ??
        '',
    })),
  };
}
export function revisePacking(line: QuickLine, value: ReceiptPacking): QuickLine {
  return {
    ...line,
    packing: value,
    packingChanged: true,
    packingConfirmed: false,
    prices: value.allowedPresentations.map(
      (presentation) =>
        line.prices.find((price) => price.presentation === presentation) ?? {
          presentation,
          promoUsd: '',
          regularUsd: '',
        },
    ),
  };
}
export function acceptPreviousCost(line: QuickLine, cost: PreviousReceiptCost): QuickLine {
  return { ...line, costSource: 'previous', cost: cost.unitCostUsd, previousCost: cost };
}
export function receiptTotal(lines: QuickLine[]) {
  return lines
    .reduce((total, line) => {
      const cost = normalizedMoney(line.cost);
      return /^\d+(\.\d{1,4})?$/.test(cost) && /^\d+$/.test(line.boxes)
        ? total.plus(new Decimal(cost).times(line.boxes))
        : total;
    }, new Decimal(0))
    .toFixed(4);
}
export function receiptCostsReady(lines: QuickLine[]) {
  return (
    lines.length > 0 &&
    lines.every((line) => positiveReceiptCostSchema.safeParse(normalizedMoney(line.cost)).success)
  );
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
): QuickReceipt {
  return quickReceiptSchema.parse({
    schemaVersion: 2,
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
          `El empaque del producto ${index + 1} cambió. Vuelve a elegirlo para revisar la versión actual; tus cajas y costo se conservarán.`,
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
      const usePacking =
        line.packing &&
        (line.packingChanged ||
          option.needsPresentation ||
          option.confirmationStatus === 'pending');
      return {
        product: line.product,
        boxes: Number(line.boxes),
        cost:
          line.costSource === 'previous' && line.previousCost
            ? {
                kind: 'previous',
                sourceLotId: line.previousCost.sourceLotId,
                unitCostUsd: normalizedMoney(line.cost),
                accepted: true,
              }
            : { kind: 'entered', unitCostUsd: normalizedMoney(line.cost), accepted: true },
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
        priceAction: line.priceAction,
        prices:
          line.priceAction === 'update'
            ? line.prices
                .filter((price) => price.promoUsd.trim() || price.regularUsd.trim())
                .map((price) => ({
                  presentation: price.presentation,
                  promoUsd: normalizedMoney(price.promoUsd),
                  regularUsd: normalizedMoney(price.regularUsd),
                }))
            : [],
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
