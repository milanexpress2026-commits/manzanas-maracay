import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash, randomUUID } from 'node:crypto';

const database = vi.hoisted(() => ({ query: vi.fn(), release: vi.fn() }));
vi.mock('pg', () => ({
  Pool: class {
    on = vi.fn();
    end = vi.fn();
    connect = async () => database;
  },
}));
vi.mock('../../apps/api/src/production-state', () => ({
  assertBusinessWritesReady: vi.fn(),
  commandIsDemo: () => true,
}));
import { InventoryService } from '../../apps/api/src/inventory.service';

beforeEach(() => vi.clearAllMocks());
const id = randomUUID(),
  actor = randomUUID(),
  data = { reason: 'Corrección documentada' };
function receipt(kind: string, reset: boolean) {
  const response = { movementId: id, lotId: randomUUID() };
  database.query.mockImplementation(async (sql: string) => {
    if (sql.startsWith('select request_hash'))
      return {
        rows: [
          {
            request_hash: createHash('sha256')
              .update(JSON.stringify({ kind, data, actor }))
              .digest('hex'),
            response,
            created_at: new Date('2026-11-08T00:00:00Z'),
          },
        ],
      };
    if (sql.includes('owner_authorized_operation_reset'))
      return { rows: [], rowCount: reset ? 1 : 0 };
    return { rows: [], rowCount: 0 };
  });
  return response;
}

describe('reintentos de operaciones de un período reiniciado', () => {
  it.each([
    'sale',
    'payment',
    'receipt',
    ...[
      'sale-dates',
      'sale-cancel',
      'payment-reverse',
      'open-box',
      'withdraw-blisters',
      'open-blister',
      'prepare-half',
      'split-halves',
      'adjust',
      'reverse',
    ].map((kind) => `${kind}:${id}`),
  ])('%s no confirma un documento o movimiento anterior al reinicio', async (kind) => {
    receipt(kind, true);
    const execute = vi.fn();
    await expect(
      new InventoryService().runCommand(kind, data, randomUUID(), actor, execute),
    ).rejects.toThrow('período que se vació');
    expect(execute).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledWith('rollback');
    expect(database.release).toHaveBeenCalled();
  });
  it('el reintento vigente devuelve la misma confirmación sin repetir el movimiento', async () => {
    const kind = `adjust:${id}`,
      response = receipt(kind, false),
      execute = vi.fn();
    expect(
      await new InventoryService().runCommand(kind, data, randomUUID(), actor, execute),
    ).toEqual(response);
    expect(execute).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledWith('commit');
  });
  it('conserva los recibos de clientes y proveedores que sobrevivieron al reinicio', async () => {
    for (const kind of [`client:${id}`, `supplier:${id}`]) {
      const response = receipt(kind, true),
        execute = vi.fn();
      expect(
        await new InventoryService().runCommand(kind, data, randomUUID(), actor, execute),
      ).toEqual(response);
      expect(execute).not.toHaveBeenCalled();
    }
  });
});
