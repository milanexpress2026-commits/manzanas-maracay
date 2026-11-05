import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Connects to the existing, exclusive local app. It never starts services or writes business data.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'http://127.0.0.1:3100';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/browsers');
const { chromium } = await import('playwright');
const { default: AxeBuilder } = await import('@axe-core/playwright');
const output = path.join(root, 'docs/capturas/fase3');
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const findings = { screens: [], accessibility: [], pageErrors: [] };
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('pageerror', (error) => findings.pageErrors.push(error.message));
  async function capture(name, width) {
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error(`Desbordamiento en ${name} a ${width}px.`);
    const audit = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    const issues = audit.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    }));
    findings.accessibility.push({ name, width, issues });
    await page.screenshot({ path: path.join(output, `${name}-${width}.png`), fullPage: true });
    findings.screens.push({ name, width, horizontalOverflow: false });
  }
  for (const width of [1440, 390]) {
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
      await page.locator('h1').waitFor();
      await capture(route === '/' ? 'inicio' : route.slice(1).replaceAll('/', '-'), width);
    }
  }
  const credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.local/auth-local.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  const login = await page.request.post(origin + '/api/auth/login', {
    headers: { Origin: origin },
    data: { username: credentials.username, password: credentials.password },
  });
  if (!login.ok()) throw new Error('No se pudo autenticar la cuenta local de capturas.');
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
    for (const route of [
      '/catalogo',
      '/inventario',
      '/recepciones',
      '/proveedores',
      '/clientes',
      '/ventas',
      '/ventas/nueva',
      '/cobranza',
    ]) {
      await page.goto(origin + route);
      await page.locator('h1').waitFor();
      await capture('interno-' + route.slice(1).replaceAll('/', '-'), width);
    }
  }
  await page.close();
  const videoContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: {
      dir: path.join(root, '.local/phase3-video'),
      size: { width: 1280, height: 900 },
    },
  });
  const videoPage = await videoContext.newPage();
  const hold = (ms) => videoPage.waitForTimeout(ms);
  await videoPage.goto(origin);
  await videoPage.waitForLoadState('networkidle');
  await hold(1600);
  await videoPage.getByRole('link', { name: 'Explorar demostración' }).click();
  await videoPage.locator('h1').waitFor();
  await hold(1600);
  await videoPage.getByRole('link', { name: 'Catálogo', exact: true }).click();
  await videoPage.getByRole('textbox', { name: 'Buscar productos de ejemplo' }).fill('Kiwi');
  await hold(1000);
  await videoPage.getByRole('button', { name: /Ver detalle de Kiwi/ }).click();
  await hold(1800);
  await videoPage.getByRole('button', { name: 'Cerrar ejemplo' }).click();
  await videoPage.getByRole('link', { name: 'Inventario', exact: true }).click();
  await hold(1400);
  await videoPage.getByRole('link', { name: 'Ventas', exact: true }).click();
  await hold(1600);
  await videoPage.getByRole('button', { name: 'Ver comprobante de ejemplo' }).click();
  await hold(1800);
  await videoPage.getByRole('button', { name: 'Cerrar ejemplo' }).click();
  await videoPage.getByRole('link', { name: 'Cobranza', exact: true }).click();
  await hold(1600);
  await videoPage.getByRole('button', { name: 'Ver recibo de ejemplo' }).click();
  await hold(1800);
  await videoPage.getByRole('button', { name: 'Cerrar ejemplo' }).click();
  await hold(800);
  const video = videoPage.video();
  await videoContext.close();
  await video.saveAs(path.join(output, 'recorrido-demo.webm'));
  fs.writeFileSync(
    path.join(output, 'revision-automatica.json'),
    JSON.stringify(findings, null, 2),
  );
  const problems = findings.accessibility.filter((item) => item.issues.length);
  if (problems.length || findings.pageErrors.length)
    throw new Error(
      `Revisión pendiente: ${problems.length} pantallas con hallazgos de accesibilidad; ${findings.pageErrors.length} errores de navegador. Ver revision-automatica.json.`,
    );
  console.log(
    `Capturadas ${findings.screens.length} vistas y un vídeo real de navegación. Sin mutaciones comerciales.`,
  );
} finally {
  await browser.close();
}
