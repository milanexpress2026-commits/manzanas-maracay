import type { Presentation } from './commerce';
import type { ContainerStock } from './inventory';

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
export function presentationCanUseLot(presentation: Presentation, lot: SaleLotSnapshot) {
  return (
    lot.allowedPresentations.includes(presentation) &&
    (presentation !== 'blister' || lot.packingModel === 'blister') &&
    (presentation !== 'half_box' || !['none', 'pending'].includes(lot.halfPreparation))
  );
}

/** Read-only maximum in the same lot/container order used by the sale allocator.
 * An unknown cost stops FIFO rather than silently skipping to newer merchandise.
 */
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
    const sealed = lot.containers.filter((c) => c.quantity === 1 && c.state === 'sealed');
    const direct = sealed.filter((c) => c.unit === unit);
    const boxes = presentation === 'box' ? [] : sealed.filter((c) => c.unit === 'sealed_box');
    const perBox =
      presentation === 'blister'
        ? (lot.blistersPerBox ?? 0)
        : presentation === 'half_box' &&
            lot.packingModel === 'halves' &&
            lot.halfPreparation === 'commercial'
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
    for (const { container, quantity } of candidates) {
      if (container.costUsd == null)
        return {
          availableQuantity,
          blockedReason: 'Hay mercancía anterior cuyo costo necesita revisión.',
        };
      availableQuantity += quantity;
    }
  }
  return { availableQuantity, blockedReason: null };
}
