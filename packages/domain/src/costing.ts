import Decimal from 'decimal.js';
import type { ContainerStock } from './inventory';

/** Divide an existing cost; the last physical portion keeps the decimal residue. */
export function allocateCost(total: string | null, weights: number[]): (string | null)[] {
  if (
    !weights.length ||
    weights.some((n) => !Number.isSafeInteger(n) || n < 0) ||
    !weights.some((n) => n > 0)
  )
    throw new Error('La distribución de costo requiere cantidades físicas positivas.');
  if (total === null) return weights.map(() => null);
  const cost = new Decimal(total),
    sum = weights.reduce((a, b) => a + b, 0);
  if (!cost.isFinite() || cost.lt(0)) throw new Error('Costo inválido.');
  let remaining = cost;
  const last = weights.length - 1 - [...weights].reverse().findIndex((n) => n > 0);
  return weights.map((n, i) => {
    const part =
      i === last ? remaining : cost.mul(n).div(sum).toDecimalPlaces(4, Decimal.ROUND_DOWN);
    remaining = remaining.sub(part);
    return part.toFixed(4);
  });
}

export type CostReplayMovement = {
  id: string;
  kind: string;
  reversal_of: string | null;
  before_state: ContainerStock[];
  after_state: ContainerStock[];
  counted_before: number | null;
  delivered_pieces: number | null;
  remaining_pieces: number | null;
};

/** Replay phase-2 physical snapshots without rewriting an applied migration or old events. */
export function replayLegacyCosts(movements: CostReplayMovement[], boxCost: string) {
  const current = new Map<string, string | null>();
  const beforeEvents = new Map<string, Map<string, string | null>>();
  const knownBasis = new Map<string, { cost: string | null; quantity: number }>();
  for (const movement of movements) {
    const before = new Map(movement.before_state.map((c) => [c.id, c]));
    const eventBefore = new Map<string, string | null>();
    for (const c of movement.before_state) eventBefore.set(c.id, current.get(c.id) ?? null);
    beforeEvents.set(movement.id, eventBefore);
    const after = movement.after_state;
    for (const c of after) {
      const old = before.get(c.id),
        prior = current.get(c.id) ?? null;
      if (!old) current.set(c.id, null);
      else if (c.quantity === 0) current.set(c.id, '0.0000');
      else if (old.quantity === c.quantity || movement.kind === 'open_blister')
        current.set(c.id, prior);
      else if (old.quantity > 0 && c.quantity < old.quantity)
        current.set(c.id, allocateCost(prior, [c.quantity, old.quantity - c.quantity])[0]);
      else if (old.quantity > 0 && prior !== null)
        current.set(c.id, new Decimal(prior).mul(c.quantity).div(old.quantity).toFixed(4));
      else {
        const basis = knownBasis.get(c.id);
        current.set(
          c.id,
          basis?.cost != null
            ? new Decimal(basis.cost)
                .mul(c.quantity)
                .div(basis.quantity)
                .toDecimalPlaces(4, Decimal.ROUND_DOWN)
                .toFixed(4)
            : null,
        );
      }
    }
    if (movement.kind === 'receipt')
      for (const c of after) current.set(c.id, c.quantity > 0 ? boxCost : '0.0000');
    // A dispatch can open and consume in one movement, so newly created dispatched blisters
    // participate in the allocation before their current cost is set to zero.
    const parents = new Set(
      after.filter((c) => c.kind === 'blister' && !before.has(c.id)).map((c) => c.parentId),
    );
    for (const parentId of parents) {
      if (!parentId) continue;
      const children = after.filter(
        (c) => c.kind === 'blister' && c.parentId === parentId && !before.has(c.id),
      );
      const shares = allocateCost(
        eventBefore.get(parentId) ?? null,
        children.map(() => 1),
      );
      children.forEach((c, i) => {
        knownBasis.set(c.id, { cost: shares[i], quantity: 1 });
        current.set(c.id, c.quantity > 0 ? shares[i] : '0.0000');
      });
    }
    if (movement.kind === 'fraction') {
      const source = movement.before_state.find((c) => c.quantity > 0);
      if (
        source &&
        movement.counted_before &&
        movement.delivered_pieces !== null &&
        movement.remaining_pieces !== null
      ) {
        const [prepared, rest] = allocateCost(eventBefore.get(source.id) ?? null, [
          movement.delivered_pieces,
          movement.remaining_pieces,
        ]);
        for (const c of after) {
          if (c.kind === 'half_box' && !before.has(c.id))
            current.set(c.id, c.quantity > 0 ? prepared : '0.0000');
          else if (c.unit === 'loose_piece') current.set(c.id, c.quantity > 0 ? rest : '0.0000');
        }
      }
    }
    if (movement.kind === 'reversal') {
      const restore = beforeEvents.get(movement.reversal_of ?? '');
      for (const c of after)
        current.set(c.id, c.quantity === 0 ? '0.0000' : (restore?.get(c.id) ?? null));
    }
    for (const c of after)
      if (c.quantity > 0) {
        const value = current.get(c.id) ?? null;
        knownBasis.set(c.id, { cost: value, quantity: c.quantity });
      }
  }
  return { current, beforeEvents };
}
