import { describe, expect, it } from 'vitest';
import {
  readOfficialRate,
  selectOfficialRate,
  selectLastOfficialRate,
  type OfficialRateCacheRow,
} from '../../apps/api/src/bcv-rate';
import { paymentVesToUsd } from '../../packages/domain/src/index';

// Synthetic test-only source metadata; never inserted by a seed or provider.
const fixture = (): OfficialRateCacheRow => ({
  id: '50000000-0000-4000-8000-000000000001',
  rate: '50.00000000',
  source: 'BCV',
  source_url: 'https://www.bcv.org.ve/',
  source_hash: 'a'.repeat(64),
  verified_by: 'synthetic-unit-test',
  valid_from: new Date('2026-11-04T04:00:00Z'),
  valid_until: new Date('2026-11-05T04:00:00Z'),
  fetched_at: new Date('2026-11-03T22:00:00Z'),
  verified_at: new Date('2026-11-03T22:01:00Z'),
});
const at = new Date('2026-11-04T18:00:00Z');

describe('caché BCV oficial con cierre seguro', () => {
  it('conserva identidad, hash y metadatos del registro vigente', () => {
    const row = fixture();
    const rate = selectOfficialRate([row], at);
    expect(rate).toMatchObject({
      id: row.id,
      rate: '50.00000000',
      sourceUrl: row.source_url,
      sourceHash: row.source_hash,
    });
    expect(rate?.validUntil).toEqual(row.valid_until);
    expect(rate?.validUntil).not.toBe(row.valid_until);
  });

  it('rechaza ausente, duplicada, futura y vencida sin tomar la última conocida', () => {
    expect(selectOfficialRate([], at)).toBeNull();
    expect(selectOfficialRate([fixture(), fixture()], at)).toBeNull();
    expect(selectOfficialRate([fixture()], new Date('2026-11-04T03:59:59.999Z'))).toBeNull();
    expect(selectOfficialRate([fixture()], new Date('2026-11-05T04:00:00Z'))).toBeNull();
    expect(selectOfficialRate([fixture()], new Date('2026-11-04T04:00:00Z'))).not.toBeNull();
  });

  it('interpreta el cambio de día comercial Caracas por instantes explícitos', () => {
    const old = fixture();
    const next = {
      ...fixture(),
      valid_from: new Date('2026-11-05T04:00:00Z'),
      valid_until: new Date('2026-11-06T04:00:00Z'),
    };
    const midnight = new Date('2026-11-05T00:00:00-04:00');
    expect(selectOfficialRate([old], midnight)).toBeNull();
    expect(selectOfficialRate([next], midnight)).not.toBeNull();
  });

  it.each([
    'https://bcv.org.ve.evil.example/',
    'http://www.bcv.org.ve/',
    'https://evil.example/',
    'https://user:password@bcv.org.ve/',
    'https://bcv.org.ve:8443/',
  ])('rechaza fuente no oficial o insegura %s', (source_url) => {
    expect(selectOfficialRate([{ ...fixture(), source_url }], at)).toBeNull();
  });

  it.each(['0', '-1', 'NaN', 'Infinity', '50,25', '1e2', '2.123456789'])(
    'rechaza tasa inválida %s',
    (rate) => {
      expect(selectOfficialRate([{ ...fixture(), rate }], at)).toBeNull();
    },
  );

  it('rechaza verificación futura, anterior a consulta, sin verificador o hash', () => {
    expect(
      selectOfficialRate([{ ...fixture(), verified_at: new Date('2026-11-04T19:00:00Z') }], at),
    ).toBeNull();
    expect(
      selectOfficialRate([{ ...fixture(), fetched_at: new Date('2026-11-04T01:00:00Z') }], at),
    ).toBeNull();
    expect(selectOfficialRate([{ ...fixture(), verified_by: '' }], at)).toBeNull();
    expect(selectOfficialRate([{ ...fixture(), source_hash: 'not-a-hash' }], at)).toBeNull();
    expect(selectOfficialRate([{ ...fixture(), valid_from: new Date('invalid') }], at)).toBeNull();
    expect(selectOfficialRate([fixture()], new Date('invalid'))).toBeNull();
  });

  it('caída de caché retorna no disponible sin tasa de prueba ni consulta alternativa', async () => {
    expect(
      await readOfficialRate(async () => {
        throw new Error('offline');
      }, at),
    ).toBeNull();
    expect(await readOfficialRate(async () => [], at)).toBeNull();
  });

  it('convierte VES decimales con la tasa seleccionada y redondeo explícito', () => {
    const rate = selectOfficialRate([fixture()], at)!;
    const later = selectOfficialRate([{ ...fixture(), rate: '60.00000000' }], at)!;
    expect(paymentVesToUsd('1234.56', rate, at)).toBe('24.69');
    expect(paymentVesToUsd('1234.56', later, at)).toBe('20.58');
    expect(() => paymentVesToUsd('100', rate, rate.validUntil)).toThrow();
  });

  it('permite mostrar una oficial histórica sin convertirla en una tasa de pago', () => {
    const after = new Date('2026-11-07T18:00:00Z');
    const row = fixture();
    const reference = selectLastOfficialRate([row], after);
    expect(reference).toMatchObject({
      usage: 'display_only',
      rate: row.rate,
      sourceHash: row.source_hash,
      validFrom: row.valid_from,
      verifiedAt: row.verified_at,
    });
    expect(reference).not.toHaveProperty('id');
    expect(selectOfficialRate([row], after)).toBeNull();
    expect(() => paymentVesToUsd('100', reference!, after)).toThrow();
    expect(reference?.validFrom).not.toBe(row.valid_from);
  });

  it('la referencia histórica también rechaza futura, vacía o ambigua', () => {
    const future = {
      ...fixture(),
      valid_from: new Date('2026-11-09T04:00:00Z'),
      valid_until: new Date('2026-11-10T04:00:00Z'),
    };
    const after = new Date('2026-11-07T18:00:00Z');
    expect(selectLastOfficialRate([future], after)).toBeNull();
    expect(selectLastOfficialRate([], after)).toBeNull();
    expect(selectLastOfficialRate([fixture(), fixture()], after)).toBeNull();
    expect(
      selectLastOfficialRate([fixture(), { ...fixture(), rate: '51.00000000' }], after),
    ).toBeNull();
    expect(selectLastOfficialRate([fixture()], new Date('invalid'))).toBeNull();
  });

  it.each([
    { source: 'OTHER' },
    { source_url: 'https://bcv.org.ve.evil.example/' },
    { source_url: 'https://user:pass@bcv.org.ve/' },
    { source_hash: 'not-a-hash' },
    { rate: 'NaN' },
    { rate: '0' },
    { verified_by: '' },
    { verified_at: new Date('2026-11-08T04:00:00Z') },
    { fetched_at: new Date('2026-11-04T04:00:00Z') },
    { valid_until: new Date('2026-11-04T04:00:00Z') },
  ])('no presenta como oficial una referencia inválida %#', (change) => {
    expect(
      selectLastOfficialRate([{ ...fixture(), ...change }], new Date('2026-11-07T18:00:00Z')),
    ).toBeNull();
  });
});
