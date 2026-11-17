import { z } from 'zod';
import Decimal from 'decimal.js';
const nonnegativeAmount = z
  .string()
  .trim()
  .regex(/^\d{1,14}(\.\d{1,2})?$/)
  .transform((v) => new Decimal(v).toFixed(2));
export const saleReductionSchema = z
  .object({
    saleId: z.uuid().optional(),
    clientId: z.uuid().optional(),
    expectedVersion: z.number().int().nonnegative(),
    lines: z
      .array(z.object({ lineId: z.uuid(), quantity: z.number().int().positive() }).strict())
      .min(1)
      .max(50),
    resolution: z.enum(['none', 'refund', 'credit']),
    reason: z.string().trim().min(5).max(500),
    stockReturned: z.literal(true),
  })
  .strict()
  .refine(
    (v) => new Set(v.lines.map((l) => l.lineId)).size === v.lines.length,
    'No repitas productos.',
  );
export const paymentCorrectionSchema = z
  .object({
    paymentId: z.uuid().optional(),
    clientId: z.uuid().optional(),
    expectedVersion: z.number().int().nonnegative(),
    amount: nonnegativeAmount,
    applications: z
      .array(z.object({ saleId: z.uuid(), amountUsd: nonnegativeAmount }).strict())
      .min(1)
      .max(50),
    reason: z.string().trim().min(5).max(500),
  })
  .strict()
  .refine(
    (v) => new Set(v.applications.map((a) => a.saleId)).size === v.applications.length,
    'No repitas comprobantes.',
  );
export const saleReductionCommandSchema = saleReductionSchema.safeExtend({
  saleId: z.uuid(),
  clientId: z.uuid(),
});
export const paymentCorrectionCommandSchema = paymentCorrectionSchema.safeExtend({
  paymentId: z.uuid(),
  clientId: z.uuid(),
});
export type CorrectionHistory = {
  id: string;
  kind: 'entry' | 'refund' | 'credit';
  reason: string;
  createdAt: string;
  amount: string;
  amountUsd: string;
  creditDeltaUsd: string;
};
export type ReductionHistory = {
  id: string;
  reason: string;
  createdAt: string;
  reductionUsd: string;
  excessUsd: string;
  resolution: 'none' | 'refund' | 'credit';
};
/** Preserve the original quote when recording a corrected historical amount. */
export function correctedPaymentAmount(amountUsd: string, rate: string | null): string {
  return new Decimal(amountUsd).times(rate ?? 1).toFixed(2, Decimal.ROUND_HALF_UP);
}
export function refundAmounts(
  payments: readonly {
    reversed: boolean;
    appliedUsd: string;
    amountUsd: string;
    amount: string;
    currency: string;
    conversionRate?: string | null;
  }[],
  excessUsd: string,
) {
  let excess = new Decimal(excessUsd);
  const result: { currency: string; amount: string }[] = [];
  for (const p of [...payments].reverse()) {
    if (p.reversed || excess.eq(0) || new Decimal(p.appliedUsd).lte(0)) continue;
    const returned = Decimal.min(excess, p.appliedUsd);
    const remaining = new Decimal(p.amountUsd).sub(returned).toFixed(2);
    result.push({
      currency: p.currency,
      amount: new Decimal(p.amount)
        .sub(correctedPaymentAmount(remaining, p.conversionRate ?? null))
        .toFixed(2),
    });
    excess = excess.sub(returned);
  }
  return result;
}
