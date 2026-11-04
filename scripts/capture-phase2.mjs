import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { root } from './local-env.mjs';

// Local, documented DEMO only. All inventory changes go through the authenticated API.
const origin = 'http://127.0.0.1:3100';
const supplierName = 'DEMO · Distribuidora de frutas';
const reference = 'DEMO-VISTA-PREVIA';
const demoNotes =
  'DEMO · Datos ficticios para la vista previa. USD 45 es un costo de ejemplo, no un precio comercial.';
const withdrawalReason = 'DEMO · Retiro de un blíster para la vista previa';
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, '.local/browsers');
const { chromium } = await import('playwright');
const existingServer = process.argv.includes('--existing-server');
const child = existingServer
  ? null
  : spawn(
      process.execPath,
      [
        'scripts/dev.mjs',
        '--production',
        ...(process.argv.includes('--external-db') ? ['--external-db'] : []),
      ],
      {
        cwd: root,
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
        windowsHide: true,
      },
    );
const stopped = child ? new Promise((resolve) => child.once('exit', resolve)) : Promise.resolve();
let browser;
try {
  let ready = false;
  for (let i = 0; i < 180; i++) {
    if (child?.exitCode !== null && child?.exitCode !== undefined) break;
    try {
      if ((await fetch(`${origin}/api/health`)).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('La aplicación local no inició.');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const output = path.join(root, 'docs/capturas');
  fs.mkdirSync(output, { recursive: true });
  const viewports = [
    { name: 'escritorio', width: 1440, height: 1000 },
    { name: 'movil', width: 390, height: 844 },
  ];
  async function screenshot(name, viewport, fullPage = true) {
    if (!(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)))
      throw new Error(`Desbordamiento horizontal en ${name}-${viewport.name}.`);
    await page.screenshot({
      path: path.join(output, `fase2-${name}-${viewport.name}.png`),
      fullPage,
    });
  }
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/login`);
    await page.getByRole('heading', { name: 'Bienvenido a Manzanas Maracay' }).waitFor();
    await page.waitForLoadState('networkidle');
    await screenshot('login', viewport);
  }
  const credentials = JSON.parse(
    fs.readFileSync(path.join(root, '.local/auth-local.json'), 'utf8').replace(/^\uFEFF/, ''),
  );
  const login = await page.request.post(`${origin}/api/auth/login`, {
    headers: { Origin: origin },
    data: { username: credentials.username, password: credentials.password },
  });
  if (!login.ok()) throw new Error('No se pudo iniciar la sesión privada para las capturas.');
  async function read(endpoint) {
    const response = await page.request.get(`${origin}${endpoint}`);
    if (!response.ok()) throw new Error(`Consulta ${endpoint}: HTTP ${response.status()}.`);
    return response.json();
  }
  async function post(endpoint, data) {
    const response = await page.request.post(`${origin}${endpoint}`, {
      headers: { Origin: origin, 'Idempotency-Key': randomUUID() },
      data,
    });
    if (!response.ok()) throw new Error(`Operación DEMO ${endpoint}: HTTP ${response.status()}.`);
    return response.json();
  }
  let supplier = (await read('/api/suppliers')).find((item) => item.name === supplierName);
  if (!supplier) supplier = await post('/api/suppliers', { name: supplierName, notes: demoNotes });
  if (!supplier.active) throw new Error('El proveedor DEMO está inactivo; se conservó su estado.');
  const catalog = await read('/api/catalog');
  const config = catalog.configurations.find(
    (item) => item.variety === 'Gala' && item.caliber === '80',
  );
  if (!config) throw new Error('No existe el empaque Gala calibre 80 para la vista previa.');
  let detail;
  for (const lot of (await read('/api/inventory')).lots.filter(
    (item) => item.isDemo && item.supplierId === supplier.id,
  )) {
    const candidate = await read(`/api/inventory/lots/${lot.id}`);
    if (
      candidate.movements.some(
        (movement) => movement.kind === 'receipt' && movement.reason === `Recepción ${reference}`,
      )
    ) {
      detail = candidate;
      break;
    }
  }
  if (!detail) {
    const receipt = await post('/api/receipts', {
      supplierId: supplier.id,
      reference,
      receivedAt: new Date().toISOString(),
      notes: demoNotes,
      isDemo: true,
      lines: [
        {
          configurationId: config.id,
          boxes: 3,
          unitCostUsd: '45.0000',
          blistersPerBox: 5,
          notes: demoNotes,
        },
      ],
    });
    detail = await read(`/api/inventory/lots/${receipt.lots[0].id}`);
  }
  if (!detail.lot.isDemo) throw new Error('La vista previa exige un lote marcado DEMO.');
  if (!detail.movements.some((movement) => movement.reason === withdrawalReason)) {
    // Only initialize the untouched demo receipt; never adjust an already worked lot to fit a screenshot.
    if (detail.movements.length !== 1 || detail.lot.closedBoxes !== 3)
      throw new Error('El lote DEMO tiene movimientos posteriores; se conserva y no se modifica.');
    await post(`/api/inventory/lots/${detail.lot.id}/withdraw-blisters`, {
      quantity: 1,
      reason: withdrawalReason,
    });
    detail = await read(`/api/inventory/lots/${detail.lot.id}`);
  }
  const closedBox = detail.containers.find(
    (item) => item.kind === 'box' && item.state === 'sealed' && item.quantity === 1,
  );
  if (!closedBox)
    throw new Error('El lote DEMO no tiene una caja cerrada para mostrar el formulario.');
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto(`${origin}/proveedores`);
    await page.getByRole('heading', { name: supplierName, exact: true }).waitFor();
    await page.getByLabel('Buscar proveedores').fill(supplierName);
    await screenshot('proveedores', viewport);

    await page.goto(`${origin}/recepciones`);
    await page.getByLabel('Proveedor', { exact: true }).selectOption(supplier.id);
    await page.getByLabel('Referencia del documento').fill('DEMO-FORMULARIO-SIN-GUARDAR');
    await page.getByLabel('Fecha y hora de recepción').fill('2026-11-04T10:30');
    await page.getByLabel('Observaciones generales').fill(demoNotes);
    await page.getByLabel('Fruta, variedad y calibre').selectOption(config.id);
    await page.getByLabel('Cajas cerradas recibidas').fill('3');
    await page.getByLabel('Costo por caja (USD)').fill('45,00');
    await page.getByLabel('Blíster por caja en este lote').fill('5');
    await page.getByLabel('Notas del lote').fill('DEMO · Ejemplo del formulario, sin guardar.');
    await screenshot('recepcion', viewport);

    await page.goto(`${origin}/inventario?lote=${detail.lot.id}`);
    await page
      .getByRole('heading', { name: `Detalle del lote ${detail.lot.code}`, exact: true })
      .waitFor();
    await page.getByLabel('Buscar lotes').fill(supplierName);
    await page.evaluate(() => window.scrollTo(0, 0));
    await screenshot('inventario', viewport);
    const box = page.getByRole('article').filter({
      has: page.getByRole('heading', { name: `Caja · ${closedBox.id.slice(0, 8)}`, exact: true }),
    });
    await box.getByRole('button', { name: 'Preparar mitad', exact: true }).click();
    await page.getByLabel('Frutas contadas antes de preparar').fill('37');
    await page.getByLabel('Frutas en la media caja preparada').fill('18');
    await page.getByLabel('Frutas que quedan sueltas').fill('19');
    await page
      .getByLabel('Motivo del movimiento')
      .fill('DEMO · Ejemplo de conteo físico: 37 = 18 + 19. Sin confirmar.');
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Revisar movimiento', exact: true })
      .click();
    await screenshot('media-caja', viewport, false);
    await page.keyboard.press('Escape');
  }
  const finalDetail = await read(`/api/inventory/lots/${detail.lot.id}`);
  if (
    finalDetail.lot.version !== detail.lot.version ||
    finalDetail.movements.length !== detail.movements.length
  )
    throw new Error('El lote DEMO cambió durante las capturas; revisa sus movimientos.');
  console.log(
    `Lote DEMO ${detail.lot.code}: ${finalDetail.lot.closedBoxes} cajas cerradas, ${finalDetail.lot.intactBlisters} blíster intactos, ${finalDetail.movements.length} movimientos. Formularios sin guardar verificados.`,
  );
  console.log(
    'Diez capturas de fase 2 guardadas en docs/capturas. Solo se creó el ejemplo DEMO cuando faltaba; ningún formulario capturado se confirmó.',
  );
} finally {
  if (browser) await browser.close();
  if (child?.connected) child.send('shutdown');
  await stopped;
}
