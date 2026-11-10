import Decimal from 'decimal.js';
import { allocateCost } from './costing';
import type { ContainerStock } from './inventory';
import type { SaleLotSnapshot } from './sale-availability';

// Integer accounting subdivisions, never fruit counts. A blister uses two;
// a half box uses B; a complete box uses 2B (B=1 for bulk/kiwi).
export function portionsPerBox(lot: Pick<SaleLotSnapshot, 'packingModel' | 'blistersPerBox'>) {
  return lot.packingModel === 'blister' ? 2 * (lot.blistersPerBox ?? 0) : 2;
}

export function containerPortions(c: ContainerStock, lot: SaleLotSnapshot): number {
  if (c.quantity <= 0 || ['empty', 'dispatched'].includes(c.state)) return 0;
  const perBox = portionsPerBox(lot);
  if (c.unit === 'box_fraction') return c.quantity;
  if (c.unit === 'sealed_box' && c.state === 'sealed') return perBox;
  if (c.unit === 'intact_blister' && c.state === 'sealed') return 2;
  // Counted historical halves retain their original meaning and direct sale.
  if (c.unit === 'prepared_half_box' && c.countedPieces === null) return perBox / 2;
  return 0;
}

/** Takes a commercial presentation from existing contents, opening only as needed.
 * Sources keep their identity and exact remaining cost; the caller records one
 * delivered presentation and an immutable movement in the same transaction.
 */
export function takeCommercialPortions(
  state: Map<string, ContainerStock>,
  lot: SaleLotSnapshot,
  needed: number,
  includeCosts: boolean,
): {
  costUsd: string | null;
  source: ContainerStock;
  portionSources: NonNullable<ContainerStock['portionSources']>;
} | null {
  const sources = [...state.values()]
    .filter((c) => containerPortions(c, lot) > 0)
    .sort((a, b) => Number(a.unit === 'sealed_box') - Number(b.unit === 'sealed_box'));
  if (sources.reduce((sum, c) => sum + containerPortions(c, lot), 0) < needed) return null;
  let remaining = needed,
    cost = new Decimal(0),
    known = includeCosts;
  const first = sources[0]!;
  const portionSources: NonNullable<ContainerStock['portionSources']> = [];
  for (const c of sources) {
    if (!remaining) break;
    const before = containerPortions(c, lot),
      taken = Math.min(before, remaining);
    portionSources.push({
      containerId: c.id,
      beforePortions: before,
      takenPortions: taken,
      costBeforeUsd: c.costUsd ?? null,
    });
    const [usedCost, restCost] = includeCosts
      ? allocateCost(c.costUsd ?? null, [taken, before - taken])
      : [null, null];
    if (usedCost === null) known = false;
    else cost = cost.plus(usedCost);
    c.quantity = before - taken;
    c.costUsd = c.quantity ? restCost : '0.0000';
    c.countedPieces = null;
    c.unit = 'box_fraction';
    c.state = c.quantity ? 'open' : 'empty';
    remaining -= taken;
  }
  return { costUsd: known ? cost.toFixed(4) : null, source: first, portionSources };
}
