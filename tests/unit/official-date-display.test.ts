import { expect, it } from 'vitest';
import {
  officialRateValueDate,
  officialReferenceDisplay,
  type OfficialRateReference,
} from '../../apps/web/src/lib/official-rate-reference';

it('conserva el viernes oficial durante un intervalo técnico del sábado al lunes', () => {
  const reference: OfficialRateReference = {
    usage: 'display_only',
    source: 'BCV',
    rate: '73.12500000',
    sourceUrl: 'https://www.bcv.org.ve/',
    sourceHash: 'b'.repeat(64),
    validFrom: '2026-11-07T04:00:00Z',
    validUntil: '2026-11-09T04:00:00Z',
    officialValueDate: '2026-11-06',
    fetchedAt: '2026-11-07T04:01:00Z',
    verifiedAt: '2026-11-07T04:01:00Z',
  };
  const shown = officialReferenceDisplay(reference, new Date('2026-11-10T04:00:00Z'));
  expect(shown?.valueDate).toBe('6/11/26');
  expect(shown).not.toHaveProperty('id');
  expect(officialRateValueDate(reference.validFrom)?.toISOString()).toBe(
    '2026-11-07T04:00:00.000Z',
  );
  for (const officialValueDate of [
    '2026-11-09',
    '2026-02-30',
    '06/11/2026',
    '',
    '2026-11-06T04:00:00Z',
  ])
    expect(
      officialReferenceDisplay(
        { ...reference, officialValueDate },
        new Date('2026-11-10T04:00:00Z'),
      ),
    ).toBeNull();
});
