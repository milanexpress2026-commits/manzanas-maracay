import { test, expect } from '@playwright/test';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { Client, Pool } from 'pg';
import dotenv from 'dotenv';
import { testCredentials, loginRequest } from './helpers/auth';
import { provisionUser } from '../../apps/api/src/auth/provision';
dotenv.config({ quiet: true });

const origin = { Origin: 'http://127.0.0.1:3200' };
function testDatabaseUrl() {
  const url = new URL(process.env.MIGRATION_DATABASE_URL!);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55432' ||
    url.username !== 'mm_owner' ||
    !['/manzanas_maracay_dev', '/manzanas_maracay_test'].includes(url.pathname)
  )
    throw new Error('La prueba solo admite PostgreSQL local exclusivo.');
  url.pathname = '/manzanas_maracay_test';
  return url.toString();
}
test('sin sesión: pantalla privada redirige y las APIs rechazan lectura y escritura', async ({
  page,
  request,
}) => {
  await page.goto('/catalogo');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Bienvenido a Manzanas Maracay' })).toBeVisible();
  for (const endpoint of [
    'catalog',
    'catalog/options',
    'receipts/options',
    'suppliers',
    'inventory',
    'auth/me',
  ])
    expect((await request.get(`/api/${endpoint}`)).status()).toBe(401);
  expect(
    (
      await request.post('/api/catalog/fruits', {
        headers: { ...origin, 'Idempotency-Key': randomUUID() },
        data: { name: 'No autorizada' },
      })
    ).status(),
  ).toBe(401);
});

test('login real, persistencia al recargar, cookie protegida, CSRF y logout', async ({
  page,
  context,
}) => {
  const credentials = testCredentials();
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(credentials.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3200/catalogo');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Catálogo de productos' })).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === 'mm_session');
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Strict');
  expect(
    (
      await page.request.post('/api/catalog/fruits', {
        headers: { Origin: 'https://foreign.example.test', 'Idempotency-Key': randomUUID() },
        data: { name: 'No autorizada' },
      })
    ).status(),
  ).toBe(403);
  const logout = await page.request.post('/api/auth/logout', { headers: origin, data: {} });
  expect(logout.ok()).toBe(true);
  expect((await page.request.get('/api/auth/me')).status()).toBe(401);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});

test('acceso inválido se limita de forma persistente, sin distinguir usuario existente', async ({
  request,
}) => {
  const username = `ausente-${randomUUID()}`;
  const password = randomBytes(24).toString('base64url');
  const existing = await request.post('/api/auth/login', {
    headers: origin,
    data: { username: testCredentials().username, password },
  });
  expect(existing.status()).toBe(401);
  expect((await existing.json()).message).toBe('Usuario o contraseña incorrectos.');
  for (let i = 0; i < 8; i++) {
    const response = await request.post('/api/auth/login', {
      headers: origin,
      data: { username, password },
    });
    expect(response.status()).toBe(401);
    expect((await response.json()).message).toBe('Usuario o contraseña incorrectos.');
  }
  expect(
    (
      await request.post('/api/auth/login', { headers: origin, data: { username, password } })
    ).status(),
  ).toBe(429);
});

test('la API interna exige token del servidor y sesión; el proxy no acepta un token del visitante', async ({
  request,
}) => {
  const internal = process.env.MM_INTERNAL_TOKEN;
  if (!internal) throw new Error('Falta la configuración interna de pruebas.');
  expect(
    (
      await request.get('http://127.0.0.1:3201/api/catalog', {
        headers: { 'x-mm-internal': internal },
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.get('/api/catalog', {
        headers: { 'x-mm-internal': internal },
      })
    ).status(),
  ).toBe(401);
  await loginRequest(request);
  expect((await request.get('http://127.0.0.1:3201/api/catalog')).status()).toBe(401);
  expect(
    (
      await request.get('http://127.0.0.1:3201/api/catalog', {
        headers: { 'x-mm-internal': internal },
      })
    ).status(),
  ).toBe(200);
});

test('login rechaza origen ausente, formulario no JSON y cuerpo excesivo', async ({ request }) => {
  expect((await request.post('/api/auth/login', { data: {} })).status()).toBe(403);
  expect(
    (
      await request.post('/api/auth/login', {
        headers: { ...origin, 'Content-Type': 'text/plain' },
        data: '{}',
      })
    ).status(),
  ).toBe(415);
  expect(
    (
      await request.post('/api/auth/login', {
        headers: origin,
        data: { padding: 'x'.repeat(65537) },
      })
    ).status(),
  ).toBe(413);
});

test('logout revoca la sesión en PostgreSQL y un token robado ya no se puede reutilizar', async ({
  request,
  playwright,
}) => {
  await loginRequest(request);
  const state = await request.storageState();
  const stolen = await playwright.request.newContext({
    baseURL: 'http://127.0.0.1:3200',
    storageState: state,
  });
  try {
    expect((await stolen.get('/api/auth/me')).status()).toBe(200);
    await request.post('/api/auth/logout', { headers: origin, data: {} });
    expect((await stolen.get('/api/auth/me')).status()).toBe(401);
  } finally {
    await stolen.dispose();
  }
});

test('la inactividad vence servidor y PostgreSQL solo conserva un hash del token', async ({
  request,
}) => {
  await loginRequest(request);
  const token = (await request.storageState()).cookies.find(
    (cookie) => cookie.name === 'mm_session',
  )!.value;
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    const hash = createHash('sha256').update(token).digest('hex');
    const rows = await client.query('SELECT token_hash FROM auth_sessions WHERE token_hash=$1', [
      hash,
    ]);
    expect(rows.rowCount).toBe(1);
    expect(rows.rows[0].token_hash).not.toBe(token);
    await client.query(
      "UPDATE auth_sessions SET last_seen_at=now()-interval '31 minutes' WHERE token_hash=$1",
      [hash],
    );
    expect((await request.get('/api/auth/me')).status()).toBe(401);
  } finally {
    await client.end();
  }
});

test('restablecer una contraseña revoca sesiones y rechaza la contraseña anterior', async ({
  request,
}) => {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 1 });
  const user = {
    username: `restablecer-${randomUUID()}`,
    displayName: 'Prueba de restablecimiento',
    password: randomBytes(24).toString('base64url'),
  };
  const replacement = randomBytes(24).toString('base64url');
  try {
    await provisionUser(pool, user);
    const first = await request.post('/api/auth/login', {
      headers: origin,
      data: { username: user.username, password: user.password },
    });
    expect(first.status()).toBe(201);
    expect((await request.get('/api/auth/me')).status()).toBe(200);
    await provisionUser(pool, { ...user, password: replacement }, { replaceExisting: true });
    expect((await request.get('/api/auth/me')).status()).toBe(401);
    expect(
      (
        await request.post('/api/auth/login', {
          headers: origin,
          data: { username: user.username, password: user.password },
        })
      ).status(),
    ).toBe(401);
    expect(
      (
        await request.post('/api/auth/login', {
          headers: origin,
          data: { username: user.username, password: replacement },
        })
      ).status(),
    ).toBe(201);
  } finally {
    await pool.end();
  }
});
