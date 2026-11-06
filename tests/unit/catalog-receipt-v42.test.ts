import { describe, it, expect, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  CATALOG_TEMPLATES,
  habitualPacking,
  type ReceiptPacking,
} from '../../packages/domain/src/index';
import { resolveReceiptProduct, type ReceiptRule } from '../../apps/api/src/catalog-receipt';
const id = '00000000-0000-4000-8000-000000000001';
const rule: ReceiptRule = {
  id,
  variant_id: id,
  version: 1,
  confirmation_status: 'pending',
  packing_model: 'blister',
  half_preparation: 'pending',
  allowed_presentations: ['box', 'blister'],
  blisters_per_box: null,
  box_weight_kg: null,
  fruit: 'Manzana',
  variety: 'Gala',
  caliber: '100',
  commercial_line: 'Tradicional',
};
const product = { configurationId: id, expectedPackingVersion: 1 };
const packing = {
  packingModel: 'blister' as const,
  halfPreparation: 'pending' as const,
  allowedPresentations: ['box', 'blister'] as ('box' | 'blister')[],
  blistersPerBox: 5,
  boxWeightKg: null,
};
describe('materializador transaccional de recepción V4.2', () => {
  it.each([
    ['kiwi', { boxWeightKg: '11' }],
    ['kiwi', { allowedPresentations: ['box'] }],
    ['apple_bulk', { packingModel: 'blister', blistersPerBox: 4, halfPreparation: 'counted' }],
    ['apple_bulk', { boxWeightKg: '10' }],
    [
      'grape',
      {
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
      },
    ],
    ['grape', { boxWeightKg: '10' }],
    [
      'apple_traditional',
      {
        packingModel: 'whole',
        halfPreparation: 'none',
        blistersPerBox: null,
        allowedPresentations: ['box'],
      },
    ],
    [
      'pear',
      {
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
      },
    ],
  ] as const)(
    'rechaza capacidades manipuladas en pendiente %s antes de escribir',
    async (templateId, change) => {
      const template = CATALOG_TEMPLATES.find((t) => t.id === templateId)!;
      const pending = {
        ...rule,
        fruit: template.fruitName,
        commercial_line: template.commercialLine,
      };
      const selected = {
        ...habitualPacking(template, rule.variety, rule.caliber)!,
        ...change,
      } as ReceiptPacking;
      const query = vi.fn().mockResolvedValue({ rows: [pending] });
      await expect(
        resolveReceiptProduct({ query } as unknown as PoolClient, product, selected, id, id),
      ).rejects.toThrow('empaque habitual');
      expect(query.mock.calls.every(([sql]) => sql.startsWith('select '))).toBe(true);
    },
  );
  it.each([
    ['kiwi', null, null, { boxWeightKg: '11' }],
    [
      'apple_bulk',
      null,
      '232',
      { packingModel: 'blister', halfPreparation: 'counted', blistersPerBox: 5 },
    ],
    [
      'grape',
      'Roja',
      null,
      {
        packingModel: 'halves',
        halfPreparation: 'commercial',
        allowedPresentations: ['box', 'half_box'],
      },
    ],
  ] as const)(
    'rechaza empaque virtual %s antes de materializar ningún maestro',
    async (templateId, varietyName, caliberLabel, change) => {
      const template = CATALOG_TEMPLATES.find((t) => t.id === templateId)!;
      const selected = {
        ...habitualPacking(template, varietyName, caliberLabel)!,
        ...change,
      } as ReceiptPacking;
      const query = vi.fn().mockResolvedValue({ rows: [] });
      await expect(
        resolveReceiptProduct(
          { query } as unknown as PoolClient,
          { templateId, templateVersion: 'v4.2', varietyName, caliberLabel },
          selected,
          id,
          id,
        ),
      ).rejects.toThrow('empaque habitual');
      expect(query.mock.calls.every(([sql]) => sql.startsWith('select '))).toBe(true);
    },
  );
  it('preserva un Kiwi confirmado histórico de otro peso sin actualizar ni reinterpretar lotes', async () => {
    const confirmed: ReceiptRule = {
      ...rule,
      fruit: 'Kiwi',
      commercial_line: 'Caja 10 kg',
      packing_model: 'halves',
      half_preparation: 'commercial',
      allowed_presentations: ['box', 'half_box'],
      confirmation_status: 'confirmed',
      box_weight_kg: '11.000',
      variety: null,
      caliber: null,
    };
    const query = vi.fn().mockResolvedValue({ rows: [confirmed] });
    expect(
      await resolveReceiptProduct({ query } as unknown as PoolClient, product, undefined, id, id),
    ).toEqual(confirmed);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]![0]).toMatch(/^select /);
  });
  it('rechaza versión obsoleta antes de cualquier mutación', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [{ ...rule, version: 2 }] });
    await expect(
      resolveReceiptProduct({ query } as unknown as PoolClient, product, undefined, id, id),
    ).rejects.toThrow('versión actual');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('un cambio de conteo habitual exige override por lote y no actualiza la regla', async () => {
    const query = vi.fn().mockResolvedValueOnce({ rows: [rule] });
    await expect(
      resolveReceiptProduct({ query } as unknown as PoolClient, product, packing, id, id),
    ).rejects.toThrow('excepción de este lote');
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('configuración confirmada distinta se conserva sin reescribir futuros lotes', async () => {
    const confirmed = { ...rule, confirmation_status: 'confirmed', blisters_per_box: 5 };
    const query = vi.fn().mockResolvedValue({ rows: [confirmed] });
    expect(
      await resolveReceiptProduct({ query } as unknown as PoolClient, product, undefined, id, id),
    ).toEqual(confirmed);
    await expect(
      resolveReceiptProduct(
        { query } as unknown as PoolClient,
        product,
        { ...packing, blistersPerBox: 4 },
        id,
        id,
      ),
    ).rejects.toThrow('excepción de blíster');
    expect(query.mock.calls.every(([sql]) => sql.startsWith('select '))).toBe(true);
  });
  it('pera confirma solo caja sin inventar conteos y audita usando el mismo cliente', async () => {
    const pear = {
      ...rule,
      fruit: 'Pera',
      variety: 'Packcam',
      caliber: '80',
      allowed_presentations: ['box'],
    };
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [pear] })
      .mockResolvedValueOnce({ rows: [{ ...pear, confirmation_status: 'confirmed', version: 2 }] })
      .mockResolvedValueOnce({ rows: [] });
    const result = await resolveReceiptProduct(
      { query } as unknown as PoolClient,
      product,
      undefined,
      id,
      id,
    );
    expect(result).toMatchObject({
      confirmation_status: 'confirmed',
      blisters_per_box: null,
      allowed_presentations: ['box'],
      half_preparation: 'pending',
      version: 2,
    });
    expect(query.mock.calls[1]![1]).toEqual([id, 'blister', 'pending', ['box'], null, null]);
    expect(query.mock.calls[2]![0]).toContain('insert into audit_events');
  });
});
