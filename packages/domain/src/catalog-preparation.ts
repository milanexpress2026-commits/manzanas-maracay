import { z } from 'zod';
import {
  configurationSchema,
  packingFields,
  validPacking,
  type Catalog,
  type Configuration,
} from './index';

const name = z.string().trim().min(2).max(80);
const label = z.string().trim().min(1).max(30);
export const catalogNameKey = (value: string) => value.trim().toLowerCase();

// Lazy access avoids a module-initialization cycle with the existing catalog schemas.
export const catalogPreparationDraftSchema = z.lazy(() =>
  z
    .object({
      varietyName: name.nullable(),
      caliberLabel: label.nullable(),
      commercialLine: z.string().trim().min(1).max(80),
      ...packingFields,
      confirmationStatus: z.literal('pending'),
    })
    .strict()
    .refine(validPacking, 'Revisa las presentaciones del borrador.'),
);

export const catalogPreparationInputSchema = z
  .object({
    fruits: z
      .array(
        z
          .object({
            name,
            varieties: z.array(name).max(20),
            calibers: z.array(label).max(30),
            drafts: z.array(catalogPreparationDraftSchema).max(20),
          })
          .strict(),
      )
      .min(1)
      .max(10),
  })
  .strict()
  .superRefine((value, ctx) => {
    const duplicate = (values: string[]) =>
      new Set(values.map(catalogNameKey)).size !== values.length;
    if (duplicate(value.fruits.map((fruit) => fruit.name)))
      ctx.addIssue({
        code: 'custom',
        message: 'Agrupa las variedades y calibres de cada fruta en una sola fila.',
      });
    let totalDrafts = 0;
    for (const fruit of value.fruits) {
      totalDrafts += fruit.drafts.length;
      if (duplicate(fruit.varieties) || duplicate(fruit.calibers))
        ctx.addIssue({ code: 'custom', message: `Revisa los nombres repetidos de ${fruit.name}.` });
      const identities = new Set<string>();
      for (const draft of fruit.drafts) {
        if (
          (draft.varietyName &&
            !fruit.varieties.some(
              (v) => catalogNameKey(v) === catalogNameKey(draft.varietyName!),
            )) ||
          (draft.caliberLabel &&
            !fruit.calibers.some((v) => catalogNameKey(v) === catalogNameKey(draft.caliberLabel!)))
        )
          ctx.addIssue({
            code: 'custom',
            message: `El borrador de ${fruit.name} debe usar una variedad y calibre incluidos en la revisión.`,
          });
        const key = JSON.stringify([
          draft.varietyName && catalogNameKey(draft.varietyName),
          draft.caliberLabel && catalogNameKey(draft.caliberLabel),
          draft.commercialLine,
        ]);
        if (identities.has(key))
          ctx.addIssue({ code: 'custom', message: 'Una combinación comercial aparece dos veces.' });
        identities.add(key);
        if (draft.packingModel === 'blister' && (!draft.varietyName || !draft.caliberLabel))
          ctx.addIssue({
            code: 'custom',
            message:
              'Elige una variedad y un calibre concreto antes de preparar una caja blisteada.',
          });
      }
    }
    if (totalDrafts > 20)
      ctx.addIssue({
        code: 'custom',
        message: 'Revisa como máximo 20 productos concretos por operación.',
      });
  });
export const catalogPreparationSchema = catalogPreparationInputSchema.safeExtend({
  confirmed: z.literal(true),
});
export const catalogConfigurationBatchSchema = z
  .object({
    confirmed: z.literal(true),
    configurations: z
      .array(z.lazy(() => configurationSchema))
      .min(1)
      .max(20),
  })
  .strict()
  .superRefine((value, ctx) => {
    const identities = new Set<string>();
    for (const row of value.configurations) {
      if (row.confirmationStatus !== 'pending')
        ctx.addIssue({
          code: 'custom',
          message: 'El alta rápida crea borradores; confirma el empaque al revisar mercancía.',
        });
      if (row.packingModel === 'blister' && (!row.varietyId || !row.caliberId))
        ctx.addIssue({
          code: 'custom',
          message: 'Selecciona variedad y calibre para cada combinación blisteada.',
        });
      const key = JSON.stringify([row.fruitId, row.varietyId, row.caliberId, row.commercialLine]);
      if (identities.has(key))
        ctx.addIssue({ code: 'custom', message: 'Hay una combinación repetida en el lote.' });
      identities.add(key);
    }
  });
export type CatalogPreparationInput = z.infer<typeof catalogPreparationInputSchema>;
export type CatalogPreparationDraft = z.infer<typeof catalogPreparationDraftSchema>;
export type CatalogConfigurationBatchInput = z.infer<typeof catalogConfigurationBatchSchema>;
export type CatalogPreparationCounts = {
  fruits: number;
  varieties: number;
  calibers: number;
  configurations: number;
};
export type CatalogPreparationResult = {
  id: string;
  created: CatalogPreparationCounts;
  reused: CatalogPreparationCounts;
  fruits: {
    id: string;
    name: string;
    varieties: { id: string; name: string }[];
    calibers: { id: string; label: string }[];
    configurations: CatalogPreparedConfiguration[];
  }[];
};
export type CatalogPreparedConfiguration = {
  id: string;
  variantId: string;
  created: boolean;
  confirmationStatus: 'pending' | 'confirmed';
};
export type CatalogConfigurationBatchResult = {
  id: string;
  configurations: CatalogPreparedConfiguration[];
  createdCount: number;
  reusedCount: number;
};
export type CatalogPreparationPreview = {
  fruits: {
    name: string;
    action: 'create' | 'reuse';
    id: string | null;
    varieties: { name: string; action: 'create' | 'reuse' }[];
    calibers: { label: string; action: 'create' | 'reuse' }[];
    drafts: {
      draft: CatalogPreparationDraft;
      action: 'create' | 'reuse';
      configurationId: string | null;
    }[];
  }[];
  created: CatalogPreparationCounts;
  reused: CatalogPreparationCounts;
  warnings: string[];
};
export function emptyCatalogPreparationCounts(): CatalogPreparationCounts {
  return { fruits: 0, varieties: 0, calibers: 0, configurations: 0 };
}
export function previewCatalogPreparation(
  input: CatalogPreparationInput,
  catalog: Catalog,
): CatalogPreparationPreview {
  const created = emptyCatalogPreparationCounts(),
    reused = emptyCatalogPreparationCounts();
  const action = (exists: boolean, field: keyof CatalogPreparationCounts) => {
    (exists ? reused : created)[field]++;
    return exists ? ('reuse' as const) : ('create' as const);
  };
  return {
    fruits: input.fruits.map((fruit) => {
      const existing = catalog.fruits.find(
        (row) => catalogNameKey(row.name) === catalogNameKey(fruit.name),
      );
      const varieties = catalog.varieties.filter((row) => row.fruitId === existing?.id);
      const calibers = catalog.calibers.filter((row) => row.fruitId === existing?.id);
      return {
        name: fruit.name,
        id: existing?.id ?? null,
        action: action(!!existing, 'fruits'),
        varieties: fruit.varieties.map((name) => ({
          name,
          action: action(
            varieties.some((row) => catalogNameKey(row.name) === catalogNameKey(name)),
            'varieties',
          ),
        })),
        calibers: fruit.calibers.map((label) => ({
          label,
          action: action(
            calibers.some((row) => catalogNameKey(row.label) === catalogNameKey(label)),
            'calibers',
          ),
        })),
        drafts: fruit.drafts.map((draft) => {
          const variety = varieties.find(
            (row) => catalogNameKey(row.name) === catalogNameKey(draft.varietyName ?? ''),
          );
          const caliber = calibers.find(
            (row) => catalogNameKey(row.label) === catalogNameKey(draft.caliberLabel ?? ''),
          );
          const found =
            existing && (!draft.varietyName || variety) && (!draft.caliberLabel || caliber)
              ? catalog.configurations.find(
                  (row) =>
                    row.fruitId === existing.id &&
                    row.varietyId === (variety?.id ?? null) &&
                    row.caliberId === (caliber?.id ?? null) &&
                    row.commercialLine === draft.commercialLine,
                )
              : undefined;
          return {
            draft,
            action: action(!!found, 'configurations'),
            configurationId: found?.id ?? null,
          };
        }),
      };
    }),
    created,
    reused,
    warnings: [
      'Solo se preparan maestros y borradores: no se crean existencias, precios, costos, proveedores ni clientes.',
      'Los nombres existentes se reutilizan sin renombrarlos; un empaque existente conserva su configuración.',
      'Las cantidades sugeridas requieren revisión. Lady y Pink Lady son nombres distintos.',
    ],
  };
}

type TemplatePacking = Pick<
  Configuration,
  'packingModel' | 'halfPreparation' | 'allowedPresentations' | 'boxWeightKg' | 'blistersPerBox'
> & { confirmationStatus: 'pending' };
export type CatalogTemplate = {
  id:
    | 'apple_traditional'
    | 'apple_bulk'
    | 'pear'
    | 'kiwi'
    | 'grape'
    | 'mandarin'
    | 'plum'
    | 'nectarine'
    | 'orange';
  fruitName: string;
  commercialLine: string;
  varieties: string[];
  calibers: string[];
  requiresVariety: boolean;
  requiresCaliber: boolean;
  packing: TemplatePacking | null;
  note: string;
};
const blister: TemplatePacking = {
  packingModel: 'blister',
  halfPreparation: 'pending',
  allowedPresentations: ['box', 'half_box', 'blister'],
  boxWeightKg: null,
  blistersPerBox: null,
  confirmationStatus: 'pending',
};
const halves: TemplatePacking = {
  packingModel: 'halves',
  halfPreparation: 'commercial',
  allowedPresentations: ['box', 'half_box'],
  boxWeightKg: null,
  blistersPerBox: null,
  confirmationStatus: 'pending',
};
export const CATALOG_TEMPLATES: readonly CatalogTemplate[] = [
  {
    id: 'apple_traditional',
    fruitName: 'Manzana',
    commercialLine: 'Tradicional',
    varieties: ['Gala', 'Roja normal', 'Verde', 'Pink Lady', 'Amarilla'],
    calibers: ['80', '88', '100', '113', '125', '135', '150', '163', '175', '198', '216'],
    requiresVariety: true,
    requiresCaliber: true,
    packing: blister,
    note: 'Caja, media y blíster. Cantidad y preparación de media pendientes de revisión.',
  },
  {
    id: 'apple_bulk',
    fruitName: 'Manzana',
    commercialLine: 'Granel',
    varieties: [],
    calibers: ['150', '163', '175', '198', '216', '232'],
    requiresVariety: false,
    requiresCaliber: true,
    packing: halves,
    note: 'Caja y media comerciales; sin blíster ni conteo por manzana.',
  },
  {
    id: 'pear',
    fruitName: 'Pera',
    commercialLine: 'Tradicional',
    varieties: ['Forelle', 'Packcam'],
    calibers: ['70', '80', '90', '100', '110', '120', '135'],
    requiresVariety: true,
    requiresCaliber: true,
    packing: blister,
    note: 'Blíster y preparación de media pendientes; conservar el nombre Packcam.',
  },
  {
    id: 'kiwi',
    fruitName: 'Kiwi',
    commercialLine: 'Caja 10 kg',
    varieties: [],
    calibers: [],
    requiresVariety: false,
    requiresCaliber: false,
    packing: { ...halves, boxWeightKg: '10' },
    note: 'Caja 10 kg / media 5 kg; no se cuentan piezas ni se pesa cada venta.',
  },
  {
    id: 'grape',
    fruitName: 'Uva',
    commercialLine: 'Caja completa',
    varieties: ['Roja', 'Morada', 'Verde'],
    calibers: [],
    requiresVariety: true,
    requiresCaliber: false,
    packing: {
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      boxWeightKg: null,
      blistersPerBox: null,
      confirmationStatus: 'pending',
    },
    note: 'Solo caja; sin medias, peso obligatorio, blíster ni gajos.',
  },
  ...(
    [
      ['plum', 'Ciruela'],
      ['nectarine', 'Nectarina'],
      ['orange', 'Naranja'],
    ] as const
  ).map(([id, fruitName]) => ({
    id,
    fruitName,
    commercialLine: '',
    varieties: [],
    calibers: [],
    requiresVariety: false,
    requiresCaliber: false,
    packing: null,
    note: 'Confirmar presentación antes de recibir; sin peso ni conteos inventados.',
  })),
  {
    id: 'mandarin',
    fruitName: 'Mandarina',
    commercialLine: '',
    varieties: [],
    calibers: [],
    requiresVariety: false,
    requiresCaliber: false,
    packing: null,
    note: 'Solo fruta. Empaque y presentaciones pendientes.',
  },
];
export function getCatalogPreparationDefaults(): CatalogPreparationInput {
  const fruits: CatalogPreparationInput['fruits'] = [];
  for (const template of CATALOG_TEMPLATES) {
    let fruit = fruits.find((row) => row.name === template.fruitName);
    if (!fruit) {
      fruit = { name: template.fruitName, varieties: [], calibers: [], drafts: [] };
      fruits.push(fruit);
    }
    fruit.varieties = [...new Set([...fruit.varieties, ...template.varieties])];
    fruit.calibers = [...new Set([...fruit.calibers, ...template.calibers])];
    if (template.id === 'kiwi' || template.id === 'grape') {
      for (const varietyName of template.id === 'kiwi' ? [null] : template.varieties)
        fruit.drafts.push({
          ...structuredClone(template.packing!),
          varietyName,
          caliberLabel: null,
          commercialLine: template.commercialLine,
          notes: 'Borrador comercial revisable; confirmar al recibir mercancía.',
        });
    }
  }
  return fruits.length ? { fruits } : { fruits: [] };
}

export function suggestedBlistersPerBox(
  fruit: string,
  variety: string | null,
  caliber: string | null,
  commercialLine = 'Tradicional',
  packingModel: Configuration['packingModel'] = 'blister',
): number | null {
  if (
    catalogNameKey(fruit) !== 'manzana' ||
    catalogNameKey(commercialLine) !== 'tradicional' ||
    packingModel !== 'blister' ||
    !caliber ||
    !/^\d+$/.test(caliber.trim())
  )
    return null;
  const n = Number(caliber);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  // Owner correction: only these four traditional apples use five at caliber 100.
  // Pink Lady, historical Lady and unknown varieties keep the prior rule.
  if (
    n === 100 &&
    ['roja normal', 'roja', 'verde', 'amarilla', 'gala'].includes(catalogNameKey(variety ?? ''))
  )
    return 5;
  return n <= 100 ? 4 : 5;
}
