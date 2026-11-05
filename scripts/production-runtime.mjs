import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { createECDH, timingSafeEqual } from 'node:crypto';

const mode = process.argv[2];
const commands = {
  api: ['apps/api/dist/apps/api/src/main.js'],
  web: ['apps/web/server.js'],
  migrate: ['--import', 'tsx', 'scripts/migrate.ts'],
  invite: ['--import', 'tsx', 'scripts/create-user.ts', '--file', '/run/secrets/invitation'],
};
if (!Object.hasOwn(commands, mode))
  throw new Error('Modo de producción no admitido. No hay comando seed.');
const extraArguments = process.argv.slice(3);
if (extraArguments.length) {
  if (mode !== 'invite' || extraArguments.length !== 1 || extraArguments[0] !== '--reset')
    throw new Error('Argumentos administrativos no admitidos.');
  commands.invite.push('--reset');
}
if (process.env.MM_APP_ENV !== 'production')
  throw new Error('Este iniciador solo admite producción.');
if (process.env.MM_APP_ORIGIN !== 'https://manzanas.ganamosclub.net')
  throw new Error('El origen de producción no coincide con el HTTPS autorizado.');
const commit = process.env.MM_COMMIT ?? '';
if (!/^[a-f0-9]{40}$/.test(commit) || process.env.MM_RELEASE !== `phase4-${commit.slice(0, 12)}`)
  throw new Error('La release de producción debe identificar su commit exacto.');
if (process.env.DATABASE_URL || process.env.MIGRATION_DATABASE_URL || process.env.MM_INTERNAL_TOKEN)
  throw new Error('Producción recibe credenciales solo desde sus archivos privados.');

function readSecret(name, filename, { minimum = 32, maximum = 4096 } = {}) {
  const file = process.env[`${name}_FILE`];
  if (file !== `/run/secrets/${filename}` || process.env[name])
    throw new Error(`Archivo privado inesperado para ${name}.`);
  const info = fs.lstatSync(file);
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.size < 1 ||
    info.size > maximum ||
    (info.mode & 0o777) !== 0o400 ||
    info.uid !== 1000 ||
    info.gid !== 1000 ||
    fs.realpathSync(file) !== file
  )
    throw new Error(`Permisos o ruta privada inválidos para ${name}.`);
  const value = fs.readFileSync(file, 'utf8').trim();
  if (value.length < minimum || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value))
    throw new Error(`Contenido privado inválido para ${name}.`);
  return value;
}

if (mode === 'api' || mode === 'web')
  process.env.MM_INTERNAL_TOKEN = readSecret('MM_INTERNAL_TOKEN', 'internal_token');
if (mode === 'web' && process.env.MM_API_BASE_URL !== 'http://api:3101')
  throw new Error('La web de producción debe usar exclusivamente su API interna.');
if (mode === 'api') {
  if (process.env.MM_API_HOST !== '0.0.0.0' || process.env.MM_API_PORT !== '3101')
    throw new Error('Listener interno de producción inesperado.');
  if (process.env.MM_PRODUCTION_GATE_FILE !== '/run/mm-production-state/activation.json')
    throw new Error('Falta la ruta de control de activación de producción.');
  const control = fs.lstatSync('/run/mm-production-state');
  if (
    !control.isDirectory() ||
    control.isSymbolicLink() ||
    control.uid !== 0 ||
    control.gid !== 1000 ||
    (control.mode & 0o777) !== 0o750 ||
    fs.realpathSync('/run/mm-production-state') !== '/run/mm-production-state'
  )
    throw new Error('El directorio de activación requiere root:1000 y modo 0750.');
  // Missing/inactive activation is handled dynamically by the API; liveness may start closed.
  process.env.DATABASE_URL = `postgresql://mm_prod_app:${encodeURIComponent(readSecret('MM_APP_PASSWORD', 'app_password'))}@postgres:5432/manzanas_maracay_production`;
  const names = ['MM_VAPID_PUBLIC_KEY', 'MM_VAPID_PRIVATE_KEY', 'MM_VAPID_SUBJECT'];
  if (names.some((name) => process.env[name]))
    throw new Error('VAPID requiere archivos exclusivos de producción.');
  if (names.some((name) => process.env[`${name}_FILE`])) {
    const publicKey = readSecret('MM_VAPID_PUBLIC_KEY', 'vapid_public_key', { minimum: 87 });
    const privateKey = readSecret('MM_VAPID_PRIVATE_KEY', 'vapid_private_key', { minimum: 43 });
    const subject = readSecret('MM_VAPID_SUBJECT', 'vapid_subject', { minimum: 1 });
    if (
      !/^[A-Za-z0-9_-]{87}$/.test(publicKey) ||
      !/^[A-Za-z0-9_-]{43}$/.test(privateKey) ||
      subject !== process.env.MM_APP_ORIGIN
    )
      throw new Error('Configuración VAPID de producción inválida.');
    try {
      const pair = createECDH('prime256v1');
      pair.setPrivateKey(Buffer.from(privateKey, 'base64url'));
      const expected = pair.getPublicKey();
      const actual = Buffer.from(publicKey, 'base64url');
      if (actual.length !== expected.length || !timingSafeEqual(expected, actual))
        throw new Error('mismatch');
    } catch {
      throw new Error('La pareja VAPID de producción no corresponde.');
    }
    process.env.MM_VAPID_PUBLIC_KEY = publicKey;
    process.env.MM_VAPID_PRIVATE_KEY = privateKey;
    process.env.MM_VAPID_SUBJECT = subject;
  }
} else {
  // An accidental inherited VAPID setting must not reach web/tools.
  for (const name of ['MM_VAPID_PUBLIC_KEY', 'MM_VAPID_PRIVATE_KEY', 'MM_VAPID_SUBJECT']) {
    if (process.env[name] || process.env[`${name}_FILE`])
      throw new Error('VAPID solo puede montarse en la API de producción.');
  }
}
if (mode === 'migrate' || mode === 'invite') {
  if (process.env.MM_PRIVATE_DIR !== '/run/secrets')
    throw new Error('Directorio administrativo inesperado.');
  process.env.MIGRATION_DATABASE_URL = `postgresql://mm_prod_owner:${encodeURIComponent(readSecret('MM_PG_PASSWORD', 'owner_password'))}@postgres:5432/manzanas_maracay_production`;
}
const child = spawn(process.execPath, commands[mode], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.once('error', () => {
  console.error('No se pudo iniciar el proceso de producción.');
  process.exitCode = 1;
});
child.once('exit', (code) => {
  process.exitCode = code ?? 1;
});
