import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { documentIssuerSchema, readDocumentIssuer } from '../../apps/api/src/document-issuer';
import { composeSalePdf } from '../../apps/api/src/commerce-pdf';
import { pdfSaleFixture } from '../fixtures/commerce-pdf';

const issuer = { legalName: 'EMISOR SINTÉTICO C.A.', rif: 'J-00000000-0' };
const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  // Only exact exclusive temporary directories created by this test process.
  for (const directory of directories.splice(0)) await fs.rm(directory, { recursive: true });
});
async function control(content?: string) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mm-issuer-test-'));
  directories.push(directory);
  vi.stubEnv('MM_APP_ENV', 'production');
  vi.stubEnv('MM_PRODUCTION_GATE_FILE', path.join(directory, 'activation.json'));
  if (content !== undefined)
    await fs.writeFile(path.join(directory, 'document-issuer.json'), content);
  return directory;
}
describe('identidad privada de notas de entrega', () => {
  it('lee solo la identidad configurada en producción y permite instalaciones anteriores', async () => {
    const directory = await control();
    expect(await readDocumentIssuer()).toBeUndefined();
    await fs.writeFile(path.join(directory, 'document-issuer.json'), JSON.stringify(issuer));
    expect(await readDocumentIssuer()).toEqual(issuer);
    vi.stubEnv('MM_APP_ENV', 'staging');
    expect(await readDocumentIssuer()).toBeUndefined();
  });
  it.each(['{', JSON.stringify({ ...issuer, rif: 'incorrecto' }), 'x'.repeat(4097)])(
    'no reemplaza silenciosamente un emisor configurado ilegible',
    async (content) => {
      await control(content);
      await expect(readDocumentIssuer()).rejects.toThrow('datos del emisor');
    },
  );
  it('el PDF real usa el emisor privado y la demo conserva su identidad sintética', async () => {
    await control(JSON.stringify(issuer));
    const sale = pdfSaleFixture(1);
    sale.isDemo = false;
    const real = await composeSalePdf(sale, 'delivery');
    expect(real.layout.text.some((t) => t.text === issuer.legalName)).toBe(true);
    sale.isDemo = true;
    const demo = await composeSalePdf(sale, 'delivery');
    expect(demo.layout.text.some((t) => t.text === issuer.legalName)).toBe(false);
  });
  it('rechaza campos ajenos, controles y datos vacíos', () => {
    for (const value of [
      { ...issuer, password: 'no' },
      { ...issuer, legalName: ' ' },
      { ...issuer, address: 'a\nb' },
    ])
      expect(documentIssuerSchema.safeParse(value).success).toBe(false);
  });
});
