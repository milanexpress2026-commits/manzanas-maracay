import { describe, expect, it, vi } from 'vitest';
import { quoteNow } from '../../apps/web/src/lib/quote-clock';
import { AuthService } from '../../apps/api/src/auth/auth.service';

describe('hora y borradores de operación', () => {
  it('la vigencia avanza con tiempo transcurrido aunque cambie el reloj del teléfono', () => {
    const anchor = { serverMs: 1_000_000, monotonicMs: 500 };
    expect(quoteNow(anchor, 60_500, 999_999_999)).toBe(1_060_000);
    expect(quoteNow(anchor, 60_500, 1)).toBe(1_060_000);
    expect(quoteNow(undefined, 500, 123)).toBe(123);
  });
  it('reiniciar operaciones separa los borradores sin cambiar el usuario ni mezclar socios', async () => {
    const service = Object.create(AuthService.prototype) as AuthService;
    const query = vi.fn().mockResolvedValue({ rows: [] });
    Object.defineProperty(service, 'pool', { value: { query } });
    const user = { id: '9413a075-37d3-4f66-b32a-f3229139d3da', username: 'qa', displayName: 'QA' };
    const original = await service.info(user);
    expect(original.operationScopeId).toBe(user.id);
    query.mockResolvedValue({ rows: [{ id: '2ce88bed-e229-4dd1-bd26-c805c85ca046' }] });
    const reset = await service.info(user);
    expect(reset.user).toEqual(user);
    expect(reset.operationScopeId).not.toBe(original.operationScopeId);
    expect(reset.operationScopeId).toMatch(/^[a-f0-9-]{36}$/);
    expect((await service.info(user)).operationScopeId).toBe(reset.operationScopeId);
    expect(
      (await service.info({ ...user, id: '3e32e3ab-4103-40bd-a5b8-2273985d9898' }))
        .operationScopeId,
    ).not.toBe(reset.operationScopeId);
  });
});
