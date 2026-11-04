// Standalone public preview verification. Starts only local ports 3300/3301, never PostgreSQL.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd(),
  origin = 'http://127.0.0.1:3300';
fs.mkdirSync(path.join(root, '.local'), { recursive: true });
for (const port of [3300, 3301])
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
const env = {
  ...process.env,
  MM_RELEASE: 'demo-preview-f9b532b',
  MM_APP_ENV: 'local',
  MM_APP_ORIGIN: origin,
  MM_WEB_PORT: '3300',
  MM_API_PORT: '3301',
  MM_API_HOST: '127.0.0.1',
  MM_API_BASE_URL: 'http://127.0.0.1:3301',
  MM_INTERNAL_TOKEN: randomBytes(32).toString('hex'),
  DATABASE_URL: 'postgresql://disabled:disabled@127.0.0.1:1/no_database',
  NEXT_TELEMETRY_DISABLED: '1',
};
const children = [];
function start(args, cwd) {
  const child = spawn(process.execPath, args, {
    cwd,
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', (b) => fs.appendFileSync('.local/demo-smoke-process.log', b));
  child.stderr.on('data', (b) => fs.appendFileSync('.local/demo-smoke-process.log', b));
  children.push(child);
  return child;
}
let browser;
const results = { publicRoutes: [], privateStatus: [], viewportAudits: [], errors: [] };
try {
  start(['apps/api/dist/apps/api/src/main.js'], root);
  start(
    ['../../node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3300'],
    path.join(root, 'apps/web'),
  );
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (children.some((c) => c.exitCode !== null))
      throw new Error('Un proceso de prueba terminó antes de estar listo.');
    try {
      if (
        (await fetch(origin)).ok &&
        (await fetch('http://127.0.0.1:3301/api/catalog')).status === 401
      ) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  assert(ready, 'Servicios de prueba no iniciaron.');
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.local/browsers');
  const { chromium } = await import('playwright');
  const { default: AxeBuilder } = await import('@axe-core/playwright');
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const apiRequests = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) apiRequests.push(r.url());
  });
  page.on('pageerror', (e) => results.errors.push(e.message));
  const routes = [
    '/',
    '/demo',
    '/demo/catalogo',
    '/demo/inventario',
    '/demo/recepciones',
    '/demo/ventas',
    '/demo/cobranza',
  ];
  for (const route of routes) {
    const response = await page.goto(origin + route);
    assert.equal(response.status(), 200);
    await page.locator('h1').waitFor();
    results.publicRoutes.push({ route, status: 200 });
  }
  assert.deepEqual(apiRequests, [], 'La demo no debe consultar API');
  assert.equal(
    (await page.context().cookies()).some((c) => c.name === 'mm_session'),
    false,
  );
  const privatePage = await page.request.get(origin + '/catalogo', { maxRedirects: 0 });
  assert.equal(privatePage.status(), 307);
  assert.equal(privatePage.headers().location, '/login');
  results.privateStatus.push({ method: 'GET', route: '/catalogo', status: 307 });
  for (const route of ['/api/catalog', '/api/inventory', '/api/suppliers']) {
    const response = await page.request.get(origin + route);
    assert.equal(response.status(), 401);
    results.privateStatus.push({ method: 'GET', route, status: 401 });
  }
  for (const [method, route] of [
    ['POST', '/api/receipts'],
    ['PATCH', '/api/catalog/configurations/' + randomUUID()],
  ]) {
    const response = await page.request.fetch(origin + route, {
      method,
      headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
      data: {},
    });
    assert.equal(response.status(), 401);
    results.privateStatus.push({ method, route, status: 401 });
  }
  const captures = path.join(root, 'docs/capturas/demo-publica');
  fs.mkdirSync(captures, { recursive: true });
  for (const width of [390, 800, 1024, 1440]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of [
      '/',
      '/demo',
      '/demo/catalogo',
      '/demo/inventario',
      '/demo/recepciones',
      '/demo/ventas',
      '/demo/cobranza',
    ]) {
      await page.goto(origin + route);
      await page.waitForLoadState('networkidle');
      assert(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Desbordamiento ' + route + ' ' + width,
      );
      const issues = (
        await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
      ).violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }));
      results.viewportAudits.push({ route, width, issues });
      if (issues.length) throw new Error(JSON.stringify({ route, width, issues }));
      if (width === 390 || width === 1440)
        await page.screenshot({
          path: path.join(
            captures,
            (route === '/' ? 'inicio' : route.slice(1).replaceAll('/', '-')) + '-' + width + '.png',
          ),
          fullPage: true,
        });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(origin + '/demo/ventas');
  const opener = page.getByRole('button', { name: 'Ver comprobante de ejemplo' });
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor();
  assert(
    await page
      .getByRole('dialog')
      .evaluate((el) => parseFloat(getComputedStyle(el).animationDuration) < 0.01),
  );
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  assert(await opener.evaluate((el) => el === document.activeElement));
  assert.deepEqual(results.errors, []);
  console.log(
    'PASS: 7 rutas públicas sin API/sesión, guardas privadas,28 auditorías a11y/responsive, foco y reduced-motion. Sin PostgreSQL.',
  );
} finally {
  fs.writeFileSync('.local/demo-smoke-result.json', JSON.stringify(results, null, 2));
  if (browser) await browser.close();
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null) return resolve();
          child.once('exit', resolve);
          child.kill();
        }),
    ),
  );
}
