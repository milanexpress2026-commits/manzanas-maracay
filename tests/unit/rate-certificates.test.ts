import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import https from 'node:https';
import tls from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type { ClientRequest } from 'node:http';
import { fetchRateSource } from '../../scripts/refresh-rates';
import { BCV_SOURCE_URL, USDT_SOURCE_URL } from '../../packages/domain/src/rate-sources';

afterEach(() => vi.restoreAllMocks());

it.each(['dv', 'ov'])(
  'BCV %s: el intermedio público está firmado por una raíz estándar',
  (kind) => {
    const certificate = new X509Certificate(
      fs.readFileSync(`scripts/certs/sectigo-public-server-${kind}-r36.pem`),
    );
    const root = tls.rootCertificates
      .map((pem) => new X509Certificate(pem))
      .find(
        (candidate) =>
          candidate.subject === certificate.issuer && certificate.verify(candidate.publicKey),
      );
    expect(root).toBeDefined();
    expect(certificate.ca).toBe(true);
    expect(certificate.subject).not.toBe(certificate.issuer);
    expect(Date.parse(certificate.validFrom)).toBeLessThan(Date.now());
    expect(Date.parse(certificate.validTo)).toBeGreaterThan(Date.now());
  },
);

it.each([BCV_SOURCE_URL, USDT_SOURCE_URL])(
  'TLS rechaza errores y solo suplementa BCV: %s',
  async (url) => {
    const get = vi.spyOn(https, 'get').mockImplementation(() => {
      const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
      queueMicrotask(() => request.emit('error', new Error('certificate verify failed')));
      return request as unknown as ClientRequest;
    });
    await expect(fetchRateSource(url)).rejects.toThrow('certificate verify failed');
    const options = get.mock.calls[0]![1] as https.RequestOptions;
    expect(options.rejectUnauthorized).not.toBe(false);
    expect(options.checkServerIdentity).toBeUndefined();
    expect(options.allowPartialTrustChain).not.toBe(true);
    if (url === BCV_SOURCE_URL) {
      const certificates = (options.ca as string[]).map((pem) => new X509Certificate(pem));
      for (const kind of ['DV', 'OV'])
        expect(
          certificates.some((certificate) => certificate.subject.includes(`CA ${kind} R36`)),
        ).toBe(true);
    } else expect(options.ca).toBeUndefined();
  },
);

it('no consulta hosts ajenos al contrato de tasas', () => {
  const get = vi.spyOn(https, 'get');
  expect(() => fetchRateSource('https://example.com/')).toThrow('Fuente no autorizada');
  expect(get).not.toHaveBeenCalled();
});
