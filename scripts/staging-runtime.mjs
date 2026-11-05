import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createECDH, timingSafeEqual } from 'node:crypto';

const mode = process.argv[2];
if (process.env.MM_APP_ENV !== 'staging') throw new Error('Este iniciador solo admite staging.');
const origin = new URL(process.env.MM_APP_ORIGIN ?? '');
if (origin.protocol !== 'https:' || origin.origin !== process.env.MM_APP_ORIGIN)
  throw new Error('Configura el origen HTTPS confirmado de staging.');
function secret(name) {
  const file = process.env[`${name}_FILE`];
  if (!file || !file.startsWith('/run/secrets/'))
    throw new Error(`Falta el archivo privado de ${name}.`);
  const value = fs.readFileSync(file, 'utf8').trim();
  if (value.length < 32) throw new Error(`El secreto ${name} no cumple la longitud requerida.`);
  return value;
}
if (['api', 'web'].includes(mode)) process.env.MM_INTERNAL_TOKEN = secret('MM_INTERNAL_TOKEN');
if (mode === 'api') {
  process.env.DATABASE_URL = `postgresql://mm_app:${encodeURIComponent(secret('MM_APP_PASSWORD'))}@postgres:5432/manzanas_maracay_staging`;
  // Optional push secrets are mounted only into API, never web/build/migrate.
  const vapidNames = ['MM_VAPID_PUBLIC_KEY', 'MM_VAPID_PRIVATE_KEY', 'MM_VAPID_SUBJECT'];
  if (vapidNames.some((name) => process.env[`${name}_FILE`])) {
    for (const name of vapidNames) {
      const file = process.env[`${name}_FILE`];
      if (!file || !/^\/run\/secrets\/[A-Za-z0-9_-]+$/.test(file) || process.env[name])
        throw new Error('Configura los tres archivos VAPID, sin mezclar valores de entorno.');
      const info = fs.statSync(file);
      if (!info.isFile() || info.size < 1 || info.size > 4096)
        throw new Error('Un archivo VAPID tiene formato o tamaño inválido.');
      const value = fs.readFileSync(file, 'utf8').trim();
      const valid =
        name === 'MM_VAPID_PUBLIC_KEY'
          ? /^[A-Za-z0-9_-]{87}$/.test(value)
          : name === 'MM_VAPID_PRIVATE_KEY'
            ? /^[A-Za-z0-9_-]{43}$/.test(value)
            : /^(https:\/\/[^\s]+|mailto:[^\s@]+@[^\s@]+)$/.test(value);
      if (!valid) throw new Error('Un archivo VAPID no contiene un valor válido.');
      process.env[name] = value;
    }
    const key = createECDH('prime256v1');
    try {
      key.setPrivateKey(Buffer.from(process.env.MM_VAPID_PRIVATE_KEY, 'base64url'));
      const expected = key.getPublicKey();
      const actual = Buffer.from(process.env.MM_VAPID_PUBLIC_KEY, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
        throw new Error('mismatch');
    } catch {
      throw new Error('Los archivos VAPID no contienen una pareja de claves válida.');
    }
  }
}
if (['migrate', 'migrate-only', 'invite'].includes(mode))
  process.env.MIGRATION_DATABASE_URL = `postgresql://mm_owner:${encodeURIComponent(secret('MM_PG_PASSWORD'))}@postgres:5432/manzanas_maracay_staging`;
const commands = {
  api: [['apps/api/dist/apps/api/src/main.js']],
  web: [['apps/web/server.js']],
  migrate: [
    ['--import', 'tsx', 'scripts/migrate.ts'],
    ['--import', 'tsx', 'scripts/seed.ts'],
  ],
  'migrate-only': [['--import', 'tsx', 'scripts/migrate.ts']],
  invite: [['--import', 'tsx', 'scripts/create-user.ts', '--file', '/run/secrets/invitation']],
};
if (!commands[mode]) throw new Error('Modo de staging no admitido.');
let child;
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child?.kill(signal));
for (const args of commands[mode]) {
  const code = await new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
  if (code) {
    process.exitCode = code;
    break;
  }
}
