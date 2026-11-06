import { describe, expect, it } from 'vitest';
import {
  simpleReceiptSchema,
  quickReceiptSchema,
  type ContainerStock,
} from '../../packages/domain/src/inventory';
import {
  allocateCost,
  replayLegacyCosts,
  type CostReplayMovement,
} from '../../packages/domain/src/costing';

const product = {
  templateId: 'apple_traditional',
  templateVersion: 'v4.5',
  varietyName: 'Gala',
  caliberLabel: '100',
};
const line = { product, boxes: 2 };
const request = { schemaVersion: 3, lines: [line] };
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
  costUsd: null,
};

describe('recepción V4.5 sin costos ni listas', () => {
  it('admite cinco productos sin inventar proveedor, referencia, costo, precios o fecha cliente', () => {
    const parsed = simpleReceiptSchema.parse({
      ...request,
      lines: Array.from({ length: 5 }, () => line),
    });
    expect(parsed).toMatchObject({
      schemaVersion: 3,
      supplierId: null,
      reference: null,
      notes: '',
      isDemo: false,
    });
    expect(parsed).not.toHaveProperty('receivedAt');
    expect(parsed.lines).toHaveLength(5);
    for (const received of parsed.lines) {
      expect(received).not.toHaveProperty('cost');
      expect(received).not.toHaveProperty('unitCostUsd');
      expect(received).not.toHaveProperty('prices');
      expect(received).not.toHaveProperty('priceAction');
    }
  });
  it.each([
    { cost: { kind: 'entered', accepted: true, unitCostUsd: '0' } },
    { unitCostUsd: '25' },
    { priceAction: 'update' },
    { prices: [] },
  ])('rechaza campos de costo/listas inyectados %j', (extra) => {
    expect(
      simpleReceiptSchema.safeParse({ ...request, lines: [{ ...line, ...extra }] }).success,
    ).toBe(false);
  });
  it('mantiene parser V2 con costo positivo y aceptación explícita para compatibilidad', () => {
    const parsed = quickReceiptSchema.parse({
      schemaVersion: 2,
      lines: [
        {
          ...line,
          product: { ...product, templateVersion: 'v4.2' },
          cost: { kind: 'entered', unitCostUsd: '25', accepted: true },
        },
      ],
    });
    expect(parsed.lines[0].cost.unitCostUsd).toBe('25.0000');
    expect(parsed.lines[0].priceAction).toBe('keep');
  });
  it('no convierte un costo desconocido en cero al abrir o preparar medias', () => {
    expect(allocateCost(null, [1, 1, 1, 1])).toEqual([null, null, null, null]);
    expect(allocateCost(null, [18, 19])).toEqual([null, null]);
    expect(allocateCost('25.0000', [1, 1, 1])).toEqual(['8.3333', '8.3333', '8.3334']);
  });
  it('replay mantiene desconocido sobre existencia activa y conserva conocido en el mismo algoritmo', () => {
    const receipt: CostReplayMovement = {
      id: 'receipt',
      kind: 'receipt',
      reversal_of: null,
      before_state: [],
      after_state: [box],
      counted_before: null,
      delivered_pieces: null,
      remaining_pieces: null,
    };
    expect(replayLegacyCosts([receipt], null).current.get(box.id)).toBeNull();
    expect(replayLegacyCosts([receipt], '25.0000').current.get(box.id)).toBe('25.0000');
  });
  it('la unidad comercial explícita es indivisible; no admite etiqueta sobre una media o un peso inventado', () => {
    const packing = {
      confirmed: true,
      packingModel: 'whole',
      halfPreparation: 'none',
      allowedPresentations: ['box'],
      blistersPerBox: null,
      boxWeightKg: null,
      commercialUnitLabel: 'Envase recibido',
    };
    expect(
      simpleReceiptSchema.parse({ ...request, lines: [{ ...line, packing }] }).lines[0].packing
        ?.commercialUnitLabel,
    ).toBe('Envase recibido');
    expect(
      simpleReceiptSchema.safeParse({
        ...request,
        lines: [{ ...line, packing: { ...packing, boxWeightKg: '10' } }],
      }).success,
    ).toBe(false);
    expect(
      simpleReceiptSchema.safeParse({
        ...request,
        lines: [{ ...line, packing: { ...packing, commercialUnitLabel: '' } }],
      }).success,
    ).toBe(false);
  });
});
