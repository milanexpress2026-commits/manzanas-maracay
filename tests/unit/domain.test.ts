import { describe, it, expect } from 'vitest';
import {
  sellIntactBlisters,
  countSellableBlisters,
  fractionByActualCount,
  resolvePackaging,
  negotiatedLine,
  paymentVesToUsd,
  configurationSchema,
  caliberSchema,
  UnconfiguredBcvProvider,
} from '../../packages/domain/src/index';
describe('inventario: modelo previo a implementar movimientos', () => {
  it('tres cajas de cinco blíster menos uno vendido dejan dos cajas y cuatro blíster', () => {
    const result = sellIntactBlisters({ closedBoxes: 3, openBoxes: 0, intactBlisters: 0 }, 5, 1);
    expect(result).toEqual({ closedBoxes: 2, openBoxes: 1, intactBlisters: 4 });
    expect(countSellableBlisters(result, 5)).toBe(14);
  });
  it('usa blíster ya disponibles antes de abrir otra caja', () => {
    expect(sellIntactBlisters({ closedBoxes: 2, openBoxes: 1, intactBlisters: 4 }, 5, 3)).toEqual({
      closedBoxes: 2,
      openBoxes: 1,
      intactBlisters: 1,
    });
  });
  it('rechaza existencia insuficiente y cantidades fraccionarias', () => {
    expect(() =>
      sellIntactBlisters({ closedBoxes: 0, openBoxes: 0, intactBlisters: 1 }, 5, 2),
    ).toThrow();
    expect(() =>
      sellIntactBlisters({ closedBoxes: 1, openBoxes: 0, intactBlisters: 0 }, 5, 1.5),
    ).toThrow();
  });
  it('conserva fruta al preparar medias cajas por conteo físico', () => {
    expect(
      fractionByActualCount({ countedBefore: 37, delivered: 18, remaining: 19 }).remaining,
    ).toBe(19);
    expect(() =>
      fractionByActualCount({ countedBefore: 37, delivered: 18, remaining: 20 }),
    ).toThrow();
  });
  it('acepta sobrescritura del empaque por lote', () => {
    expect(resolvePackaging(5, 6)).toBe(6);
    expect(resolvePackaging(4)).toBe(4);
    expect(() => resolvePackaging(5, 0)).toThrow();
  });
  it('admite calibres de texto independientes del contenido', () => {
    const fruitId = 'ed4f6587-9536-4fbc-92f4-3c0f9d692195';
    expect(caliberSchema.parse({ fruitId, label: '70/75' }).label).toBe('70/75');
    expect(
      configurationSchema.parse({
        fruitId,
        varietyId: fruitId,
        caliberId: fruitId,
        blistersPerBox: 7,
      }).blistersPerBox,
    ).toBe(7);
  });
});
describe('precios y BCV: reglas de dominio sin facturación', () => {
  it('preserva precio original y pactado sin modificar catálogo', () => {
    expect(negotiatedLine('40', '38', 5)).toEqual({
      referenceUnitUsd: '40.0000',
      agreedUnitUsd: '38.0000',
      totalUsd: '190.00',
      discountUsd: '10.00',
    });
  });
  it('realiza aritmética decimal exacta', () => {
    expect(negotiatedLine('0.1', '0.1', 3).totalUsd).toBe('0.30');
  });
  const at = new Date('2026-11-04T12:00:00Z');
  const rate = {
    source: 'BCV' as const,
    rate: '10.00000000',
    verifiedAt: new Date('2026-11-04T10:00:00Z'),
    validFrom: new Date('2026-11-04T00:00:00Z'),
    validUntil: new Date('2026-11-05T00:00:00Z'),
  };
  it('convierte solo con tasa verificada; valores exclusivamente sintéticos de prueba', () => {
    expect(paymentVesToUsd('1900.00', rate, at)).toBe('190.00');
  });
  it('rechaza tasas vencidas, futuras, inválidas o no oficiales', () => {
    expect(() => paymentVesToUsd('100', rate, rate.validUntil)).toThrow();
    expect(() =>
      paymentVesToUsd('100', { ...rate, verifiedAt: new Date('2026-11-05') }, at),
    ).toThrow();
    expect(() => paymentVesToUsd('100', { ...rate, rate: '0' }, at)).toThrow();
    expect(() => paymentVesToUsd('100', { ...rate, source: 'parallel' as 'BCV' }, at)).toThrow();
  });
  it('no inventa tasas cuando el proveedor no está configurado', async () => {
    expect(await new UnconfiguredBcvProvider().getVerifiedRate()).toBeNull();
  });
});
