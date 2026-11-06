import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const purpose = 'manzanas-maracay-e2e-fresh';
const markerName = 'ownership.json';
const validId = /^[a-f0-9]{24}$/;
const samePath = (a, b) =>
  process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

function stat(file) {
  try {
    return fs.lstatSync(file);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

export function assertDirectoryChain(directory, allowMissing = false) {
  const absolute = path.resolve(directory);
  const base = path.parse(absolute).root;
  let current = base;
  for (const part of absolute.slice(base.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, part);
    const info = stat(current);
    if (!info) {
      if (allowMissing) continue;
      throw new Error('Falta un directorio de la ejecución E2E.');
    }
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error('La ruta E2E contiene un enlace o un componente no permitido.');
    if (!samePath(fs.realpathSync.native(current), current))
      throw new Error('La ruta E2E no es canónica.');
  }
  return absolute;
}

function paths(workspace, runId) {
  const canonicalWorkspace = assertDirectoryChain(workspace);
  if (!validId.test(runId ?? '')) throw new Error('Identificador E2E inválido.');
  const parent = path.join(canonicalWorkspace, '.local', 'e2e-fresh');
  const run = path.join(parent, runId);
  if (path.dirname(run) !== parent) throw new Error('La ejecución E2E salió de su carpeta.');
  return { workspace: canonicalWorkspace, parent, run, directory: path.join(run, 'postgres') };
}

function marker(workspace, runId) {
  return { version: 1, purpose, runId, workspace };
}

export function assertLegacyDatabaseStopped(workspace) {
  const directory = assertDirectoryChain(path.join(workspace, '.local', 'postgres'), true);
  if (stat(path.join(directory, 'postmaster.pid')))
    throw new Error('La base local anterior tiene un PID. No se inició ni detuvo ningún proceso.');
}

export function prepareFreshDatabase(workspace, runId) {
  const own = paths(workspace, runId);
  assertLegacyDatabaseStopped(own.workspace);
  for (const directory of [path.join(own.workspace, '.local'), own.parent]) {
    assertDirectoryChain(directory, true);
    if (!stat(directory)) fs.mkdirSync(directory, { mode: 0o700 });
    assertDirectoryChain(directory);
  }
  // A run is never reused or overwritten, even if its PostgreSQL directory is empty.
  fs.mkdirSync(own.run, { mode: 0o700 });
  assertDirectoryChain(own.run);
  fs.writeFileSync(path.join(own.run, markerName), JSON.stringify(marker(own.workspace, runId)), {
    flag: 'wx',
    mode: 0o600,
  });
  fs.mkdirSync(own.directory, { mode: 0o700 });
  return resolveDatabaseDirectory(own.workspace, { MM_E2E_PG_RUN_ID: runId });
}

export function resolveDatabaseDirectory(workspace, environment = process.env) {
  const runId = environment.MM_E2E_PG_RUN_ID;
  if (runId === undefined)
    return assertDirectoryChain(path.join(workspace, '.local', 'postgres'), true);
  const own = paths(workspace, runId);
  assertDirectoryChain(own.directory);
  const file = path.join(own.run, markerName);
  const info = stat(file);
  if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 4096)
    throw new Error('Falta un marcador E2E regular y exclusivo.');
  let saved;
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    throw new Error('El marcador E2E no es válido.');
  }
  const expected = marker(own.workspace, runId);
  if (
    Object.keys(saved ?? {}).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, value]) => saved?.[key] !== value)
  )
    throw new Error('El marcador E2E pertenece a otra ejecución o proyecto.');
  return own.directory;
}

export function legacyControlHash(workspace) {
  const directory = assertDirectoryChain(
    path.join(workspace, '.local', 'postgres', 'global'),
    true,
  );
  const file = path.join(directory, 'pg_control');
  const info = stat(file);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
    throw new Error('El control de la base anterior no es un archivo regular exclusivo.');
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

export function ownedPidFile(directory) {
  assertDirectoryChain(directory, true);
  const file = path.join(directory, 'postmaster.pid');
  const info = stat(file);
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || info.size > 16384)
    throw new Error('El PID de PostgreSQL no es un archivo regular exclusivo.');
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  if (
    !/^[1-9]\d*$/.test(lines[0] ?? '') ||
    !lines[1] ||
    !samePath(path.resolve(lines[1]), path.resolve(directory)) ||
    lines[3] !== '55432'
  )
    throw new Error('El archivo PID no corresponde a este proyecto. No se detuvo ningún proceso.');
  return file;
}

export function writeFreshReport(workspace, runId, report) {
  const directory = resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: runId });
  fs.writeFileSync(
    path.join(path.dirname(directory), 'result.json'),
    JSON.stringify(report, null, 2) + '\n',
    {
      flag: 'wx',
      mode: 0o600,
    },
  );
}
