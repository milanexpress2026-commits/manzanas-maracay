import { expect, type Page, type TestInfo } from '@playwright/test';
import fs from 'node:fs';

export function assertIsolatedProduction(testInfo: TestInfo) {
  expect(testInfo.project.use.baseURL).toBe('https://localhost:3143');
}

export async function loginProduction(page: Page, options: { rememberSession?: boolean } = {}) {
  const credentials = JSON.parse(fs.readFileSync('.local/production-qa/auth.json', 'utf8')) as {
    username: string;
    password: string;
  };
  if (credentials.username !== 'qa-propietarios' || !credentials.password)
    throw new Error('Falta el acceso efímero del ensayo aislado.');
  await page.goto('/login');
  await page.getByLabel('Usuario', { exact: true }).fill(credentials.username);
  await page.getByLabel('Contraseña', { exact: true }).fill(credentials.password);
  const remember = page.getByRole('checkbox', { name: 'Mantener sesión activa', exact: true });
  await expect(remember).not.toBeChecked();
  if (options.rememberSession) await remember.check();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByRole('heading', { name: 'Tu negocio, al día' })).toBeVisible();
}

export async function assertNoDocumentOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
