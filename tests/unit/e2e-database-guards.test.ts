import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const guardsPromise = import(pathToFileURL(path.resolve('scripts/e2e-database.mjs')).href);
let guards: Awaited<typeof guardsPromise>;
beforeAll(async () => {
  guards = await guardsPromise;
});
const id = 'a'.repeat(24);
let workspace: string;
beforeEach(() => {
  workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-e2e-guards-'));
});
afterEach(() => {
  const target = path.resolve(workspace);
  if (
    path.dirname(target) !== path.resolve(os.tmpdir()) ||
    !path.basename(target).startsWith('mm-e2e-guards-')
  )
    throw new Error('La carpeta temporal de prueba salió de su destino.');
  fs.rmSync(target, { recursive: true, force: true });
});

function legacy() {
  const directory = path.join(workspace, '.local', 'postgres');
  fs.mkdirSync(path.join(directory, 'global'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'global', 'pg_control'), 'synthetic-existing-cluster');
  return directory;
}
function pid(directory: string, port = '55432', owner = directory) {
  fs.writeFileSync(
    path.join(directory, 'postmaster.pid'),
    `12345\n${owner}\n1234567890\n${port}\n`,
  );
}

describe('aislamiento de la base E2E nueva', () => {
  it('mantiene el destino anterior por defecto y crea un clúster vacío diferente sin alterar su control', () => {
    const previous = legacy();
    const hash = guards.legacyControlHash(workspace);
    expect(guards.resolveDatabaseDirectory(workspace, {})).toBe(previous);
    const directory = guards.prepareFreshDatabase(workspace, id);
    expect(directory).toBe(path.join(workspace, '.local', 'e2e-fresh', id, 'postgres'));
    expect(fs.readdirSync(directory)).toEqual([]);
    expect(guards.resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: id })).toBe(directory);
    expect(guards.legacyControlHash(workspace)).toBe(hash);
    expect(() => guards.prepareFreshDatabase(workspace, id)).toThrow();
    expect(guards.legacyControlHash(workspace)).toBe(hash);
  });
  it('rechaza escape de ruta, identificador vacío y un clúster sin marcador válido', () => {
    for (const runId of ['', '..', '../postgres', 'a'.repeat(23), 'A'.repeat(24), id + '/child'])
      expect(() =>
        guards.resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: runId }),
      ).toThrow();
    fs.mkdirSync(path.join(workspace, '.local', 'e2e-fresh', id, 'postgres'), { recursive: true });
    expect(() => guards.resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: id })).toThrow(
      /marcador/,
    );
  });
  it('no prepara una ejecución cuando el clúster anterior aún tiene PID, incluso si está obsoleto', () => {
    const previous = legacy();
    pid(previous);
    expect(() => guards.prepareFreshDatabase(workspace, id)).toThrow(/PID/);
    expect(fs.existsSync(path.join(workspace, '.local', 'e2e-fresh'))).toBe(false);
    expect(fs.existsSync(path.join(previous, 'postmaster.pid'))).toBe(true);
  });
  it('rechaza un marcador copiado de otro proyecto o con propósito distinto', () => {
    const directory = guards.prepareFreshDatabase(workspace, id);
    const file = path.join(path.dirname(directory), 'ownership.json');
    const original = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const changed of [
      { ...original, workspace: path.join(workspace, 'different') },
      { ...original, purpose: 'production' },
      { ...original, runId: 'b'.repeat(24) },
    ]) {
      fs.writeFileSync(file, JSON.stringify(changed));
      expect(() => guards.resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: id })).toThrow(
        /marcador/,
      );
    }
  });
  it('rechaza una junction en los componentes de destino y conserva el objetivo enlazado', () => {
    const outside = path.join(workspace, 'unrelated');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'keep.txt'), 'keep');
    fs.mkdirSync(path.join(workspace, '.local'));
    fs.symlinkSync(outside, path.join(workspace, '.local', 'e2e-fresh'), 'junction');
    expect(() => guards.prepareFreshDatabase(workspace, id)).toThrow(/enlace|canónica/);
    expect(fs.readdirSync(outside)).toEqual(['keep.txt']);
  });
  it('rechaza enlaces en el marcador y en el PID antes de cualquier intento de detener procesos', () => {
    const directory = guards.prepareFreshDatabase(workspace, id);
    const marker = path.join(path.dirname(directory), 'ownership.json');
    const copy = path.join(workspace, 'marker-copy.json');
    fs.copyFileSync(marker, copy);
    fs.unlinkSync(marker);
    fs.linkSync(copy, marker);
    expect(() => guards.resolveDatabaseDirectory(workspace, { MM_E2E_PG_RUN_ID: id })).toThrow(
      /exclusivo/,
    );
    const fakePid = path.join(workspace, 'unrelated.pid');
    fs.writeFileSync(fakePid, `12345\n${directory}\n1234567890\n55432\n`);
    fs.linkSync(fakePid, path.join(directory, 'postmaster.pid'));
    expect(() => guards.ownedPidFile(directory)).toThrow(/exclusivo/);
  });
  it('valida ruta, puerto y PID numérico; jamás trata el PID de otra base como propio', () => {
    const directory = guards.prepareFreshDatabase(workspace, id);
    expect(guards.ownedPidFile(directory)).toBeNull();
    pid(directory, '55433');
    expect(() => guards.ownedPidFile(directory)).toThrow(/no corresponde/);
    pid(directory, '55432', path.join(workspace, '.local', 'postgres'));
    expect(() => guards.ownedPidFile(directory)).toThrow(/no corresponde/);
    pid(directory);
    expect(guards.ownedPidFile(directory)).toBe(path.join(directory, 'postmaster.pid'));
    fs.writeFileSync(path.join(directory, 'postmaster.pid'), `not-a-pid\n${directory}\n0\n55432\n`);
    expect(() => guards.ownedPidFile(directory)).toThrow(/no corresponde/);
  });
  it('detecta cambios del control anterior y guarda evidencia sin sobrescribir otro informe', () => {
    const previous = legacy();
    const before = guards.legacyControlHash(workspace);
    const directory = guards.prepareFreshDatabase(workspace, id);
    fs.writeFileSync(path.join(previous, 'global', 'pg_control'), 'changed-for-test');
    expect(guards.legacyControlHash(workspace)).not.toBe(before);
    guards.writeFreshReport(workspace, id, { runId: id, legacyUnchanged: false });
    expect(
      JSON.parse(fs.readFileSync(path.join(path.dirname(directory), 'result.json'), 'utf8')),
    ).toEqual({ runId: id, legacyUnchanged: false });
    expect(() => guards.writeFreshReport(workspace, id, {})).toThrow();
  });
});
