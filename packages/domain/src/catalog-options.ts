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

export const HABITUAL_CATALOG_VERSION = 'v4.5' as const;
export type HabitualCatalogVersion = 'v4.2' | 'v4.5';
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
  'raisins',
  'capers',
  'stuffed_olives',
  'olives_with_stone',
]);
export type HabitualTemplate = Omit<CatalogTemplate, 'id'> & {
  id: z.infer<typeof habitualTemplateIdSchema>;
  templateVersion?: HabitualCatalogVersion;
  requiresCommercialUnit?: boolean;
};
export const PEAR_FOUR_BLISTER_CALIBERS = ['70', '80', '90', '100', '110', '120', '125'] as const;
export const PEAR_FIVE_BLISTER_CALIBERS = ['135', '150', '165'] as const;
export const HABITUAL_TEMPLATES_V45: readonly HabitualTemplate[] = [
  ...CATALOG_TEMPLATES.map((legacy): HabitualTemplate => {
    const template = { ...structuredClone(legacy), templateVersion: HABITUAL_CATALOG_VERSION };
    if (template.id === 'apple_bulk')
      return {
        ...template,
        commercialLine: 'A granel',
        varieties: ['Roja normal', 'Gala', 'Verde'],
        requiresVariety: true,
        calibers: ['150', '163', '175', '198', '216', '232', '235', 'PC'],
      };
    if (template.id === 'pear')
      return {
        ...template,
        varieties: ['Forelle', 'Packham'],
        calibers: [...PEAR_FOUR_BLISTER_CALIBERS, ...PEAR_FIVE_BLISTER_CALIBERS],
        note: 'Conteo confirmado por calibre; la media caja necesita preparación confirmada.',
      };
    return template;
  }),
  ...(
    [
      ['raisins', 'Pasas'],
      ['capers', 'Alcaparras'],
      ['stuffed_olives', 'Aceituna rellena'],
      ['olives_with_stone', 'Aceituna con hueso'],
    ] as const
  ).map(([id, fruitName]): HabitualTemplate => ({
    id,
    fruitName,
    templateVersion: HABITUAL_CATALOG_VERSION,
    commercialLine: 'Unidad comercial',
    varieties: [],
    calibers: [],
    requiresVariety: false,
    requiresCaliber: false,
    packing: null,
    requiresCommercialUnit: true,
    note: 'Indica la unidad comercial recibida, sin inventar peso ni contenido.',
  })),
];
export function getHabitualTemplates(
  version: HabitualCatalogVersion = HABITUAL_CATALOG_VERSION,
): readonly HabitualTemplate[] {
  return version === 'v4.2' ? CATALOG_TEMPLATES : HABITUAL_TEMPLATES_V45;
}
export function getHabitualTemplate(
  id: string,
  version: HabitualCatalogVersion = HABITUAL_CATALOG_VERSION,
) {
  return getHabitualTemplates(version).find((template) => template.id === id);
}
export const habitualProductSchema = z
  .object({
    templateId: habitualTemplateIdSchema,
    templateVersion: z.enum(['v4.2', 'v4.5']),
    varietyName: z.string().trim().min(2).max(80).nullable().optional(),
    caliberLabel: z.string().trim().min(1).max(30).nullable().optional(),
  })
  .strict()
  .refine(
    (product) => !!getHabitualTemplate(product.templateId, product.templateVersion),
    'La plantilla no pertenece a esta versión del catálogo.',
  );
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
  commercialUnitLabel?: string | null;
};
export function configurationPacking(configuration: Configuration): ReceiptPacking {
  return {
    packingModel: configuration.packingModel,
    halfPreparation: configuration.halfPreparation,
    allowedPresentations: [...configuration.allowedPresentations],
    blistersPerBox: configuration.blistersPerBox,
    boxWeightKg: configuration.boxWeightKg,
    ...('commercialUnitLabel' in configuration
      ? { commercialUnitLabel: configuration.commercialUnitLabel as string | null }
      : {}),
  };
}
export function habitualPacking(
  template: HabitualTemplate,
  variety: string | null,
  caliber: string | null,
): ReceiptPacking | null {
  if (!template.packing) return null;
  const { packingModel, halfPreparation, allowedPresentations, blistersPerBox, boxWeightKg } =
    template.packing;
  if (packingModel === 'blister') {
    const count =
      template.id === 'pear' && template.templateVersion === 'v4.5'
        ? (PEAR_FOUR_BLISTER_CALIBERS as readonly string[]).includes(caliber ?? '')
          ? 4
          : (PEAR_FIVE_BLISTER_CALIBERS as readonly string[]).includes(caliber ?? '')
            ? 5
            : null
        : suggestedBlistersPerBox(
            template.fruitName,
            variety,
            caliber,
            template.commercialLine,
            packingModel,
          );
    return {
      packingModel,
      halfPreparation: count ? 'commercial' : 'pending',
      allowedPresentations: count ? ['box', 'half_box', 'blister'] : ['box'],
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
  template: HabitualTemplate,
  variety: string | null,
  caliber: string | null,
  selected: ReceiptPacking,
): string | null {
  if (template.requiresCommercialUnit) {
    return selected.packingModel === 'whole' &&
      selected.halfPreparation === 'none' &&
      selected.allowedPresentations.length === 1 &&
      selected.allowedPresentations[0] === 'box' &&
      selected.blistersPerBox === null &&
      selected.boxWeightKg === null &&
      typeof selected.commercialUnitLabel === 'string' &&
      selected.commercialUnitLabel.trim().length > 0
      ? null
      : 'Indica la unidad comercial recibida; no se infieren peso, contenido ni fracciones.';
  }
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
  // Only confirmed pear calibers have a V4.5 suggestion; legacy templates keep their rules.
  if (suggested.blistersPerBox !== null && selected.blistersPerBox !== suggested.blistersPerBox)
    return 'Conserva el conteo habitual y confirma el cambio como excepción de este lote.';
  return null;
}
export type HabitualCatalogOption = {
  optionKey: string;
  label: string;
  templateId: HabitualTemplate['id'] | null;
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
  requiresCommercialUnit?: boolean;
};
export type HabitualCatalogOptions = {
  templateVersion: HabitualCatalogVersion;
  groups: { id: string; label: string; options: HabitualCatalogOption[] }[];
  options: HabitualCatalogOption[];
};
export type PreviousReceiptCost = { sourceLotId: string; unitCostUsd: string; receivedAt: string };
export type ReceiptOptions = { configurationId: string; previousCost: PreviousReceiptCost | null };

/** Read-only virtual choices: no price, quantity or database identity is invented. */
export function buildHabitualCatalogOptions(
  catalog: Catalog,
  version: HabitualCatalogVersion = HABITUAL_CATALOG_VERSION,
): HabitualCatalogOptions {
  const seen = new Set<string>();
  const templates = getHabitualTemplates(version);
  const groups: HabitualCatalogOptions['groups'] = templates.map((template) => {
    const fruit = catalog.fruits.find(
      (row) => catalogNameKey(row.name) === catalogNameKey(template.fruitName),
    );
    const knownFruitCalibers = new Set(
      templates.filter((t) => t.fruitName === template.fruitName).flatMap((t) => t.calibers),
    );
    const varieties: (string | null)[] = template.requiresVariety
      ? [
          ...new Map(
            [
              ...template.varieties,
              ...catalog.varieties
                .filter(
                  (v) =>
                    v.fruitId === fruit?.id &&
                    (version === 'v4.2' ||
                      template.id !== 'apple_bulk' ||
                      template.varieties.some(
                        (name) => catalogNameKey(name) === catalogNameKey(v.name),
                      )) &&
                    (version === 'v4.2' ||
                      template.id !== 'pear' ||
                      catalogNameKey(v.name) !== 'packcam'),
                )
                .map((v) => v.name),
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
        const currentPacking = existing ? configurationPacking(existing) : null;
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
                templateVersion: version,
                varietyName,
                caliberLabel,
              },
          configurationId: existing?.id ?? null,
          packingVersion: existing?.version ?? null,
          confirmationStatus: existing?.confirmationStatus ?? null,
          suggestedPacking,
          currentPacking,
          needsPresentation: template.requiresCommercialUnit
            ? !currentPacking?.commercialUnitLabel?.trim()
            : (!suggestedPacking ||
                (version === 'v4.5' &&
                  template.id === 'pear' &&
                  suggestedPacking.blistersPerBox === null)) &&
              existing?.confirmationStatus !== 'confirmed',
          requiresCommercialUnit: template.requiresCommercialUnit ?? false,
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
    .map((c): HabitualCatalogOption => {
      const requiresCommercialUnit = templates.some(
        (template) =>
          template.requiresCommercialUnit &&
          catalogNameKey(template.fruitName) === catalogNameKey(c.fruit),
      );
      return {
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
        needsPresentation:
          c.confirmationStatus !== 'confirmed' ||
          (requiresCommercialUnit && !c.commercialUnitLabel?.trim()),
        requiresCommercialUnit,
        packingDiscrepancy: false,
      };
    });
  if (additional.length)
    groups.push({ id: 'existing', label: 'Otros productos registrados', options: additional });
  return {
    templateVersion: version,
    groups,
    options: groups.flatMap((g) => g.options),
  };
}
