import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { loginPage } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await loginPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test('UX v3: el catálogo ofrece Agregar producto como entrada cotidiana', async ({ page }) => {
  await page.goto('/catalogo');
  await page.waitForLoadState('networkidle');
  fs.mkdirSync('.local/ux-v3/entry', { recursive: true });
  await page.screenshot({ path: '.local/ux-v3/entry/catalogo.png', fullPage: true });
  await expect(page.getByRole('button', { name: 'Agregar producto', exact: true })).toBeVisible();
});

test('UX v3: contado no presenta recordatorio ni método de texto libre', async ({ page }) => {
  await page.goto('/ventas/nueva');
  await page.waitForLoadState('networkidle');
  fs.mkdirSync('.local/ux-v3/entry', { recursive: true });
  await page.screenshot({ path: '.local/ux-v3/entry/contado.png', fullPage: true });
  await expect(page.getByLabel('Recordatorio interno, opcional', { exact: true })).toHaveCount(0);
  await expect(page.locator('input#sale-method')).toHaveCount(0);
});
