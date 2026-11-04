import { describe, expect, it } from 'vitest';
import {
  costSchema,
  receiptSchema,
  prepareHalfSchema,
  adjustmentSchema,
  summarizeContainers,
  type ContainerStock,
} from '../../packages/domain/src/inventory';

const id = '5dc9b831-9d25-445e-af9e-732c84d44e1d';
const box: ContainerStock = {
  id,
  lotId: id,
  warehouseId: id,
  parentId: null,
  kind: 'box',
  state: 'sealed',
  unit: 'sealed_box',
  quantity: 1,
  countedPieces: null,
  version: 1,
};
describe('contratos de inventario físico', () => {
  it('mantiene costo decimal exacto y rechaza flotantes JSON o exceso de precisión', () => {
    expect(costSchema.parse('0.1')).toBe('0.1000');
    expect(() => costSchema.parse(0.1)).toThrow();
    expect(() => costSchema.parse('1.12345')).toThrow();
  });
  it('recibe cajas sin deducir cantidades de fruta ni aceptar campos fuera de contrato', () => {
    const input = {
      supplierId: id,
      reference: 'DEMO',
      receivedAt: '2026-11-04T12:00:00Z',
      lines: [{ configurationId: id, boxes: 3, unitCostUsd: '1.00' }],
    };
    expect(receiptSchema.parse(input).lines[0].boxes).toBe(3);
    expect(() =>
      receiptSchema.parse({ ...input, lines: [{ ...input.lines[0], countedPieces: 180 }] }),
    ).toThrow();
    expect(() =>
      receiptSchema.parse({ ...input, lines: [{ ...input.lines[0], boxes: 0.5 }] }),
    ).toThrow();
  });
  it('valida 37 = 18 + 19 sin medias unidades ni supuestos de calibre', () => {
    const input = {
      containerId: id,
      reason: 'Conteo físico de prueba',
      countedBefore: 37,
      preparedPieces: 18,
      remainingPieces: 19,
    };
    expect(prepareHalfSchema.parse(input).remainingPieces).toBe(19);
    expect(() => prepareHalfSchema.parse({ ...input, remainingPieces: 20 })).toThrow();
    expect(() =>
      prepareHalfSchema.parse({ ...input, preparedPieces: 18.5, remainingPieces: 18.5 }),
    ).toThrow();
  });
  it('exige motivo y variación real para ajustes', () => {
    expect(() =>
      adjustmentSchema.parse({ containerId: id, reason: 'x', quantityDelta: -1 }),
    ).toThrow();
    expect(() =>
      adjustmentSchema.parse({ containerId: id, reason: 'Conteo físico', quantityDelta: 0 }),
    ).toThrow();
  });
  it('suma empaques intactos y piezas conocidas en categorías separadas', () => {
    const containers: ContainerStock[] = [
      box,
      { ...box, id: 'box2' },
      { ...box, id: 'open', state: 'open', quantity: 0 },
      { ...box, id: 'b1', parentId: 'open', kind: 'blister', unit: 'intact_blister' },
      { ...box, id: 'b2', parentId: 'open', kind: 'blister', unit: 'intact_blister' },
      { ...box, id: 'b3', parentId: 'open', kind: 'blister', unit: 'intact_blister' },
      { ...box, id: 'b4', parentId: 'open', kind: 'blister', unit: 'intact_blister' },
      { ...box, id: 'half', kind: 'half_box', unit: 'prepared_half_box', countedPieces: 18 },
      {
        ...box,
        id: 'loose',
        kind: 'loose_bin',
        state: 'open',
        unit: 'loose_piece',
        quantity: 19,
        countedPieces: 19,
      },
      { ...box, id: 'empty', state: 'empty', quantity: 0 },
    ];
    expect(summarizeContainers(containers, 5)).toEqual({
      closedBoxes: 2,
      openBoxes: 1,
      intactBlisters: 4,
      openBlisters: 0,
      preparedHalfBoxes: 1,
      preparedPieces: 18,
      loosePieces: 19,
      equivalentIntactBlisters: 14,
    });
    expect(box.countedPieces).toBeNull();
  });
});
