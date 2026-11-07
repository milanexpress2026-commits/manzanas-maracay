import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import type { SaleDetail } from '../../packages/domain/src/commerce';
import { CommerceService } from '../../apps/api/src/commerce.service';

const { uuid } = vi.hoisted(() => ({ uuid: vi.fn() }));
vi.mock('node:crypto', async (original) => ({
  ...(await original<typeof import('node:crypto')>()),
  randomUUID: uuid,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

const id = (prefix: string) => `${prefix.padStart(8, '0')}-0000-4000-8000-000000000001`;
const compareUuidBytes = (a: string, b: string) =>
  Buffer.compare(
    Buffer.from(a.replaceAll('-', ''), 'hex'),
    Buffer.from(b.replaceAll('-', ''), 'hex'),
  );

describe('orden durable de líneas comerciales, independiente de UUID aleatorio y FIFO físico', () => {
  it('createSale, lectura y replay conservan mismo SKU con precios distintos y fracción antes de caja', async () => {
    vi.stubEnv('MM_APP_ENV', 'test');
    vi.stubEnv('MM_APP_ORIGIN', 'http://127.0.0.1:3200');
    // Deliberately disagree with request order. PostgreSQL uuid ordering compares bytes.
    const generated = [id('c'), id('a'), id('b'), id('d')];
    generated.forEach((value) => uuid.mockReturnValueOnce(value));
    const customer = {
      id: id('1'),
      name: 'Cliente QA',
      active: true,
      isDemo: true,
      phone: '',
      taxId: '',
      address: '',
    };
    const configurationId = id('2'),
      variantId = id('3');
    const body = {
      schemaVersion: 2,
      clientId: customer.id,
      condition: 'credit',
      settlementBasis: 'divisa',
      soldAt: '2026-01-01T12:00:00.000Z',
      lines: [
        { configurationId, presentation: 'blister', quantity: 1, agreedUnitUsd: '11' },
        { configurationId, presentation: 'box', quantity: 1, agreedUnitUsd: '37' },
        { configurationId, presentation: 'blister', quantity: 2, agreedUnitUsd: '19' },
      ],
    };
    const savedLines: Record<string, unknown>[] = [],
      savedAllocations: Record<string, unknown>[] = [];
    let savedSale: Record<string, unknown> | undefined;
    const query = vi.fn(async (sql: string, values: unknown[] = []) => {
      let rows: Record<string, unknown>[] = [];
      if (sql.includes('from clients c')) rows = [customer];
      else if (sql.includes('from packing_rules r join product_variants'))
        rows = [
          {
            id: configurationId,
            variant_id: variantId,
            allowed_presentations: ['box', 'blister'],
            confirmation_status: 'confirmed',
            fruit: 'Fruta QA',
            variety: null,
            caliber: null,
            commercial_line: '',
            commercial_unit_label: null,
          },
        ];
      else if (sql.startsWith('insert into sales(')) {
        savedSale = {
          id: values[0],
          number: values[1],
          clientId: values[2],
          condition: values[3],
          status: 'confirmed',
          soldAt: values[4],
          dueDate: values[5],
          reminderDate: values[6],
          client: JSON.parse(values[7] as string),
          notes: values[8],
          actor: values[9],
          isDemo: values[10],
          totalUsd: values[11],
          costUsd: null,
          settlementBasis: values[13],
          balanceUsd: values[11],
          paidUsd: '0.00',
        };
      } else if (sql.startsWith('insert into sale_lines(')) {
        savedLines.push({
          id: values[0],
          variantId: values[2],
          configurationId,
          presentation: values[3],
          quantity: values[4],
          referenceUnitUsd: values[5],
          agreedUnitUsd: values[6],
          priceBasis: values[7],
          description: values[8],
          totalUsd: values[9],
          costUsd: null,
          commercialUnitLabel: values[11],
        });
      } else if (sql.startsWith('insert into sale_allocations(')) {
        savedAllocations.push({
          saleLineId: values[0],
          lotId: values[1],
          containerId: values[2],
          movementId: values[3],
          quantity: values[4],
          costUsd: null,
        });
      } else if (sql.includes("nextval('mm_sale_number_seq')")) rows = [{ number: 'V-00000001' }];
      else if (sql.includes('from sale_lines l join packing_rules')) {
        expect(sql).toContain('order by l.id');
        rows = savedLines
          .map((line) => ({ ...line }))
          .sort((a, b) => compareUuidBytes(a.id as string, b.id as string));
      } else if (sql.includes('from sale_allocations a join sale_lines')) rows = savedAllocations;
      else if (sql.includes('from sales s left join')) rows = savedSale ? [savedSale] : [];
      else if (!(
        sql.includes('from lots where') ||
        sql.includes('from payments p') ||
        sql.includes('from payment_applications') ||
        sql.includes('from sale_date_events') ||
        sql.includes('from sale_cancellations') ||
        sql.startsWith('insert into audit_events') ||
        ['begin isolation level repeatable read read only', 'commit', 'rollback'].includes(sql)
      ))
        throw new Error('Unexpected query in commerce test');
      return { rows, rowCount: rows.length };
    });
    const client = { query, release: vi.fn() } as unknown as PoolClient;
    const committed = new Map<string, SaleDetail>();
    const consumeSale = vi.fn(
      async (
        _client: PoolClient,
        lines: { lineId: string; presentation: string; quantity: number }[],
      ) =>
        // Physical dispatch uses boxes first. It must not reorder the commercial document.
        [...lines]
          .sort((a, b) => Number(b.presentation === 'box') - Number(a.presentation === 'box'))
          .map((line, index) => ({
            saleLineId: line.lineId,
            lotId: id('4'),
            containerId: id(String(index + 10)),
            movementId: id(String(index + 20)),
            quantity: line.quantity,
            costUsd: null,
          })),
    );
    const runCommand = vi.fn(
      async (
        _kind: string,
        _data: unknown,
        key: string,
        _actor: string,
        callback: (client: PoolClient, hash: string) => Promise<SaleDetail>,
      ) => {
        if (committed.has(key)) return structuredClone(committed.get(key)!);
        const result = await callback(client, 'qa-request-hash');
        committed.set(key, structuredClone(result));
        return result;
      },
    );
    const service = Object.create(CommerceService.prototype) as CommerceService;
    Object.defineProperties(service, {
      inventory: { value: { runCommand, consumeSale } },
      pool: { value: { connect: async () => client } },
    });
    const result = await service.createSale(body, id('5'), id('6'));
    const orderedIds = generated.slice(0, 3).sort(compareUuidBytes);
    const expected = body.lines.map((line, index) => ({
      id: orderedIds[index],
      presentation: line.presentation,
      quantity: line.quantity,
      agreedUnitUsd: `${line.agreedUnitUsd}.0000`,
    }));
    const visible = (sale: SaleDetail) =>
      sale.lines.map(({ id, presentation, quantity, agreedUnitUsd }) => ({
        id,
        presentation,
        quantity,
        agreedUnitUsd,
      }));
    expect(visible(result)).toEqual(expected);
    expect(result.totalUsd).toBe('86.00');
    expect(consumeSale.mock.calls[0][1].map((line) => line.lineId)).toEqual(orderedIds);
    expect(savedAllocations[0].saleLineId).toBe(orderedIds[1]);
    for (const line of result.lines) {
      expect(line.allocations).toHaveLength(1);
      expect(line.allocations[0]).toMatchObject({
        saleLineId: line.id,
        quantity: line.quantity,
        costUsd: null,
      });
    }
    expect(visible(await service.sale(result.id))).toEqual(expected);
    const queriesBeforeReplay = query.mock.calls.length;
    expect(await service.createSale(body, id('5'), id('6'))).toEqual(result);
    expect(query).toHaveBeenCalledTimes(queriesBeforeReplay);
    expect(consumeSale).toHaveBeenCalledOnce();
    expect(uuid).toHaveBeenCalledTimes(4);
  });
});
