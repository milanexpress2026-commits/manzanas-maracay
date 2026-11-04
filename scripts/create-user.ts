import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { provisionUser } from '../apps/api/src/auth/provision';
import { assertDatabase } from './migrate';

async function main() {
  const args = process.argv.slice(2);
  const index = args.indexOf('--file');
  if (index < 0 || !args[index + 1])
    throw new Error('Usa --file con un archivo privado de invitación.');
  const file = fs.realpathSync(path.resolve(args[index + 1]));
  const privateRoot = fs.realpathSync(path.resolve(process.env.MM_PRIVATE_DIR ?? '.local'));
  if (!file.startsWith(privateRoot + path.sep))
    throw new Error('El archivo debe estar dentro del directorio privado autorizado.');
  const stat = fs.statSync(file);
  if (
    !stat.isFile() ||
    stat.size > 16384 ||
    (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)
  )
    throw new Error('El archivo privado debe ser pequeño y tener permisos 0600.');
  const invitation = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as unknown;
  const pool = new Pool({
    connectionString: assertDatabase(process.env.MIGRATION_DATABASE_URL),
    max: 1,
  });
  try {
    await provisionUser(pool, invitation, { replaceExisting: args.includes('--reset') });
    console.log(
      'Acceso preparado. Entrega el archivo privado al destinatario por un canal seguro.',
    );
  } finally {
    await pool.end();
  }
}
main().catch(() => {
  console.error(
    'No se pudo preparar el acceso. Comprueba el archivo privado, la base del proyecto y si el usuario ya existe. No se imprimieron credenciales.',
  );
  process.exitCode = 1;
});
