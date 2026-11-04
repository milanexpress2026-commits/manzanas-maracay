import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The child replaces secret reads and process launch before importing the runtime.
// No actual secret file, application server or network is touched.
function run(mode: string, scenario: string) {
  const runtime = pathToFileURL(resolve('scripts/staging-runtime.mjs')).href;
  const program = `
    import fs from 'node:fs';
    import cp from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    import { createECDH } from 'node:crypto';
    import { EventEmitter } from 'node:events';
    const scenario = ${JSON.stringify(scenario)};
    const mode = ${JSON.stringify(mode)};
    process.env.MM_APP_ENV = 'staging';
    process.env.MM_APP_ORIGIN = 'https://manzanas.ganamosclub.net';
    for (const name of ['MM_VAPID_PUBLIC_KEY','MM_VAPID_PRIVATE_KEY','MM_VAPID_SUBJECT']) {
      delete process.env[name]; delete process.env[name + '_FILE'];
    }
    const key = createECDH('prime256v1');
    const scalar = Buffer.alloc(32); scalar[31] = 1;
    key.setPrivateKey(scalar);
    const content = {
      '/run/secrets/internal': 'synthetic-internal-token-only-for-test',
      '/run/secrets/password': 'synthetic-password-only-for-tests-000',
      '/run/secrets/public': key.getPublicKey().toString('base64url'),
      '/run/secrets/private': scalar.toString('base64url'),
      '/run/secrets/subject': 'https://manzanas.ganamosclub.net',
    };
    process.env.MM_INTERNAL_TOKEN_FILE = '/run/secrets/internal';
    process.env.MM_APP_PASSWORD_FILE = '/run/secrets/password';
    process.env.MM_PG_PASSWORD_FILE = '/run/secrets/password';
    if (scenario !== 'absent') {
      process.env.MM_VAPID_PUBLIC_KEY_FILE = '/run/secrets/public';
      process.env.MM_VAPID_PRIVATE_KEY_FILE = '/run/secrets/private';
      process.env.MM_VAPID_SUBJECT_FILE = '/run/secrets/subject';
    }
    if (scenario === 'partial') delete process.env.MM_VAPID_PRIVATE_KEY_FILE;
    if (scenario === 'traversal') process.env.MM_VAPID_PRIVATE_KEY_FILE = '/run/secrets/../outside';
    if (scenario === 'mixed') process.env.MM_VAPID_PRIVATE_KEY = 'value-from-environment';
    if (scenario === 'mismatch') { const other = Buffer.alloc(32); other[31] = 2; content['/run/secrets/private'] = other.toString('base64url'); }
    const realRead = fs.readFileSync;
    const reads = [];
    fs.readFileSync = (path, ...args) => {
      if (String(path).startsWith('/run/secrets/')) {
        reads.push(path);
        if (!(path in content)) throw new Error('Unexpected synthetic read');
        return content[path];
      }
      return realRead(path, ...args);
    };
    fs.statSync = (path) => ({ isFile: () => true, size: scenario === 'oversized' ? 4097 : content[path]?.length ?? 0 });
    const calls = [];
    cp.spawn = (_node, args, options) => {
      calls.push({ args, hasVapid: Boolean(options.env.MM_VAPID_PRIVATE_KEY) });
      const child = new EventEmitter();
      process.nextTick(() => child.emit('exit', 0));
      return child;
    };
    syncBuiltinESMExports();
    process.argv[2] = mode;
    try {
      await import(${JSON.stringify(runtime)});
      console.log(JSON.stringify({ ok: true, calls, vapidReads: reads.filter(p => ['public','private','subject'].some(name => p.endsWith('/' + name))).length }));
    } catch (error) {
      console.log(JSON.stringify({ ok: false, launched: calls.length, message: error.message }));
    }
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval', program], {
    encoding: 'utf8',
    timeout: 10_000,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout.trim());
}

describe('VAPID files in staging runtime', () => {
  it('starts without configuring push when the optional files are absent', () => {
    expect(run('api', 'absent')).toMatchObject({
      ok: true,
      vapidReads: 0,
      calls: [{ hasVapid: false }],
    });
  });
  it('reads and validates the matching file pair before launching API', () => {
    expect(run('api', 'valid')).toMatchObject({
      ok: true,
      vapidReads: 3,
      calls: [{ hasVapid: true }],
    });
  });
  it.each(['partial', 'traversal', 'mixed', 'mismatch', 'oversized'])(
    'blocks API for %s configuration',
    (scenario) => {
      expect(run('api', scenario)).toMatchObject({ ok: false, launched: 0 });
    },
  );
  it.each(['web', 'migrate'])('does not read or expose VAPID to %s', (mode) => {
    const result = run(mode, 'valid');
    expect(result).toMatchObject({ ok: true, vapidReads: 0 });
    expect(result.calls.every((call: { hasVapid: boolean }) => !call.hasVapid)).toBe(true);
  });
});
