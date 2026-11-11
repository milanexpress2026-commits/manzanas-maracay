import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  selectOfficialRate,
  selectSaleDateOfficialRate,
  type OfficialRateCacheRow,
} from '../../apps/api/src/bcv-rate';
import { composeSalePdf } from '../../apps/api/src/commerce-pdf';
import { pdfSaleFixture } from '../fixtures/commerce-pdf';
const query = vi.hoisted(() => vi.fn());
vi.mock('pg', () => ({
  Pool: class {
    on = vi.fn();
    query = query;
    end = vi.fn();
  },
}));
import { BcvService } from '../../apps/api/src/bcv.service';

const soldAt = new Date('2026-11-05T15:15:30Z');
const printedAt = new Date('2026-11-11T15:00:00Z');
const row = (): OfficialRateCacheRow => ({
  id: '50000000-0000-4000-8000-000000000414',
  rate: '45.12345678',
  source: 'BCV',
  source_url: 'https://www.bcv.org.ve/',
  source_hash: 'a'.repeat(64),
  verified_by: 'synthetic-unit-test',
  valid_from: new Date('2026-11-05T04:00:00Z'),
  valid_until: new Date('2026-11-06T04:00:00Z'),
  fetched_at: new Date('2026-11-04T22:00:00Z'),
  verified_at: new Date('2026-11-04T22:00:01Z'),
});
beforeEach(() => query.mockReset());
describe('BCV de la fecha de venta en documentos', () => {
  it('reimprime una tasa histórica sin convertirla en autorización para cobrar hoy', () => {
    const reference = selectSaleDateOfficialRate([row()], soldAt, printedAt);
    expect(reference).toMatchObject({
      usage: 'display_only',
      rate: '45.12345678',
      officialValueDate: '2026-11-05',
    });
    expect(reference).not.toHaveProperty('id');
    expect(selectOfficialRate([row()], printedAt)).toBeNull();
  });
  it('admite evidencia oficial de ese día consultada después de registrar la venta', () => {
    const later = {
      ...row(),
      fetched_at: new Date('2026-11-05T18:00:00Z'),
      verified_at: new Date('2026-11-05T18:00:01Z'),
    };
    expect(selectSaleDateOfficialRate([later], soldAt, printedAt)?.rate).toBe(later.rate);
    expect(selectSaleDateOfficialRate([later], soldAt, soldAt)).toBeNull();
  });
  it('rechaza falta de evidencia, solapamiento y fechas ajenas a la venta', () => {
    expect(selectSaleDateOfficialRate([], soldAt, printedAt)).toBeNull();
    expect(selectSaleDateOfficialRate([row(), row()], soldAt, printedAt)).toBeNull();
    expect(
      selectSaleDateOfficialRate([row()], new Date('2026-11-05T03:59:59Z'), printedAt),
    ).toBeNull();
    expect(
      selectSaleDateOfficialRate([row()], new Date('2026-11-06T04:00:00Z'), printedAt),
    ).toBeNull();
    expect(
      selectSaleDateOfficialRate(
        [{ ...row(), source_url: 'https://example.invalid/' }],
        soldAt,
        printedAt,
      ),
    ).toBeNull();
    expect(selectSaleDateOfficialRate([row()], soldAt, new Date('2026-11-01'))).toBeNull();
  });
  it('consulta el instante de venta con parámetros y conserva la apertura si falla la caché', async () => {
    query.mockResolvedValueOnce({ rows: [row()] });
    expect(await new BcvService().getSaleDateReference(soldAt, printedAt)).toMatchObject({
      rate: row().rate,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([soldAt]);
    expect(query.mock.calls.every((call) => /^select/.test(String(call[0]).trim()))).toBe(true);
    query.mockRejectedValueOnce(new Error('cache unavailable'));
    expect(await new BcvService().getSaleDateReference(soldAt, printedAt)).toBeNull();
  });
  it.each(['letter', 'a4'] as const)(
    '%s: total Bs exacto, dirección repetida y firma sin alterar la venta',
    async (size) => {
      const sale = pdfSaleFixture(25);
      sale.settlementBasis = 'bcv';
      const before = JSON.stringify(sale);
      const reference = selectSaleDateOfficialRate([row()], soldAt, printedAt)!;
      const result = await composeSalePdf(sale, 'delivery', {
        size,
        generatedAt: printedAt,
        saleDateBcvRate: reference,
        issuer: {
          legalName: 'EMISOR SINTÉTICO C.A.',
          rif: 'J-00000000-0',
          address: 'Mercado de ejemplo, local QA-01, dirección sintética.',
        },
      });
      const text = result.layout.text.map((t) => t.text).join(' ');
      expect(text).toContain('Total en bolívares');
      expect(text).toContain('45,12345678');
      expect(text).toContain('05/11/2026');
      expect(text).not.toContain('Saldo actual');
      expect(text).not.toContain('Observaciones');
      expect(text).toContain('Tasa BCV de la venta');
      for (let page = 1; page <= result.layout.pages; page++)
        expect(
          result.layout.text
            .filter((t) => t.page === page)
            .map((t) => t.text)
            .join(' '),
        ).toContain('local QA-01');
      for (const box of result.layout.text) {
        expect(box.x).toBeGreaterThanOrEqual(result.layout.margin - 0.01);
        expect(box.x + box.width).toBeLessThanOrEqual(
          result.layout.width - result.layout.margin + 0.01,
        );
        expect(box.y).toBeGreaterThanOrEqual(result.layout.margin - 0.01);
        expect(box.y + box.height).toBeLessThanOrEqual(
          result.layout.height - result.layout.margin + 0.01,
        );
      }
      expect(JSON.stringify(sale)).toBe(before);
    },
  );
  it.each(['sale', 'delivery'] as const)(
    '%s: redondea el producto exacto del total USD y conserva condición contado/crédito',
    async (kind) => {
      const sale = pdfSaleFixture(1);
      sale.settlementBasis = 'bcv';
      const options = {
        generatedAt: printedAt,
        saleDateBcvRate: selectSaleDateOfficialRate([row()], soldAt, printedAt),
      };
      for (const condition of ['cash', 'credit'] as const) {
        sale.condition = condition;
        const result = await composeSalePdf(sale, kind, options);
        expect(result.layout.text.map((t) => t.text).join(' ')).toContain('Bs. 1.804,94');
      }
    },
  );
  it('divisa no muestra BCV y una venta BCV sin tasa sigue imprimiendo sin inventar Bs', async () => {
    const sale = pdfSaleFixture(1);
    const options = {
      generatedAt: printedAt,
      saleDateBcvRate: selectSaleDateOfficialRate([row()], soldAt, printedAt),
    };
    const divisa = await composeSalePdf(sale, 'delivery', options);
    expect(divisa.layout.text.map((t) => t.text).join(' ')).not.toContain('Total en bolívares');
    sale.settlementBasis = 'legacy_bcv';
    const missing = await composeSalePdf(sale, 'delivery', {
      generatedAt: printedAt,
      saleDateBcvRate: null,
    });
    expect(missing.layout.text.map((t) => t.text).join(' ')).toContain(
      'Equivalente en Bs. no calculado',
    );
    expect(missing.layout.text.map((t) => t.text).join(' ')).not.toContain('Total en bolívares');
  });
});
