import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfficialRateCacheRow } from '../../apps/api/src/bcv-rate';
import {
  officialReferenceDisplay,
  type OfficialRateReference,
} from '../../apps/web/src/lib/official-rate-reference';
import { paymentChoiceUnavailable } from '../../apps/web/src/lib/sales-flow';

const query = vi.hoisted(() => vi.fn());
vi.mock('pg', () => ({
  Pool: class {
    on = vi.fn();
    query = query;
    end = vi.fn();
  },
}));
import { BcvService } from '../../apps/api/src/bcv.service';

const at = new Date('2026-11-07T18:00:00Z');
const row = (): OfficialRateCacheRow => ({
  id: '50000000-0000-4000-8000-000000000002',
  rate: '73.12500000',
  source: 'BCV',
  source_url: 'https://www.bcv.org.ve/',
  source_hash: 'b'.repeat(64),
  verified_by: 'synthetic-unit-test',
  valid_from: new Date('2026-11-06T04:00:00Z'),
  valid_until: new Date('2026-11-07T04:00:00Z'),
  fetched_at: new Date('2026-11-05T22:00:00Z'),
  verified_at: new Date('2026-11-05T22:01:00Z'),
});
beforeEach(() => query.mockReset());

describe('última BCV visible y separada del cobro', () => {
  it('entrega la referencia fechada sin habilitar VES ni cambiar el rateId del contrato', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [row()] })
      .mockResolvedValueOnce({ rows: [] });
    const status = await new BcvService().status(at);
    expect(status).toMatchObject({
      status: 'unavailable',
      rate: null,
      lastOfficial: { usage: 'display_only', rate: '73.12500000' },
    });
    expect(status.lastOfficial).not.toHaveProperty('id');
    const wire = JSON.parse(JSON.stringify(status));
    expect(officialReferenceDisplay(wire.lastOfficial, at)).toMatchObject({
      amount: '73,125',
      valueDate: '6/11/26',
      sourceUrl: 'https://www.bcv.org.ve/',
    });
    expect(
      paymentChoiceUnavailable('ves_bcv', 'bcv', {
        bcv: status.status === 'available' && !!status.rate,
        usdt: false,
      }),
    ).toContain('no disponible o vencida');
    expect(paymentChoiceUnavailable('usd_cash', 'bcv', { bcv: false, usdt: false })).toBeNull();
    expect(
      paymentChoiceUnavailable('usdt_transfer', 'bcv', { bcv: false, usdt: false }),
    ).toBeNull();
    expect(query.mock.calls.every((call) => !/insert|update|delete/i.test(String(call[0])))).toBe(
      true,
    );
  });

  it('una tasa vigente conserva su contrato y no consulta el fallback histórico', async () => {
    const current = { ...row(), valid_until: new Date('2026-11-09T04:00:00Z') };
    query.mockResolvedValueOnce({ rows: [current] }).mockResolvedValueOnce({ rows: [] });
    const service = new BcvService();
    const last = vi.spyOn(service, 'getLastOfficial');
    const status = await service.status(at);
    expect(status).toMatchObject({
      status: 'available',
      rate: { id: current.id, rate: current.rate },
    });
    expect(status).not.toHaveProperty('lastOfficial');
    expect(last).not.toHaveBeenCalled();
  });

  it('cache sin historia, fecha futura, conflicto o fallo de lectura no inventan referencia', async () => {
    const future = {
      ...row(),
      valid_from: new Date('2026-11-09T04:00:00Z'),
      valid_until: new Date('2026-11-10T04:00:00Z'),
    };
    for (const rows of [[], [future], [row(), { ...row(), rate: '74.00000000' }]]) {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows })
        .mockResolvedValueOnce({ rows: [] });
      expect(await new BcvService().status(at)).toMatchObject({
        status: 'unavailable',
        rate: null,
        lastOfficial: null,
      });
    }
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error('synthetic offline'))
      .mockResolvedValueOnce({ rows: [] });
    expect(await new BcvService().status(at)).toMatchObject({
      status: 'unavailable',
      rate: null,
      lastOfficial: null,
    });
  });

  it('la presentación rechaza fechas futuras y referencias mal verificadas sin volverlas vigentes', async () => {
    query.mockResolvedValueOnce({ rows: [row()] });
    const result = await new BcvService().getLastOfficial(at);
    const reference = JSON.parse(JSON.stringify(result)) as OfficialRateReference;
    for (const change of [
      { validFrom: '2026-11-09T04:00:00Z', validUntil: '2026-11-10T04:00:00Z' },
      { verifiedAt: '2026-11-08T04:00:00Z' },
      { sourceUrl: 'https://bcv.org.ve.evil.example/' },
      { sourceHash: 'bad' },
      { rate: '0' },
      { usage: 'payment' },
    ]) {
      expect(
        officialReferenceDisplay({ ...reference, ...change } as OfficialRateReference, at),
      ).toBeNull();
    }
    expect(officialReferenceDisplay(null, at)).toBeNull();
  });
});
