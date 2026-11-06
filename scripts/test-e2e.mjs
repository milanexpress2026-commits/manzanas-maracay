import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { stopOwnedDatabase } from './stop-db.mjs';
import { startPostgres } from './postgres.mjs';
import { root } from './local-env.mjs';
import {
  legacyControlHash,
  ownedPidFile,
  prepareFreshDatabase,
  resolveDatabaseDirectory,
  writeFreshReport,
} from './e2e-database.mjs';

const args = process.argv.slice(2);
const fresh = args.includes('--fresh-db');
const runId = fresh ? randomBytes(12).toString('hex') : null;
const report = {
  version: 1,
  runId,
  startedAt: new Date().toISOString(),
  finishedAt: null,
  postgresStarted: false,
  postgresStopped: false,
  playwrightExitCode: null,
  exitCode: 1,
  freshPidGone: null,
  legacyControlBefore: null,
  legacyControlAfter: null,
  legacyUnchanged: null,
  failedPhase: null,
};
let prepared = false;
let phase = 'prepare';
let code = 1;
try {
  if (
    process.env.MM_E2E_PG_RUN_ID !== undefined ||
    args.filter((arg) => arg === '--fresh-db').length > 1
  )
    throw new Error('Usa --fresh-db una sola vez y sin un identificador heredado.');
  if (fresh) {
    report.legacyControlBefore = legacyControlHash(root);
    prepareFreshDatabase(root, runId);
    prepared = true;
    process.env.MM_E2E_PG_RUN_ID = runId;
  }
  phase = 'start';
  // Keep PostgreSQL outside Playwright's Windows process group so teardown cannot orphan its children.
  await startPostgres();
  report.postgresStarted = true;
  phase = 'tests';
  const child = spawn(
    process.execPath,
    ['node_modules/playwright/cli.js', 'test', ...args.filter((arg) => arg !== '--fresh-db')],
    { cwd: root, stdio: 'inherit', windowsHide: true, env: process.env },
  );
  code = await new Promise((resolve) => {
    child.once('error', () => resolve(1));
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  report.playwrightExitCode = code;
  if (code !== 0) report.failedPhase = 'tests';
} catch {
  report.failedPhase = phase;
  console.error(`E2E no completado en la etapa ${phase}; se conservarán las bases para revisión.`);
} finally {
  try {
    if (report.postgresStarted || prepared) {
      await stopOwnedDatabase();
      report.postgresStopped = true;
    }
  } catch {
    code = 1;
    report.failedPhase = 'stop';
    console.error('No se confirmó la detención de la base exclusiva de esta ejecución.');
  }
  if (fresh && prepared) {
    try {
      report.freshPidGone = ownedPidFile(resolveDatabaseDirectory(root)) === null;
      report.legacyControlAfter = legacyControlHash(root);
      report.legacyUnchanged = report.legacyControlBefore === report.legacyControlAfter;
      if (!report.freshPidGone || !report.legacyUnchanged) {
        code = 1;
        report.failedPhase = 'preservation';
      }
    } catch {
      code = 1;
      report.failedPhase = 'preservation';
      console.error('No se pudo completar la evidencia de preservación de las bases E2E.');
    }
    report.exitCode = code;
    report.finishedAt = new Date().toISOString();
    try {
      writeFreshReport(root, runId, report);
      console.log(JSON.stringify({ e2eFreshDatabase: report }));
    } catch {
      code = 1;
      console.error('No se pudo guardar el informe de la ejecución E2E.');
    }
  }
}
process.exitCode = code;
