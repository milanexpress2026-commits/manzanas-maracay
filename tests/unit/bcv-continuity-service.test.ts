import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BCV_SOURCE_URL,
  planBcvContinuity,
  type BcvObservation,
} from '../../packages/domain/src/rate-sources';
const query = vi.hoisted(() => vi.fn());
vi.mock('pg', () => ({
  Pool: class {
    on = vi.fn();
    query = query;
    end = vi.fn();
  },
}));
import { BcvService } from '../../apps/api/src/bcv.service';
const at = new Date('2026-11-07T14:00:00Z');
const parent: BcvObservation = {
  id: '50000000-0000-4000-8000-000000000001',
  rate: '896.12250000',
  source: 'BCV',
  source_url: BCV_SOURCE_URL,
  source_hash: 'a'.repeat(64),
  valid_from: new Date('2026-11-06T04:00:00Z'),
  valid_until: new Date('2026-11-07T04:00:00Z'),
  fetched_at: new Date('2026-11-05T22:00:00Z'),
  verified_at: new Date('2026-11-05T22:00:01Z'),
  verified_by: 'automatic-strict-tls-v1',
};
const next: BcvObservation = {
  ...parent,
  id: '50000000-0000-4000-8000-000000000002',
  rate: '897.53830000',
  source_hash: 'b'.repeat(64),
  valid_from: new Date('2026-11-09T04:00:00Z'),
  valid_until: new Date('2026-11-10T04:00:00Z'),
};
const row: BcvObservation = {
  ...planBcvContinuity(
    parent,
    next,
    {
      rate: next.rate,
      source: 'BCV',
      sourceUrl: BCV_SOURCE_URL,
      validFrom: next.valid_from,
      validUntil: next.valid_until,
    },
    at,
    at,
  )!,
  id: '50000000-0000-4000-8000-000000000003',
};
beforeEach(() => query.mockReset());

describe('proveedor privado de continuidad BCV', () => {
  it('status devuelve fecha oficial original y consulta los dos padres con parámetros', async () => {
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [parent, next] })
      .mockResolvedValueOnce({ rows: [] });
    const status = await new BcvService().status(at);
    expect(status).toMatchObject({
      status: 'available',
      rate: {
        id: row.id,
        officialValueDate: '2026-11-06',
        validFrom: row.valid_from,
        fetchedAt: parent.fetched_at,
      },
    });
    expect(query.mock.calls[1]?.[1]).toEqual([[parent.id, next.id]]);
  });

  it('lectura histórica conserva fecha valor y no entrega un identificador de pago', async () => {
    query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: [parent, next] });
    const reference = await new BcvService().getLastOfficial(new Date('2026-11-10T13:00:00Z'));
    expect(reference).toMatchObject({ usage: 'display_only', officialValueDate: '2026-11-06' });
    expect(reference).not.toHaveProperty('id');
  });

  it.each([
    { parents: [] },
    { parents: [parent] },
    { parents: [parent, { ...next, rate: '0.00000000' }] },
  ])('padre ausente o corrupto bloquea el ID %j', async ({ parents }) => {
    query.mockResolvedValueOnce({ rows: [row] }).mockResolvedValueOnce({ rows: parents });
    expect(await new BcvService().getById(row.id, at)).toBeNull();
  });

  it('error leyendo la evidencia enlazada falla cerrado y no escribe', async () => {
    query
      .mockResolvedValueOnce({ rows: [row] })
      .mockRejectedValueOnce(new Error('synthetic offline'));
    expect(await new BcvService().getCurrent(at)).toBeNull();
    expect(query.mock.calls.every((call) => /^select/.test(String(call[0]).trim()))).toBe(true);
  });
});
