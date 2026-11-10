import type { Presentation } from './commerce';
import type { ContainerStock } from './inventory';
import { containerPortions, portionsPerBox } from './commercial-portions';

export type SaleLotSnapshot = {
  packingModel: 'blister' | 'halves' | 'whole';
  halfPreparation: 'counted' | 'commercial' | 'pending' | 'none';
  allowedPresentations: Presentation[];
  blistersPerBox: number | null;
};
export type SaleAvailability = {
  checkedAt: string;
  /** Each maximum is independent: boxes and their possible children are not additive. */
  items: {
    configurationId: string;
    presentation: Presentation;
    availableQuantity: number;
    blockedReason: string | null;
  }[];
};
export function effectiveSalePresentations(value: {
  allowedPresentations: Presentation[];
  packingModel?: string;
  blistersPerBox?: number | null;
}): Presentation[] {
  const result = [...value.allowedPresentations];
  if (
    (value.packingModel === 'halves' ||
      (value.packingModel === 'blister' && (value.blistersPerBox ?? 0) > 0)) &&
    !result.includes('half_box')
  )
    result.push('half_box');
  return result;
}
export function presentationCanUseLot(presentation: Presentation, lot: SaleLotSnapshot) {
  return (
    effectiveSalePresentations(lot).includes(presentation) &&
    (presentation !== 'blister' || lot.packingModel === 'blister') &&
    (presentation !== 'half_box' ||
      (lot.packingModel === 'blister' && (lot.blistersPerBox ?? 0) > 0) ||
      lot.halfPreparation === 'counted' ||
      lot.packingModel === 'halves')
  );
}

/** Read-only physical maximum. Unknown costs do not change FIFO availability. */
export function countSellablePresentation(
  lots: (SaleLotSnapshot & {
    confirmed: boolean;
    containers: ContainerStock[];
  })[],
  presentation: Presentation,
  requireConfirmedLots: boolean,
): { availableQuantity: number; blockedReason: string | null } {
  let availableQuantity = 0;
  const unit =
    presentation === 'box'
      ? 'sealed_box'
      : presentation === 'blister'
        ? 'intact_blister'
        : 'prepared_half_box';
  for (const lot of lots) {
    if (!presentationCanUseLot(presentation, lot)) continue;
    if (presentation !== 'box' && lot.packingModel === 'blister') {
      const portions = lot.containers.reduce((sum, c) => sum + containerPortions(c, lot), 0);
      const directCounted =
        presentation === 'half_box'
          ? lot.containers.filter(
              (c) =>
                c.unit === 'prepared_half_box' &&
                c.state === 'sealed' &&
                c.quantity === 1 &&
                c.countedPieces !== null,
            ).length
          : 0;
      const divisor = presentation === 'blister' ? 2 : portionsPerBox(lot) / 2;
      const quantity = divisor > 0 ? Math.floor(portions / divisor) + directCounted : directCounted;
      if (quantity && requireConfirmedLots && !lot.confirmed)
        return {
          availableQuantity,
          blockedReason: 'Hay mercancía anterior cuyo empaque necesita confirmación.',
        };
      availableQuantity += quantity;
      continue;
    }
    const sealed = lot.containers.filter((c) => c.quantity === 1 && c.state === 'sealed');
    const direct = sealed.filter((c) => c.unit === unit);
    const boxes = presentation === 'box' ? [] : sealed.filter((c) => c.unit === 'sealed_box');
    const perBox =
      presentation === 'blister'
        ? (lot.blistersPerBox ?? 0)
        : presentation === 'half_box' && lot.packingModel === 'halves'
          ? 2
          : 0;
    const candidates = [
      ...direct.map((container) => ({ container, quantity: 1 })),
      ...(perBox ? boxes.map((container) => ({ container, quantity: perBox })) : []),
    ];
    if (!candidates.length) continue;
    if (requireConfirmedLots && !lot.confirmed)
      return {
        availableQuantity,
        blockedReason: 'Hay mercancía anterior cuyo empaque necesita confirmación.',
      };
    for (const { quantity } of candidates) {
      availableQuantity += quantity;
    }
  }
  return { availableQuantity, blockedReason: null };
}
