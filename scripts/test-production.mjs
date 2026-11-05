/** Real production code under local TLS with synthetic data in a unique, marked QA DB. No remote targets. */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { root, loadLocalEnv } from './local-env.mjs';
import { startPostgres } from './postgres.mjs';

process.chdir(root);
loadLocalEnv();
const directory = path.resolve('.local/production-qa');
await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
const runId = randomBytes(12).toString('hex');
const database = `manzanas_maracay_production_test_${randomBytes(6).toString('hex')}`;
const admin = new URL(process.env.MIGRATION_DATABASE_URL);
admin.pathname = '/postgres';
if (admin.hostname !== '127.0.0.1' || admin.port !== '55432' || admin.username !== 'mm_owner')
  throw new Error('El ensayo requiere el servidor local del proyecto.');
const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
  windowsHide: true,
}).trim();
const origin = 'https://localhost:3143';
const release = `phase4-${commit.slice(0, 12)}`;
const activationFile = path.join(directory, `activation-${runId}.json`);
const env = {
  ...process.env,
  MM_APP_ENV: 'production',
  NODE_ENV: 'test',
  MM_PRODUCTION_TEST_DATABASE: database,
  MM_PRODUCTION_QA_STATE_FILE: path.join(directory, 'current.json'),
  MM_QA_RUN_ID: runId,
  MM_QA_ADMIN_DATABASE_URL: admin.toString(),
  MM_APP_ORIGIN: origin,
  MM_API_BASE_URL: 'http://127.0.0.1:3141',
  MM_WEB_PORT: '3140',
  MM_API_PORT: '3141',
  MM_API_HOST: '127.0.0.1',
  MM_RELEASE: release,
  MM_COMMIT: commit,
  MM_PRODUCTION_GATE_FILE: activationFile,
  MM_INTERNAL_TOKEN: randomBytes(32).toString('hex'),
};
// A local synthetic regression must never inherit real push configuration.
for (const key of Object.keys(env)) if (key.startsWith('MM_VAPID_')) delete env[key];
const children = [];
const logs = [];
let pg,
  server,
  stopping = false,
  setupAttempted = false;
const report = {
  runId,
  startedAt: new Date().toISOString(),
  baseCommit: commit,
  environment: 'production',
  purpose: 'isolated_synthetic_regression',
  origin,
  emptyPassed: false,
  operationsPassed: false,
  databaseCleaned: false,
};
function run(args, { wait = true, cwd = root, override = {} } = {}) {
  const log = fs.openSync(path.join(directory, `${runId}-${children.length}.log`), 'a', 0o600);
  logs.push(log);
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...env, ...override },
    windowsHide: true,
    stdio: ['ignore', log, log],
  });
  children.push(child);
  if (!wait) return child;
  return new Promise((resolve, reject) => {
    child.once('error', () => reject(new Error('No se inició un proceso del ensayo.')));
    child.once('exit', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `Un proceso del ensayo terminó con código ${code}. Revisar sus logs privados.`,
            ),
          ),
    );
  });
}
async function cleanup() {
  if (stopping) return;
  stopping = true;
  server?.closeAllConnections();
  if (server) await new Promise((resolve) => server.close(resolve));
  for (const child of children.filter((c) => c.exitCode === null)) {
    await new Promise((resolve) => {
      child.once('exit', resolve);
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          stdio: 'ignore',
          windowsHide: true,
        });
        killer.once('exit', resolve);
      } else child.kill('SIGTERM');
      setTimeout(resolve, 3000).unref();
    });
  }
  if (setupAttempted && pg)
    try {
      await run(['node_modules/tsx/dist/cli.mjs', 'scripts/production-qa-setup.ts', 'cleanup']);
      report.databaseCleaned = true;
    } catch {
      report.cleanupError = 'Base temporal retenida; no se forzó cierre ni borrado.';
    }
  if (pg)
    try {
      await pg.stop();
    } catch {
      report.databaseStopError = true;
    }
  for (const fd of logs)
    try {
      fs.closeSync(fd);
    } catch {}
  report.finishedAt = new Date().toISOString();
  await fsp.writeFile(
    path.join(directory, `${runId}-report.json`),
    JSON.stringify(report, null, 2),
  );
}
process.on('SIGINT', () => cleanup().then(() => process.exit(130)));
process.on('SIGTERM', () => cleanup().then(() => process.exit(143)));
try {
  for (const port of [3140, 3141, 3143])
    await new Promise((resolve, reject) => {
      const p = net.createServer();
      p.once('error', () =>
        reject(new Error(`Puerto local ${port} ocupado; no se modificó su proceso.`)),
      );
      p.listen(port, '127.0.0.1', () => p.close(resolve));
    });
  pg = await startPostgres();
  setupAttempted = true;
  await run(['node_modules/tsx/dist/cli.mjs', 'scripts/production-qa-setup.ts', 'setup']);
  const state = JSON.parse(await fsp.readFile(path.join(directory, 'current.json'), 'utf8'));
  if (state.runId !== runId || state.database !== database || !state.databaseInstanceId)
    throw new Error('El estado de ensayo no coincide.');
  Object.assign(env, {
    DATABASE_URL: state.applicationUrl,
    MIGRATION_DATABASE_URL: state.ownerUrl,
  });
  Object.assign(report, {
    emptyBusinessTablesVerified: state.emptyBusinessTablesVerified,
    limitedMigrationOwner: !state.productionOwnerSuperuser,
  });
  const cert = path.join(directory, `${runId}.crt`),
    key = path.join(directory, `${runId}.key`);
  const openssl =
    process.env.MM_QA_OPENSSL ||
    (process.platform === 'win32' ? 'C:/Program Files/Git/usr/bin/openssl.exe' : 'openssl');
  execFileSync(
    openssl,
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-sha256',
      '-days',
      '2',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { windowsHide: true, stdio: 'ignore' },
  );
  run(['apps/api/dist/apps/api/src/main.js'], { wait: false });
  run(
    [
      path.join(root, 'node_modules/next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
      '--port',
      '3140',
    ],
    { wait: false, cwd: path.join(root, 'apps/web'), override: { NODE_ENV: 'production' } },
  );
  server = https.createServer(
    { key: await fsp.readFile(key), cert: await fsp.readFile(cert) },
    (req, res) => {
      if (req.headers.host !== 'localhost:3143') {
        res.writeHead(400);
        res.end();
        return;
      }
      const upstream = http.request(
        {
          host: '127.0.0.1',
          port: 3140,
          path: req.url,
          method: req.method,
          headers: {
            ...req.headers,
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'localhost:3143',
          },
        },
        (response) => {
          res.writeHead(response.statusCode ?? 502, response.headers);
          response.pipe(res);
        },
      );
      upstream.on('error', () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(3143, '127.0.0.1', resolve);
  });
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch('http://127.0.0.1:3140/api/health', {
        signal: AbortSignal.timeout(1000),
      });
      const value = await response.json();
      if (response.ok && value.environment === 'production') {
        if (value.ready) throw new Error('Un ensayo nuevo no debe arrancar activado.');
        break;
      }
      if (attempt === 119) throw new Error('El servidor local no inició.');
    } catch (error) {
      if (attempt === 119) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  await run([
    'node_modules/playwright/cli.js',
    'test',
    '-c',
    'playwright.production.config.ts',
    'production-empty.spec.ts',
  ]);
  report.emptyPassed = true;
  const instant = new Date(),
    expiry = new Date(instant.getTime() + 3600000);
  const activation = {
    version: 1,
    state: 'active',
    environment: 'production',
    release,
    commit,
    database,
    databaseInstanceId: state.databaseInstanceId,
    origin,
    activatedAt: instant.toISOString(),
    approval: {
      reference: `SYNTHETIC_LOCAL_QA_ONLY:${runId}`,
      approvedAt: instant.toISOString(),
      expiresAt: expiry.toISOString(),
    },
    evidence: {
      externalBackupVerified: true,
      isolatedRestoreVerified: true,
      authenticationVerified: true,
      productionAccountVerified: true,
      dataIsolationVerified: true,
      infrastructureVerified: true,
      commercialNonFiscalScopeAcknowledged: true,
      cutoverAuthorized: true,
    },
  };
  // These booleans are a synthetic validator fixture, never evidence or authorization for a remote deployment.
  await fsp.writeFile(activationFile, JSON.stringify(activation), { flag: 'wx', mode: 0o600 });
  await run([
    'node_modules/playwright/cli.js',
    'test',
    '-c',
    'playwright.production.config.ts',
    'ux-v3-empty.spec.ts',
  ]);
  report.emptyUxPassed = true;
  await run([
    'node_modules/playwright/cli.js',
    'test',
    '-c',
    'playwright.production.config.ts',
    'production-ui.spec.ts',
  ]);
  await run([
    'node_modules/playwright/cli.js',
    'test',
    '-c',
    'playwright.production.config.ts',
    'production-api.spec.ts',
  ]);
  report.operationsPassed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : 'Falló el ensayo local';
  process.exitCode = 1;
} finally {
  await cleanup();
}
console.log(JSON.stringify(report, null, 2));
if (!report.databaseCleaned) process.exitCode = 1;
