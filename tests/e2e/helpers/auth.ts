import fs from 'node:fs';
import path from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';

export function testCredentials() {
  const file = process.env.MM_TEST_CREDENTIALS_FILE ?? path.resolve('.local/auth-test.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '')) as {
    username: string;
    password: string;
    displayName: string;
  };
  if (!parsed.username || !parsed.password)
    throw new Error('Falta el acceso privado de la base de pruebas.');
  return parsed;
}
export async function loginRequest(request: APIRequestContext) {
  const { username, password } = testCredentials();
  const response = await request.post('/api/auth/login', {
    headers: { Origin: 'http://127.0.0.1:3200' },
    data: { username, password },
  });
  if (!response.ok())
    throw new Error(`No se pudo autenticar el cliente de pruebas (HTTP ${response.status()}).`);
}
export async function loginPage(page: Page) {
  await loginRequest(page.request);
}
