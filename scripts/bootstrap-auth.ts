import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { assertDatabase } from './migrate';
import { provisionUser } from '../apps/api/src/auth/provision';
import { invitationSchema } from '../packages/domain/src/auth';

async function bootstrap() {
  const environment = process.env.MM_APP_ENV ?? 'local';
  if (!['local', 'test'].includes(environment))
    throw new Error('La creación automática de usuarios solo está disponible en local y test.');
  const url = assertDatabase(process.env.MIGRATION_DATABASE_URL);
  const expected = environment === 'test' ? '/manzanas_maracay_test' : '/manzanas_maracay_dev';
  if (new URL(url).pathname !== expected) throw new Error('El entorno y la base no coinciden.');
  const file = path.resolve('.local', `auth-${environment}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({
      username: environment === 'test' ? 'pruebas' : 'propietario',
      displayName: environment === 'test' ? 'Pruebas automáticas' : 'Propietario',
      password: randomBytes(24).toString('base64url'),
    }, null, 2), { flag: 'wx', mode: 0o600 });
  }
  const input = invitationSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    const existing = await pool.query('SELECT 1 FROM app_users WHERE username=$1', [input.username]);
    if (!existing.rowCount) await provisionUser(pool, input);
    console.log(`Acceso ${environment} preparado. Datos privados en .local/auth-${environment}.json; no compartir ni versionar.`);
  } finally { await pool.end(); }
}
bootstrap().catch(() => {
  console.error('No se pudo preparar el acceso local. Revisa el archivo privado y la configuración de la base.');
  process.exitCode = 1;
});
