import { spawn } from 'node:child_process';
import { stopOwnedDatabase } from './stop-db.mjs';
import { startPostgres } from './postgres.mjs';
// Keep PostgreSQL outside Playwright's Windows process group so teardown cannot orphan its children.
await startPostgres();
const child = spawn(
  process.execPath,
  ['node_modules/playwright/cli.js', 'test', ...process.argv.slice(2)],
  { stdio: 'inherit', windowsHide: true },
);
const code = await new Promise((resolve) => {
  child.once('error', () => resolve(1));
  child.once('exit', resolve);
});
try {
  await stopOwnedDatabase();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
process.exitCode = process.exitCode || code || 0;
