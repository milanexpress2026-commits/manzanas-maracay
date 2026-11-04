import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { root } from './local-env.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/browsers');
const { chromium } = await import('playwright');
const child = spawn(process.execPath, ['scripts/dev.mjs'], {
  cwd: root,
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
  windowsHide: true,
});
const stopped = new Promise((resolve) => child.once('exit', resolve));
let browser;
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch('http://127.0.0.1:3100/api/health')).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error('La aplicación local no inició.');
  browser = await chromium.launch({ headless: true });
  fs.mkdirSync(path.join(root, 'docs/capturas'), { recursive: true });
  const page = await browser.newPage();
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('http://127.0.0.1:3100/');
    await page.waitForLoadState('networkidle');
    await page.getByText('Guardado en PostgreSQL').waitFor();
    await page.getByRole('button', { name: 'Ver Manzana Gala calibre 80', exact: true }).click();
    await page.screenshot({
      path: path.join(
        root,
        `docs/capturas/catalogo-${viewport.width === 1440 ? 'escritorio' : 'movil'}.png`,
      ),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'Editar empaque', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({
    path: path.join(root, 'docs/capturas/formulario-movil.png'),
    fullPage: true,
  });
  console.log('Capturas finales creadas desde la base de desarrollo, sin modificar registros.');
} finally {
  if (browser) await browser.close();
  if (child.connected) child.send('shutdown');
  await stopped;
}
