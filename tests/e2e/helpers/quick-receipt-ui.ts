import { expect, type Page } from '@playwright/test';

export async function chooseReceiptProduct(page: Page, label: string, index = 0, search = label) {
  await page
    .getByRole('button', { name: index === 0 ? 'Recibir mercancía' : 'Otra fruta', exact: true })
    .click();
  const picker = page.getByRole('dialog', { name: 'Elige la mercancía', exact: true });
  await picker.getByLabel('Buscar producto', { exact: true }).fill(search);
  await picker.getByRole('button', { name: `Elegir ${label}`, exact: true }).click();
  await expect(picker).toHaveCount(0);
  return page.getByRole('region', { name: `Producto ${index + 1}`, exact: true });
}

export async function setReceiptPrice(page: Page, index: number, promo: string, regular: string) {
  const line = page.getByRole('region', { name: `Producto ${index + 1}`, exact: true });
  await line.getByText('Notas y precios de este producto', { exact: true }).click();
  await line.getByRole('radio', { name: 'Actualizar precios', exact: true }).check();
  await line.getByLabel('Promocional divisa', { exact: true }).first().fill(promo);
  await line.getByLabel('Regular · Bs. BCV', { exact: true }).first().fill(regular);
}

export async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}
