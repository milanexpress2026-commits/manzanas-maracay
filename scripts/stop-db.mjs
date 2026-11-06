import { spawn } from 'node:child_process';
import path from 'node:path';
import { root } from './local-env.mjs';
import { ownedPidFile, resolveDatabaseDirectory } from './e2e-database.mjs';
export async function stopOwnedDatabase() {
  const directory = resolveDatabaseDirectory(root);
  if (!ownedPidFile(directory)) return;
  const binary =
    process.platform === 'win32'
      ? await import('@embedded-postgres/windows-x64')
      : process.platform === 'linux' && process.arch === 'x64'
        ? await import('@embedded-postgres/linux-x64')
        : null;
  if (!binary) throw new Error('Detén la base con Ctrl+C en la terminal que la inició.');
  await new Promise((resolve, reject) => {
    const child = spawn(binary.pg_ctl, ['-D', directory, 'stop', '-m', 'fast', '-w', '-t', '15'], {
      stdio: 'pipe',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(new Error('No se pudo detener la base exclusiva del proyecto.')),
    );
  });
  console.log('PostgreSQL del proyecto detenido; los datos se conservan.');
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(root, 'scripts', 'stop-db.mjs'))
  stopOwnedDatabase().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
