import { describe, expect, it } from 'vitest';
import type { SalePreviewInput, SalePreviewResult } from '../../packages/domain/src/index';
import {
  saleQuantity,
  saleQuantityIssue,
  SalePreviewRequest,
  saleStockWarningContext,
} from '../../apps/web/src/lib/sale-stock';
import { emptySaleLine } from '../../apps/web/src/lib/sales-flow';

const input: SalePreviewInput = {
  soldAt: '2026-11-07T10:00:00Z',
  lines: [
    {
      lineKey: '10000000-0000-4000-8000-000000000001',
      configurationId: '20000000-0000-4000-8000-000000000001',
      presentation: 'box',
      quantity: 1,
    },
  ],
};
const result = (max = 9): SalePreviewResult => ({
  checkedAt: input.soldAt,
  reservesStock: false,
  valid: true,
  lines: [{ lineKey: input.lines[0].lineKey, maxQuantity: max, issueCode: null, message: null }],
  issues: [],
});
const deferred = () => {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
describe('cantidades físicas desde el texto editable', () => {
  it('reutiliza una advertencia solo cuando cambia la cantidad propia, nunca el resto del contexto', () => {
    const lines = [
      { ...emptySaleLine(1), configurationId: 'a', presentation: 'box' as const, quantity: '1' },
      {
        ...emptySaleLine(2),
        configurationId: 'a',
        presentation: 'blister' as const,
        quantity: '2',
      },
    ];
    const before = saleStockWarningContext(lines, 1, 'automatic');
    expect(
      saleStockWarningContext([{ ...lines[0], quantity: '25' }, lines[1]], 1, 'automatic'),
    ).toBe(before);
    for (const changed of [
      [{ ...lines[0], configurationId: 'b' }, lines[1]],
      [{ ...lines[0], presentation: 'blister' as const }, lines[1]],
      [lines[0], { ...lines[1], quantity: '3' }],
      [lines[0]],
    ])
      expect(saleStockWarningContext(changed, 1, 'automatic')).not.toBe(before);
    expect(saleStockWarningContext(lines, 1, '2026-11-07T10:00')).not.toBe(before);
  });
  it('no convierte exponentes, decimales, signos, espacios ni cantidades fuera de límite', () => {
    for (const value of [
      '',
      '0',
      '-1',
      '1.5',
      '1e3',
      '1E2',
      'NaN',
      'Infinity',
      ' 2',
      '2 ',
      '+2',
      '1001',
      '99999',
    ]) {
      expect(saleQuantity(value), value).toBeNull();
      expect(saleQuantityIssue(value), value).toContain('entera');
    }
    for (const value of ['1', '9', '1000']) {
      expect(saleQuantity(value)).toBe(Number(value));
      expect(saleQuantityIssue(value)).toBe('');
    }
  });
});
describe('consultas del carrito sin reservas', () => {
  it('descarta una respuesta anterior aunque el transporte ignore AbortSignal', async () => {
    const first = deferred(),
      second = deferred();
    const calls: RequestInit[] = [];
    const send = ((_url: unknown, init: RequestInit) => {
      calls.push(init);
      return calls.length === 1 ? first.promise : second.promise;
    }) as typeof fetch;
    const client = new SalePreviewRequest();
    const old = client.read(input, send);
    const current = client.read({ ...input, lines: [{ ...input.lines[0], quantity: 7 }] }, send);
    expect(calls[0].signal?.aborted).toBe(true);
    second.resolve(Response.json(result(2)));
    expect((await current)?.lines[0].maxQuantity).toBe(2);
    first.resolve(Response.json(result(9)));
    expect(await old).toBeNull();
    expect(calls[1]).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(JSON.parse(calls[1].body as string).lines[0].quantity).toBe(7);
    expect(new Headers(calls[1].headers).has('Idempotency-Key')).toBe(false);
  });
  it('cancelar al desmontar o cambiar datos descarta también errores tardíos', async () => {
    const pending = deferred();
    const client = new SalePreviewRequest();
    const call = client.read(input, (() => pending.promise) as typeof fetch);
    client.cancel();
    pending.resolve(Response.json({ message: 'Error antiguo' }, { status: 503 }));
    expect(await call).toBeNull();
  });
  it('un fallo de red o sesión no se convierte en stock cero ni en validación positiva', async () => {
    const client = new SalePreviewRequest();
    await expect(
      client.read(input, (async () => Response.json({}, { status: 401 })) as typeof fetch),
    ).rejects.toThrow('sesión');
    await expect(
      client.read(input, (async () => {
        throw new Error('Sin conexión');
      }) as typeof fetch),
    ).rejects.toThrow('Sin conexión');
  });
  it('rechaza HTML y respuestas que no describen exactamente las líneas consultadas', async () => {
    const invalid = [
      null,
      { ...result(), reservesStock: true },
      { ...result(), lines: [] },
      { ...result(), lines: [{ ...result().lines[0], maxQuantity: -1 }] },
      { ...result(), lines: [{ ...result().lines[0], lineKey: 'otra-línea' }] },
    ];
    for (const body of invalid)
      await expect(
        new SalePreviewRequest().read(input, (async () => Response.json(body)) as typeof fetch),
      ).rejects.toThrow('no es válida');
    await expect(
      new SalePreviewRequest().read(
        input,
        (async () => new Response('<html>Login</html>')) as typeof fetch,
      ),
    ).rejects.toThrow('no es válida');
  });
  it('conserva max=null como conflicto y max=0 como falta real, sin adivinar una cantidad', async () => {
    const conflict: SalePreviewResult = {
      ...result(),
      valid: false,
      lines: [
        {
          ...result().lines[0],
          maxQuantity: null,
          issueCode: 'cart_conflict',
          message: 'Revisa las otras líneas.',
        },
      ],
      issues: [
        {
          lineKey: input.lines[0].lineKey,
          issueCode: 'cart_conflict',
          message: 'Revisa las otras líneas.',
        },
      ],
    };
    expect(
      await new SalePreviewRequest().read(input, (async () =>
        Response.json(conflict)) as typeof fetch),
    ).toEqual(conflict);
    const zero = { ...conflict, lines: [{ ...conflict.lines[0], maxQuantity: 0 }] };
    expect(
      (
        await new SalePreviewRequest().read(input, (async () =>
          Response.json(zero)) as typeof fetch)
      )?.lines[0].maxQuantity,
    ).toBe(0);
  });
});
