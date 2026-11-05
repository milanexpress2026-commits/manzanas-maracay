import { z } from 'zod';
import Decimal from 'decimal.js';
import { presentationSchema, type Presentation } from './commerce';
export * from './inventory';
export * from './commerce';
export * from './sale-availability';
export * from './auth';
export * from './operations';
export * from './production';

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Escribe al menos 2 caracteres.')
  .max(80, 'Usa como máximo 80 caracteres.');
export const fruitSchema = z.object({ name: nameSchema }).strict();
export const varietySchema = z.object({ name: nameSchema, fruitId: z.uuid() }).strict();
export const updateVarietySchema = z
  .object({ name: nameSchema, expectedName: nameSchema })
  .strict();
export const caliberSchema = z
  .object({ label: z.string().trim().min(1).max(30), fruitId: z.uuid() })
  .strict();
export const caliberBatchSchema = z
  .object({
    fruitId: z.uuid(),
    labels: z.array(z.string().trim().min(1).max(30)).min(1).max(20),
  })
  .strict();
export type PackingModel = 'blister' | 'halves' | 'whole';
export type HalfPreparation = 'counted' | 'commercial' | 'pending' | 'none';
const packingFields = {
  blistersPerBox: z.number().int().min(1).max(100).nullable().default(null),
  packingModel: z.enum(['blister', 'halves', 'whole']).default('blister'),
  halfPreparation: z.enum(['counted', 'commercial', 'pending', 'none']).default('counted'),
  allowedPresentations: z
    .array(presentationSchema)
    .min(1)
    .max(3)
    .default(['box', 'half_box', 'blister']),
  boxWeightKg: z
    .string()
    .regex(/^\d{1,4}(\.\d{1,3})?$/)
    .refine((v) => new Decimal(v).gt(0))
    .nullable()
    .default(null),
  confirmationStatus: z.enum(['confirmed', 'pending']).default('pending'),
  notes: z.string().trim().max(500).default(''),
};
function validPacking(value: {
  packingModel: PackingModel;
  halfPreparation: HalfPreparation;
  allowedPresentations: Presentation[];
  blistersPerBox: number | null;
}) {
  const p = value.allowedPresentations;
  if (new Set(p).size !== p.length || !p.includes('box')) return false;
  if (value.packingModel === 'whole')
    return value.blistersPerBox === null && p.length === 1 && value.halfPreparation === 'none';
  if (value.packingModel === 'halves')
    return (
      value.blistersPerBox === null &&
      !p.includes('blister') &&
      value.halfPreparation === 'commercial'
    );
  return ['counted', 'pending', 'none'].includes(value.halfPreparation);
}
export const configurationSchema = z
  .object({
    fruitId: z.uuid(),
    varietyId: z.uuid().nullable().default(null),
    caliberId: z.uuid().nullable().default(null),
    commercialLine: z.string().trim().min(1).max(80).default('Estándar'),
    ...packingFields,
  })
  .strict()
  .refine(
    validPacking,
    'Las presentaciones y el método de preparación no corresponden al empaque.',
  );
export const updatePackingSchema = z
  .object({
    ...packingFields,
    version: z.number().int().positive(),
  })
  .strict()
  .refine(
    validPacking,
    'Las presentaciones y el método de preparación no corresponden al empaque.',
  );
export type Fruit = { id: string; name: string };
export type Variety = Fruit & { fruitId: string };
export type Caliber = { id: string; fruitId: string; label: string };
export type Configuration = {
  id: string;
  variantId: string;
  fruitId: string;
  varietyId: string | null;
  caliberId: string | null;
  fruit: string;
  variety: string | null;
  caliber: string | null;
  commercialLine: string;
  blistersPerBox: number | null;
  packingModel: PackingModel;
  halfPreparation: HalfPreparation;
  allowedPresentations: Presentation[];
  boxWeightKg: string | null;
  confirmationStatus: 'confirmed' | 'pending';
  prices: { presentation: Presentation; promoUsd: string | null; regularUsd: string | null }[];
  notes: string;
  version: number;
};
export type Catalog = {
  fruits: Fruit[];
  varieties: Variety[];
  calibers: Caliber[];
  configurations: Configuration[];
};

// Domain prototypes only: inventory endpoints are deliberately outside phase 1.
export type PackageStock = { closedBoxes: number; openBoxes: number; intactBlisters: number };
function natural(n: number) {
  if (!Number.isSafeInteger(n) || n < 0)
    throw new Error('La cantidad debe ser un entero no negativo.');
}
export function sellIntactBlisters(
  stock: PackageStock,
  blistersPerBox: number,
  quantity: number,
): PackageStock {
  Object.values(stock).forEach(natural);
  natural(quantity);
  natural(blistersPerBox);
  if (!blistersPerBox || !quantity)
    throw new Error('La configuración y la venta deben ser positivas.');
  const opening = Math.ceil(Math.max(0, quantity - stock.intactBlisters) / blistersPerBox);
  if (opening > stock.closedBoxes) throw new Error('Existencia insuficiente.');
  const remaining = stock.intactBlisters + opening * blistersPerBox - quantity;
  // This plan tracks newly opened boxes; empty-container retirement is a separate physical operation.
  return {
    closedBoxes: stock.closedBoxes - opening,
    openBoxes: stock.openBoxes + opening,
    intactBlisters: remaining,
  };
}
export function countSellableBlisters(stock: PackageStock, blistersPerBox: number) {
  return stock.closedBoxes * blistersPerBox + stock.intactBlisters;
}
export function fractionByActualCount(input: {
  countedBefore: number;
  delivered: number;
  remaining: number;
}) {
  Object.values(input).forEach(natural);
  if (!input.countedBefore || input.delivered + input.remaining !== input.countedBefore)
    throw new Error('El conteo físico no conserva la fruta.');
  return { ...input };
}
export function resolvePackaging(defaultBlisters: number, lotOverride?: number) {
  const count = lotOverride ?? defaultBlisters;
  natural(count);
  if (!count) throw new Error('Una caja debe contener al menos un blíster.');
  return count;
}
export function negotiatedLine(reference: string, agreed: string, quantity: number) {
  natural(quantity);
  const r = new Decimal(reference),
    p = new Decimal(agreed);
  if (!quantity || !r.isFinite() || !p.isFinite() || r.isNegative() || p.isNegative())
    throw new Error('Precio o cantidad inválidos.');
  return {
    referenceUnitUsd: r.toFixed(4),
    agreedUnitUsd: p.toFixed(4),
    totalUsd: p.times(quantity).toFixed(2),
    discountUsd: r.minus(p).times(quantity).toFixed(2),
  };
}
export type VerifiedRate = {
  rate: string;
  source: 'BCV';
  verifiedAt: Date;
  validFrom: Date;
  validUntil: Date;
};
export interface OfficialRateProvider {
  getVerifiedRate(at: Date): Promise<VerifiedRate | null>;
}
export class UnconfiguredBcvProvider implements OfficialRateProvider {
  async getVerifiedRate() {
    return null;
  }
}
export function paymentVesToUsd(amountVes: string, rate: VerifiedRate, at: Date) {
  if (
    rate.source !== 'BCV' ||
    !Number.isFinite(at.getTime()) ||
    !Number.isFinite(rate.verifiedAt.getTime()) ||
    !Number.isFinite(rate.validFrom.getTime()) ||
    !Number.isFinite(rate.validUntil.getTime()) ||
    rate.verifiedAt > at ||
    at < rate.validFrom ||
    at >= rate.validUntil
  )
    throw new Error('No hay una tasa BCV vigente y verificada.');
  const value = new Decimal(rate.rate),
    amount = new Decimal(amountVes);
  if (!value.isFinite() || !amount.isFinite() || value.lte(0) || amount.lte(0))
    throw new Error('Monto o tasa inválidos.');
  return amount.div(value).toFixed(2, Decimal.ROUND_HALF_UP);
}
