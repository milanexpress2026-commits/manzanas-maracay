import { z } from 'zod';
import Decimal from 'decimal.js';
import {
  CATALOG_TEMPLATES,
  catalogNameKey,
  suggestedBlistersPerBox,
  type CatalogTemplate,
} from './catalog-preparation';
import {
  validPacking,
  confirmedPresentationsReady,
  type Catalog,
  type Configuration,
  type PackingModel,
  type HalfPreparation,
  type Presentation,
} from './index';

export const HABITUAL_CATALOG_VERSION = 'v4.2' as const;
export const habitualTemplateIdSchema = z.enum([
  'apple_traditional',
  'apple_bulk',
  'pear',
  'kiwi',
  'grape',
  'mandarin',
  'plum',
  'nectarine',
  'orange',
]);
export const habitualProductSchema = z
  .object({
    templateId: habitualTemplateIdSchema,
    templateVersion: z.literal(HABITUAL_CATALOG_VERSION),
    varietyName: z.string().trim().min(2).max(80).nullable().optional(),
    caliberLabel: z.string().trim().min(1).max(30).nullable().optional(),
  })
  .strict();
export const receiptProductSchema = z.union([
  z
    .object({ configurationId: z.uuid(), expectedPackingVersion: z.number().int().positive() })
    .strict(),
  habitualProductSchema,
]);
export type ReceiptProduct = z.infer<typeof receiptProductSchema>;
export type HabitualProduct = z.infer<typeof habitualProductSchema>;
export type ReceiptPacking = {
  packingModel: PackingModel;
  halfPreparation: HalfPreparation;
  allowedPresentations: Presentation[];
  blistersPerBox: number | null;
  boxWeightKg: string | null;
};
export function configurationPacking(configuration: Configuration): ReceiptPacking {
  return {
    packingModel: configuration.packingModel,
    halfPreparation: configuration.halfPreparation,
    allowedPresentations: [...configuration.allowedPresentations],
    blistersPerBox: configuration.blistersPerBox,
    boxWeightKg: configuration.boxWeightKg,
  };
}
export function habitualPacking(
  template: CatalogTemplate,
  variety: string | null,
  caliber: string | null,
): ReceiptPacking | null {
  if (!template.packing) return null;
  const { packingModel, halfPreparation, allowedPresentations, blistersPerBox, boxWeightKg } =
    template.packing;
  if (packingModel === 'blister') {
    const count = suggestedBlistersPerBox(
      template.fruitName,
      variety,
      caliber,
      template.commercialLine,
      packingModel,
    );
    return {
      packingModel,
      halfPreparation: 'pending',
      allowedPresentations: count ? ['box', 'blister'] : ['box'],
      blistersPerBox: count,
      boxWeightKg: null,
    };
  }
  return {
    packingModel,
    halfPreparation,
    allowedPresentations: [...allowedPresentations],
    blistersPerBox,
    boxWeightKg,
  };
}
export function habitualOptionKey(
  templateId: string,
  variety: string | null,
  caliber: string | null,
) {
  return [templateId, variety && catalogNameKey(variety), caliber && catalogNameKey(caliber)]
    .map((part) => encodeURIComponent(part ?? ''))
    .join('/');
}
/** Known-family constraints apply to new/pending quick receipts. Historical
 * confirmed configurations are only flagged for review, never rewritten here. */
export function habitualPackingIssue(
  template: CatalogTemplate,
  variety: string | null,
  caliber: string | null,
  selected: ReceiptPacking,
): string | null {
  const suggested = habitualPacking(template, variety, caliber);
  if (!suggested) return null;
  const issue = `El empaque habitual de ${template.fruitName} no corresponde a estas presentaciones o peso. Revisa la recepción.`;
  if (selected.packingModel !== suggested.packingModel) return issue;
  const sameWeight =
    suggested.boxWeightKg === null
      ? selected.boxWeightKg === null
      : selected.boxWeightKg !== null &&
        new Decimal(selected.boxWeightKg).eq(suggested.boxWeightKg);
  if (
    !sameWeight ||
    !validPacking(selected) ||
    !confirmedPresentationsReady({ ...selected, confirmationStatus: 'confirmed' })
  )
    return issue;
  if (suggested.packingModel !== 'blister') {
    return selected.halfPreparation === suggested.halfPreparation &&
      selected.blistersPerBox === null &&
      [...selected.allowedPresentations].sort().join(',') ===
        [...suggested.allowedPresentations].sort().join(',')
      ? null
      : issue;
  }
  // Pera has no inferred blister count. Its optional blister/half capabilities
  // are accepted only with an explicit reviewed count/preparation (above).
  if (suggested.blistersPerBox !== null && selected.blistersPerBox !== suggested.blistersPerBox)
    return 'Conserva el conteo habitual y confirma el cambio como excepción de este lote.';
  return null;
}
export type HabitualCatalogOption = {
  optionKey: string;
  label: string;
  templateId: CatalogTemplate['id'] | null;
  fruitName: string;
  varietyName: string | null;
  caliberLabel: string | null;
  commercialLine: string;
  product: ReceiptProduct;
  configurationId: string | null;
  packingVersion: number | null;
  confirmationStatus: Configuration['confirmationStatus'] | null;
  suggestedPacking: ReceiptPacking | null;
  currentPacking: ReceiptPacking | null;
  needsPresentation: boolean;
  packingDiscrepancy: boolean;
};
export type HabitualCatalogOptions = {
  templateVersion: typeof HABITUAL_CATALOG_VERSION;
  groups: { id: string; label: string; options: HabitualCatalogOption[] }[];
  options: HabitualCatalogOption[];
};
export type PreviousReceiptCost = { sourceLotId: string; unitCostUsd: string; receivedAt: string };
export type ReceiptOptions = { configurationId: string; previousCost: PreviousReceiptCost | null };

/** Read-only virtual choices: no price, quantity or database identity is invented. */
export function buildHabitualCatalogOptions(catalog: Catalog): HabitualCatalogOptions {
  const seen = new Set<string>();
  const groups: HabitualCatalogOptions['groups'] = CATALOG_TEMPLATES.map((template) => {
    const fruit = catalog.fruits.find(
      (row) => catalogNameKey(row.name) === catalogNameKey(template.fruitName),
    );
    const knownFruitCalibers = new Set(
      CATALOG_TEMPLATES.filter((t) => t.fruitName === template.fruitName).flatMap(
        (t) => t.calibers,
      ),
    );
    const varieties: (string | null)[] = template.requiresVariety
      ? [
          ...new Map(
            [
              ...template.varieties,
              ...catalog.varieties.filter((v) => v.fruitId === fruit?.id).map((v) => v.name),
            ].map((v) => [catalogNameKey(v), v]),
          ).values(),
        ]
      : [null];
    const calibers: (string | null)[] = template.requiresCaliber
      ? [
          ...new Set([
            ...template.calibers,
            ...catalog.calibers
              .filter((c) => c.fruitId === fruit?.id && !knownFruitCalibers.has(c.label))
              .map((c) => c.label),
          ]),
        ]
      : [null];
    const options = varieties.flatMap((varietyName) =>
      calibers.map((caliberLabel): HabitualCatalogOption => {
        const existing = catalog.configurations.find(
          (c) =>
            c.fruitId === fruit?.id &&
            catalogNameKey(c.variety ?? '') === catalogNameKey(varietyName ?? '') &&
            catalogNameKey(c.caliber ?? '') === catalogNameKey(caliberLabel ?? '') &&
            c.commercialLine === (template.commercialLine || 'Estándar'),
        );
        if (existing) seen.add(existing.id);
        const suggestedPacking = habitualPacking(template, varietyName, caliberLabel);
        return {
          optionKey: habitualOptionKey(template.id, varietyName, caliberLabel),
          label: [
            template.fruitName,
            varietyName,
            caliberLabel,
            template.id === 'apple_bulk' ? 'Granel' : null,
          ]
            .filter(Boolean)
            .join(' · '),
          templateId: template.id,
          fruitName: template.fruitName,
          varietyName,
          caliberLabel,
          commercialLine: template.commercialLine || 'Estándar',
          product: existing
            ? { configurationId: existing.id, expectedPackingVersion: existing.version }
            : {
                templateId: template.id,
                templateVersion: HABITUAL_CATALOG_VERSION,
                varietyName,
                caliberLabel,
              },
          configurationId: existing?.id ?? null,
          packingVersion: existing?.version ?? null,
          confirmationStatus: existing?.confirmationStatus ?? null,
          suggestedPacking,
          currentPacking: existing ? configurationPacking(existing) : null,
          needsPresentation: !suggestedPacking && existing?.confirmationStatus !== 'confirmed',
          packingDiscrepancy:
            existing?.confirmationStatus === 'confirmed' &&
            habitualPackingIssue(
              template,
              varietyName,
              caliberLabel,
              configurationPacking(existing),
            ) !== null,
        };
      }),
    );
    return {
      id: template.id,
      label: template.id === 'apple_bulk' ? 'Manzana a granel' : template.fruitName,
      options,
    };
  });
  const additional = catalog.configurations
    .filter((c) => !seen.has(c.id))
    .map((c): HabitualCatalogOption => ({
      optionKey: `configuration/${c.id}`,
      label: [c.fruit, c.variety, c.caliber, c.commercialLine].filter(Boolean).join(' · '),
      templateId: null,
      fruitName: c.fruit,
      varietyName: c.variety,
      caliberLabel: c.caliber,
      commercialLine: c.commercialLine,
      product: { configurationId: c.id, expectedPackingVersion: c.version },
      configurationId: c.id,
      packingVersion: c.version,
      confirmationStatus: c.confirmationStatus,
      currentPacking: configurationPacking(c),
      suggestedPacking: null,
      needsPresentation: c.confirmationStatus !== 'confirmed',
      packingDiscrepancy: false,
    }));
  if (additional.length)
    groups.push({ id: 'existing', label: 'Otros productos registrados', options: additional });
  return {
    templateVersion: HABITUAL_CATALOG_VERSION,
    groups,
    options: groups.flatMap((g) => g.options),
  };
}
