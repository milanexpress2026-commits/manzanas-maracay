import { afterEach, describe, expect, it } from 'vitest';
import { assertDatabase } from '../../scripts/migrate';

const environment = process.env.MM_APP_ENV;
afterEach(() => { if (environment === undefined) delete process.env.MM_APP_ENV; else process.env.MM_APP_ENV = environment; });
describe('destinos de migración exclusivos', () => {
  it('acepta las dos bases locales del proyecto', () => {
    for (const name of ['manzanas_maracay_dev', 'manzanas_maracay_test'])
      expect(assertDatabase(`postgresql://mm_owner:example@127.0.0.1:55432/${name}`)).toContain(name);
  });
  it('bloquea una base ajena o un servidor remoto', () => {
    expect(() => assertDatabase('postgresql://mm_owner:example@127.0.0.1:55432/other_project')).toThrow();
    expect(() => assertDatabase('postgresql://mm_owner:example@remote.example:5432/manzanas_maracay_staging')).toThrow();
    expect(() => assertDatabase('postgresql://postgres:example@127.0.0.1:55432/manzanas_maracay_dev')).toThrow();
  });
  it('solo acepta el DNS interno y nombre exactos de staging con entorno explícito', () => {
    process.env.MM_APP_ENV = 'local';
    const url = 'postgresql://mm_owner:example@postgres:5432/manzanas_maracay_staging';
    expect(() => assertDatabase(url)).toThrow();
    process.env.MM_APP_ENV = 'staging';
    expect(assertDatabase(url)).toBe(url);
    expect(() => assertDatabase(url.replace('staging', 'production'))).toThrow();
  });
});
