import { describe, expect, it, vi } from 'vitest';
import {
  CommercialJournalError,
  commercialJournalKey,
  readCommercialPending,
  sendCommercialCommand,
  type CommercialJournalDependencies,
} from '../../apps/web/src/lib/commercial-journal';

const actor = 'a02b0af5-1a59-40ab-87be-8b121287fd56';
const clientId = '0de84136-d21d-4cce-9b0c-3add4499e918';
const saleId = 'b2752e5a-e260-4c1f-979b-53092af5b310';
const scope = `test:${actor}`;
const sale = {
  schemaVersion: 2,
  clientId,
  condition: 'credit',
  settlementBasis: 'divisa',
  soldAt: '2026-11-06T12:00:00.000Z',
  dueDate: null,
  reminderDate: null,
  notes: '',
  lines: [
    {
      configurationId: '7475ac50-a8dc-4d7e-a5e4-85088eaa8dca',
      presentation: 'box',
      quantity: 2,
      agreedUnitUsd: '40.00',
    },
  ],
};
const payment = {
  clientId,
  currency: 'USD',
  amount: '80.00',
  method: 'usd_cash',
  receivedAt: '2026-11-06T12:00:00.000Z',
  applications: [{ saleId, amountUsd: '80.00' }],
};
const saleResult = {
  id: saleId,
  number: 'V-1',
  clientId,
  isDemo: true,
  totalUsd: '80.00',
  lines: [{}],
};
const paymentResult = {
  id: '0b96947a-a7a5-44ee-b0be-9d8a86588a73',
  number: 'AB-1',
  clientId,
  isDemo: true,
  currency: 'USD',
  amount: '80.00',
  applications: payment.applications,
};
const response = (status: number, data: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
function harness() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const held = new Set<string>();
  const send = vi
    .fn<CommercialJournalDependencies['send']>()
    .mockResolvedValue(response(201, saleResult));
  const deps: CommercialJournalDependencies = {
    storage,
    send,
    withLock: async (key, work) => {
      if (held.has(key)) throw new CommercialJournalError('Otra pestaña está confirmando.');
      held.add(key);
      try {
        return await work();
      } finally {
        held.delete(key);
      }
    },
  };
  return { deps, send, storage, values };
}

describe('journal comercial durable', () => {
  it.each(['sale', 'payment'] as const)(
    'conserva %s antes del POST y recupera los mismos bytes y clave después de perder COMMIT',
    async (kind) => {
      const h = harness(),
        body = kind === 'sale' ? sale : payment,
        result = kind === 'sale' ? saleResult : paymentResult;
      h.send.mockImplementationOnce(async (_url, key, raw) => {
        const saved = await readCommercialPending(h.storage, scope, kind);
        expect(saved).toMatchObject({ key, body: raw, attempts: 1 });
        throw new Error('respuesta perdida después de COMMIT');
      });
      await expect(sendCommercialCommand(h.deps, scope, kind, body)).rejects.toThrow('No llegó');
      const restored = (await readCommercialPending(h.storage, scope, kind))!;
      const first = h.send.mock.calls[0];
      // A new caller represents reload, tab close or a new authenticated page.
      const newCaller = { ...h.deps, send: vi.fn().mockResolvedValue(response(201, result)) };
      expect(
        await sendCommercialCommand(
          newCaller,
          scope,
          kind,
          Object.fromEntries(Object.entries(JSON.parse(restored.body)).reverse()),
          null,
          restored,
        ),
      ).toEqual(result);
      expect(newCaller.send).toHaveBeenCalledWith(...first);
      expect(await readCommercialPending(h.storage, scope, kind)).toBeNull();
    },
  );

  it('no sobrescribe un pendiente con otra venta ni cambia usuario/entorno', async () => {
    const h = harness();
    h.send.mockResolvedValue(response(503, {}));
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow();
    const saved = h.storage.getItem(commercialJournalKey(scope, 'sale'))!;
    await expect(
      sendCommercialCommand(h.deps, scope, 'sale', { ...sale, notes: 'segunda' }),
    ).rejects.toThrow('otra pestaña');
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.storage.getItem(commercialJournalKey(scope, 'sale'))).toBe(saved);
    expect(await readCommercialPending(h.storage, `production:${actor}`, 'sale')).toBeNull();
    expect(
      await readCommercialPending(h.storage, 'test:afdab063-ced3-411f-a5b9-56dd19136be7', 'sale'),
    ).toBeNull();
    const original = (await readCommercialPending(h.storage, scope, 'sale'))!;
    await expect(
      sendCommercialCommand(h.deps, `production:${actor}`, 'sale', sale, null, original),
    ).rejects.toThrow('verificar');
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it.each(['hash', 'payloadVersion', 'scope', 'version'])(
    'conserva sin enviar un registro con %s incompatible',
    async (field) => {
      const h = harness();
      h.send.mockResolvedValue(response(503, {}));
      await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow();
      const key = commercialJournalKey(scope, 'sale'),
        raw = JSON.parse(h.storage.getItem(key)!);
      raw[field] = field === 'version' ? 2 : 'incompatible';
      const bad = JSON.stringify(raw);
      h.storage.setItem(key, bad);
      await expect(readCommercialPending(h.storage, scope, 'sale')).rejects.toThrow('conservó');
      await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow();
      expect(h.storage.getItem(key)).toBe(bad);
      expect(h.send).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['getItem', 'setItem'] as const)(
    'no envía cuando falla localStorage.%s',
    async (method) => {
      const h = harness();
      vi.spyOn(h.storage, method).mockImplementation(() => {
        throw new Error('disabled');
      });
      await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow();
      expect(h.send).not.toHaveBeenCalled();
    },
  );

  it('exige lectura exacta de lo escrito antes de enviar', async () => {
    const h = harness();
    vi.spyOn(h.storage, 'setItem').mockImplementation(() => undefined);
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow(
      'No se pudo conservar',
    );
    expect(h.send).not.toHaveBeenCalled();
  });

  it('solo libera un rechazo empresarial definitivo de primer intento y misma clave', async () => {
    const h = harness();
    h.send.mockImplementation(async (_url, key) =>
      response(409, { message: 'Stock insuficiente', commandOutcome: 'rejected', commandKey: key }),
    );
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toMatchObject({
      editable: true,
      status: 409,
    });
    expect(await readCommercialPending(h.storage, scope, 'sale')).toBeNull();
  });

  it.each([400, 401, 404, 409, 422, 429, 500, 503])(
    'retiene HTTP %i sin confirmación de rollback inequívoca',
    async (status) => {
      const h = harness();
      h.send.mockResolvedValue(response(status, { message: 'No confirmado' }));
      await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toMatchObject({
        editable: false,
        status,
      });
      expect(await readCommercialPending(h.storage, scope, 'sale')).not.toBeNull();
    },
  );

  it('no libera rechazo con otra clave ni rechazo posterior a respuesta perdida', async () => {
    const h = harness();
    h.send.mockResolvedValue(response(409, { commandOutcome: 'rejected', commandKey: saleId }));
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toMatchObject({
      editable: false,
    });
    const saved = (await readCommercialPending(h.storage, scope, 'sale'))!;
    h.send.mockResolvedValue(response(400, { commandOutcome: 'rejected', commandKey: saved.key }));
    await expect(
      sendCommercialCommand(h.deps, scope, 'sale', sale, null, saved),
    ).rejects.toMatchObject({ editable: false });
    expect((await readCommercialPending(h.storage, scope, 'sale'))?.attempts).toBe(2);
  });

  it.each([
    { ...saleResult, id: 'invalid' },
    { ...saleResult, clientId: actor },
    { ...saleResult, totalUsd: '79.00' },
    { ...saleResult, isDemo: false },
  ])('retiene un 2xx que no corresponde al comprobante solicitado', async (result) => {
    const h = harness();
    h.send.mockResolvedValue(response(201, result));
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow(
      'no identifica',
    );
    expect(await readCommercialPending(h.storage, scope, 'sale')).not.toBeNull();
  });

  it('bloquea el segundo envío concurrente y permite al tab atrasado consultar la misma clave ya resuelta', async () => {
    const h = harness();
    let unblock!: () => void;
    const waiting = new Promise<void>((resolve) => {
      unblock = resolve;
    });
    let captured!: Awaited<ReturnType<typeof readCommercialPending>>;
    let started!: () => void;
    const reached = new Promise<void>((resolve) => {
      started = resolve;
    });
    h.send.mockImplementationOnce(async () => {
      captured = await readCommercialPending(h.storage, scope, 'sale');
      started();
      await waiting;
      return response(201, saleResult);
    });
    const first = sendCommercialCommand(h.deps, scope, 'sale', sale);
    await reached;
    await expect(
      sendCommercialCommand(h.deps, scope, 'sale', sale, null, captured!),
    ).rejects.toThrow('Otra pestaña');
    expect(h.send).toHaveBeenCalledTimes(1);
    unblock();
    await first;
    expect(await readCommercialPending(h.storage, scope, 'sale')).toBeNull();
    await sendCommercialCommand(h.deps, scope, 'sale', sale, null, captured!);
    expect(h.send.mock.calls[1]).toEqual(h.send.mock.calls[0]);
  });

  it('conserva el comprobante cuando no puede retirar el pendiente después de éxito', async () => {
    const h = harness();
    vi.spyOn(h.storage, 'removeItem').mockImplementation(() => {
      throw new Error('disk');
    });
    await expect(sendCommercialCommand(h.deps, scope, 'sale', sale)).rejects.toThrow(
      'La respuesta llegó',
    );
    expect(await readCommercialPending(h.storage, scope, 'sale')).not.toBeNull();
  });

  it.each(['other-client', 'other-invoice'] as const)(
    'el resumen %s no puede reenviar un abono anterior resuelto por otra pestaña',
    async (change) => {
      const h = harness();
      h.send.mockRejectedValueOnce(new Error('respuesta de COMMIT perdida'));
      await expect(sendCommercialCommand(h.deps, scope, 'payment', payment)).rejects.toThrow(
        'No llegó',
      );
      const captured = (await readCommercialPending(h.storage, scope, 'payment'))!;
      const next =
        change === 'other-client'
          ? { ...payment, clientId: actor }
          : { ...payment, applications: [{ saleId: actor, amountUsd: '80.00' }] };
      // Tab A resolves its original payment and removes the shared slot.
      h.send.mockResolvedValue(response(201, paymentResult));
      await sendCommercialCommand(h.deps, scope, 'payment', payment, null, captured);
      expect(await readCommercialPending(h.storage, scope, 'payment')).toBeNull();
      // Tab B still captured A, but now reviews B. It must neither recreate A nor POST B with A's key.
      await expect(
        sendCommercialCommand(h.deps, scope, 'payment', next, null, captured),
      ).rejects.toThrow('El resumen no corresponde');
      expect(h.send).toHaveBeenCalledTimes(2);
      expect(await readCommercialPending(h.storage, scope, 'payment')).toBeNull();
      // Closing and reopening starts an explicit new operation, with a new key.
      const nextResult = {
        ...paymentResult,
        id: actor,
        clientId: next.clientId,
        applications: next.applications,
      };
      h.send.mockResolvedValueOnce(response(201, nextResult));
      expect(await sendCommercialCommand(h.deps, scope, 'payment', next)).toEqual(nextResult);
      expect(h.send.mock.calls[2][1]).not.toBe(captured.key);
      expect(JSON.parse(h.send.mock.calls[2][2])).toEqual(next);
    },
  );
});
