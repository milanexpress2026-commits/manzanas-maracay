import { describe, expect, it } from 'vitest';
import { replayLegacyCosts, type CostReplayMovement } from '../../packages/domain/src/costing';
import type { ContainerStock } from '../../packages/domain/src/inventory';

const box: ContainerStock = {
  id: 'box',
  lotId: 'lot',
  warehouseId: 'warehouse',
  parentId: null,
  kind: 'box',
  state: 'sealed',
  unit: 'sealed_box',
  quantity: 1,
  countedPieces: null,
  version: 1,
};
const openBox: ContainerStock = { ...box, state: 'open', quantity: 0 };
const blister: ContainerStock = {
  ...box,
  id: 'first',
  parentId: box.id,
  kind: 'blister',
  unit: 'intact_blister',
};
const sibling: ContainerStock = { ...blister, id: 'second' };
function movement(
  id: string,
  kind: string,
  before: ContainerStock[],
  after: ContainerStock[],
): CostReplayMovement {
  return {
    id,
    kind,
    before_state: before,
    after_state: after,
    reversal_of: null,
    counted_before: null,
    delivered_pieces: null,
    remaining_pieces: null,
  };
}

/**
 * Phase 2 (f9b532b) adjusted state.get(containerId), including empty containers.
 * The other sealed blister keeps the parent box open throughout; therefore
 * restoring this emptied loose-piece blister satisfies the physical parent rule.
 * Phase 3 may reject new restorations, but must still replay valid old history.
 */
function legacyRestoration(pieceCount: number, restoredCount: number) {
  const loose: ContainerStock = {
    ...blister,
    state: 'open',
    unit: 'loose_piece',
    quantity: pieceCount,
    countedPieces: pieceCount,
  };
  const emptied: ContainerStock = { ...loose, state: 'empty', quantity: 0, countedPieces: 0 };
  const restored: ContainerStock = {
    ...loose,
    quantity: restoredCount,
    countedPieces: restoredCount,
  };
  return [
    movement('receipt', 'receipt', [], [box]),
    movement('opening', 'open_box', [box], [openBox, blister, sibling]),
    movement('counting', 'open_blister', [blister], [loose]),
    movement('emptying', 'adjustment', [loose], [emptied]),
    movement('restoring', 'adjustment', [emptied], [restored]),
  ];
}

describe('reconstrucción del costo de movimientos válidos de fase 2', () => {
  it('valora todas las piezas restauradas, no solo una pieza', () => {
    const { current } = replayLegacyCosts(legacyRestoration(10, 5), '20.0000');
    expect(current.get('first')).toBe('5.0000');
    expect(current.get('second')).toBe('10.0000');
    expect(current.get('box')).toBe('0.0000');
  });

  it('conserva el costo completo al restaurar el conteo original sin redondear primero el costo unitario', () => {
    const { current } = replayLegacyCosts(legacyRestoration(30, 30), '20.0000');
    expect(current.get('first')).toBe('10.0000');
    expect(current.get('second')).toBe('10.0000');
  });

  it('una reversa de la restauración recupera cero sin modificar el otro blíster', () => {
    const history = legacyRestoration(10, 5);
    const restore = history[history.length - 1];
    history.push({
      ...movement('reverse-restoring', 'reversal', restore.after_state, restore.before_state),
      reversal_of: restore.id,
    });
    const { current, beforeEvents } = replayLegacyCosts(history, '20.0000');
    expect(beforeEvents.get('reverse-restoring')?.get('first')).toBe('5.0000');
    expect(current.get('first')).toBe('0.0000');
    expect(current.get('second')).toBe('10.0000');
  });
});
