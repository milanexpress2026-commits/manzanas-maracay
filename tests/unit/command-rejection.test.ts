import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InventoryService } from '../../apps/api/src/inventory.service';
import { businessCommandRejection } from '../../apps/api/src/command-rejection';

const key = '165e22a8-a906-4938-931f-a638a38b347f';
const actor = '791564b8-82cf-4152-84b2-5a2c416146a9';
afterEach(() => vi.unstubAllEnvs());
function service(
  options: {
    rollbackFails?: boolean;
    commitFails?: boolean;
    existing?: boolean;
    lockFails?: boolean;
  } = {},
) {
  vi.stubEnv('MM_APP_ENV', 'test');
  vi.stubEnv('MM_APP_ORIGIN', 'http://127.0.0.1:3200');
  const query = vi.fn(async (sql: string) => {
    if (sql === 'rollback' && options.rollbackFails) throw new Error('connection lost');
    if (sql === 'commit' && options.commitFails)
      throw new ConflictException('COMMIT response lost');
    if (sql.includes('pg_advisory') && options.lockFails)
      throw Object.assign(new Error('lock'), { code: '55P03' });
    return {
      rows:
        sql.includes('from command_receipts') && options.existing
          ? [{ request_hash: 'other', response: {} }]
          : [],
    };
  });
  const release = vi.fn(),
    pool = { connect: vi.fn(async () => ({ query, release })) };
  const instance = Object.create(InventoryService.prototype) as InventoryService;
  Object.defineProperty(instance, 'pool', { value: pool });
  return { instance, query, release, pool };
}
async function failure(operation: Promise<unknown>) {
  try {
    await operation;
    throw new Error('Expected rejection');
  } catch (error) {
    return error;
  }
}
describe('marcador empresarial solo después de rollback confirmado', () => {
  it.each(['sale', 'payment'])(
    'marca %s sin persistir rechazos ni revelar sus datos',
    async (kind) => {
      const h = service();
      const error = await failure(
        h.instance.runCommand(kind, { privateNote: 'never in metadata' }, key, actor, async () => {
          throw new BadRequestException('Saldo insuficiente');
        }),
      );
      expect(businessCommandRejection(error)).toEqual({
        commandOutcome: 'rejected',
        commandKey: key,
      });
      expect(h.query.mock.calls.at(-1)?.[0]).toBe('rollback');
      expect(
        h.query.mock.calls.some(([sql]) => sql.startsWith('insert into command_receipts')),
      ).toBe(false);
      expect(h.release).toHaveBeenCalledOnce();
    },
  );
  it('no marca si el rollback no pudo confirmarse', async () => {
    const h = service({ rollbackFails: true });
    const error = await failure(
      h.instance.runCommand('sale', {}, key, actor, async () => {
        throw new ConflictException('Stock');
      }),
    );
    expect(businessCommandRejection(error)).toEqual({});
    expect(h.release).toHaveBeenCalledOnce();
  });
  it.each(['23503', '23514', '23505'])(
    'marca restricción SQL %s solo con rollback confirmado',
    async (code) => {
      for (const rollbackFails of [false, true]) {
        const h = service({ rollbackFails });
        const error = await failure(
          h.instance.runCommand('payment', {}, key, actor, async () => {
            throw Object.assign(new Error('private constraint detail'), { code });
          }),
        );
        expect(businessCommandRejection(error)).toEqual(
          rollbackFails ? {} : { commandOutcome: 'rejected', commandKey: key },
        );
      }
    },
  );
  it('no marca un COMMIT con resultado incierto aunque rollback responda', async () => {
    const h = service({ commitFails: true });
    const error = await failure(
      h.instance.runCommand('sale', {}, key, actor, async () => ({ id: actor })),
    );
    expect(businessCommandRejection(error)).toEqual({});
    expect(h.query.mock.calls.slice(-2).map(([sql]) => sql)).toEqual(['commit', 'rollback']);
  });
  it('no marca conflicto de clave anterior al callback ni bloqueo SQL', async () => {
    for (const options of [{ existing: true }, { lockFails: true }]) {
      const h = service(options),
        callback = vi.fn();
      const error = await failure(h.instance.runCommand('sale', {}, key, actor, callback));
      expect(businessCommandRejection(error)).toEqual({});
      expect(callback).not.toHaveBeenCalled();
    }
  });
  it('no marca fallos de autenticación ni comandos ajenos', async () => {
    const h = service(),
      callback = vi.fn();
    expect(
      businessCommandRejection(await failure(h.instance.runCommand('sale', {}, key, '', callback))),
    ).toEqual({});
    expect(h.pool.connect).not.toHaveBeenCalled();
    expect(
      businessCommandRejection(
        await failure(
          h.instance.runCommand('sale', {}, key, actor, async () => {
            throw new UnauthorizedException();
          }),
        ),
      ),
    ).toEqual({});
    expect(
      businessCommandRejection(
        await failure(
          h.instance.runCommand('receipt', {}, key, actor, async () => {
            throw new BadRequestException();
          }),
        ),
      ),
    ).toEqual({});
  });
});
