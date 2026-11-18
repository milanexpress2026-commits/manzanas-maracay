import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { SaleDetail, PaymentDetail } from '../../packages/domain/src';
import { loginPage } from './helpers/auth';
import {
  commercePost,
  commercialProduct,
  commercialCustomer,
  commercialReceipt,
  commercialSale,
} from './helpers/commerce';
import { noHorizontalOverflow } from './helpers/quick-receipt-ui';

for (const width of [390, 800, 1440])
  test(`corrección de pedido y abono legible a ${width}px`, async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width, height: 1000 });
    const rule = await commercialProduct(page.request),
      customer = await commercialCustomer(page.request);
    await commercialReceipt(page.request, rule, 3, '10');
    const sale = await commercialSale(page.request, customer, rule, 2, '20', 'half_box');
    const payment = await commercePost<PaymentDetail>(page.request, '/api/payments', {
      clientId: customer.id,
      currency: 'USD',
      amount: '40',
      method: 'usd_cash',
      receivedAt: new Date().toISOString(),
      applications: [{ saleId: sale.id, amountUsd: '40' }],
    });
    await page.goto('/ventas/' + sale.id);
    await page.getByRole('button', { name: 'Quitar productos', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('spinbutton').fill('1');
    await dialog.getByLabel('Dejar a favor del cliente', { exact: true }).check();
    await dialog.getByLabel('La mercancía quedó en el local o fue devuelta.').check();
    await expect(dialog).toContainText('Diferencia a resolver: USD 20,00');
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    fs.mkdirSync('../../work/v418-ui', { recursive: true });
    await page.screenshot({
      path: `../../work/v418-ui/return-${width}.png`,
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Guardar cambio', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Corrección guardada.', { exact: false })).toBeVisible();
    expect(
      (await (await page.request.get('/api/clients/' + customer.id)).json()).client.creditUsd,
    ).toBe('20.00');
    await page.getByRole('button', { name: 'Corregir abono', exact: true }).click();
    if (width === 390) {
      await dialog.getByLabel('Importe correcto · USD').fill('abc');
      await dialog.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
      await expect(dialog.getByRole('alert')).toContainText('Escribe un monto válido');
      await expect(dialog).not.toContainText('invalid_format');
    }
    await dialog.getByLabel('Importe correcto · USD').fill('15');
    await noHorizontalOverflow(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({
      path: `../../work/v418-ui/payment-correction-${width}.png`,
      animations: 'disabled',
    });
    await dialog.getByRole('button', { name: 'Guardar corrección', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect((await (await page.request.get('/api/sales/' + sale.id)).json()).balanceUsd).toBe(
      '5.00',
    );
    const receipt = await page.request.get('/api/payments/' + payment.id + '/document');
    expect(receipt.status()).toBe(200);
    if (width === 800)
      fs.writeFileSync('../../work/v418-ui/corrected-payment.pdf', await receipt.body());
    await page.getByRole('button', { name: 'Registrar abono', exact: true }).click();
    await dialog.getByLabel('Método de pago', { exact: true }).selectOption('client_credit');
    await expect(dialog).toContainText('Disponible a favor: USD 20.00');
  });

test('recupera devolución después de perder la respuesta y recargar la app', async ({ page }) => {
  await loginPage(page);
  const rule = await commercialProduct(page.request),
    customer = await commercialCustomer(page.request);
  await commercialReceipt(page.request, rule, 3, '10');
  const sale = await commercialSale(page.request, customer, rule, 2, '20', 'half_box');
  await commercePost(page.request, '/api/payments', {
    clientId: customer.id,
    currency: 'USD',
    amount: '40',
    method: 'usd_cash',
    receivedAt: new Date().toISOString(),
    applications: [{ saleId: sale.id, amountUsd: '40' }],
  });
  await page.goto('/ventas/' + sale.id);
  await page.getByRole('button', { name: 'Quitar productos', exact: true }).click();
  await page.getByRole('spinbutton').fill('1');
  await page.getByLabel('Devolver la diferencia', { exact: true }).check();
  await page.getByLabel('La mercancía quedó en el local o fue devuelta.').check();
  await page.route(
    '**/api/sales/' + sale.id + '/reduce',
    async (route) => {
      await route.fetch();
      await route.abort('failed');
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Guardar cambio', exact: true }).click();
  await expect(
    page.getByText('No llegó una confirmación verificable.', { exact: false }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar corrección', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Recuperar corrección', exact: true })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const changed: SaleDetail = await (await page.request.get('/api/sales/' + sale.id)).json();
  expect(changed.reductions).toHaveLength(1);
  expect(changed.totalUsd).toBe('20.00');
});
