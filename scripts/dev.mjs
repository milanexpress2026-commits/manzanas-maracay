import { spawn } from 'node:child_process';
import path from 'node:path';
import net from 'node:net';
import { startPostgres } from './postgres.mjs';
import { root, loadLocalEnv } from './local-env.mjs';
loadLocalEnv();
process.chdir(root);
const testing = process.argv.includes('--test');
const production = process.argv.includes('--production');
process.env.MM_APP_ENV = testing ? 'test' : 'local';
if (testing) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(
    '/manzanas_maracay_dev',
    '/manzanas_maracay_test',
  );
  process.env.MIGRATION_DATABASE_URL = process.env.MIGRATION_DATABASE_URL.replace(
    '/manzanas_maracay_dev',
    '/manzanas_maracay_test',
  );
  process.env.MM_WEB_PORT = '3200';
  process.env.MM_API_PORT = '3201';
}
process.env.MM_APP_ORIGIN = `http://127.0.0.1:${process.env.MM_WEB_PORT}`;
process.env.MM_API_BASE_URL = `http://127.0.0.1:${process.env.MM_API_PORT}`;
const children = [];
function run(args, wait = true, cwd = root) {
  const child = spawn(process.execPath, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  });
  children.push(child);
  return wait
    ? new Promise((resolve, reject) => {
        child.on('error', reject);
        child.on('exit', (code) =>
          code === 0 ? resolve() : reject(new Error('Un proceso del proyecto terminó con error.')),
        );
      })
    : child;
}
let pg,
  stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children
      .filter((child) => child.exitCode === null)
      .map(
        (child) =>
          new Promise((resolve) => {
            child.once('exit', resolve);
            if (process.platform === 'win32') {
              // Only the process IDs created by this launcher and their own children.
              spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
                windowsHide: true,
                stdio: 'ignore',
              });
            } else child.kill();
            setTimeout(resolve, 2000).unref();
          }),
      ),
  );
  if (pg) await pg.stop();
}
process.on('SIGINT', () => stop().then(() => process.exit(0)));
process.on('SIGTERM', () => stop().then(() => process.exit(0)));
process.on('message', (message) => {
  if (message === 'shutdown') void stop().then(() => process.exit(0));
});
try {
  for (const port of [process.env.MM_WEB_PORT, process.env.MM_API_PORT]) {
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () =>
        reject(new Error(`El puerto ${port} está ocupado. No se modificó ningún servicio.`)),
      );
      probe.listen(Number(port), '127.0.0.1', () => probe.close(resolve));
    });
  }
  if (!process.argv.includes('--external-db')) pg = await startPostgres();
  await run(['node_modules/tsx/dist/cli.mjs', 'scripts/migrate.ts']);
  await run(['node_modules/tsx/dist/cli.mjs', 'scripts/seed.ts']);
  await run(['node_modules/tsx/dist/cli.mjs', 'scripts/bootstrap-auth.ts']);
  await run(['node_modules/typescript/bin/tsc', '-p', 'apps/api/tsconfig.json']);
  const api = run(['apps/api/dist/apps/api/src/main.js'], false);
  const ready = async () => {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${process.env.MM_API_PORT}/api/health`)).ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('La API no inició.');
  };
  await ready();
  const web = run(
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      testing || production ? 'start' : 'dev',
      '--hostname',
      '127.0.0.1',
      '--port',
      process.env.MM_WEB_PORT,
    ],
    false,
    path.join(root, 'apps/web'),
  );
  console.log(`Manzanas Maracay: http://127.0.0.1:${process.env.MM_WEB_PORT}`);
  for (const child of [api, web])
    child.on('exit', () => {
      if (!stopping) stop().then(() => process.exit(1));
    });
} catch (error) {
  console.error(error.message);
  await stop();
  process.exitCode = 1;
}
