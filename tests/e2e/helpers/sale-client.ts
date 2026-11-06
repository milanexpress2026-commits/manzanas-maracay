import { expect, type Page } from '@playwright/test';

/** Exercise the server search, including clients outside the first page. */
export async function chooseSaleClient(page: Page, client: { id?: string; name: string }) {
  const search = page.getByLabel('Buscar cliente', { exact: true });
  if ((await search.inputValue()) !== client.name) {
    const response = page.waitForResponse((result) => {
      const url = new URL(result.url());
      return (
        result.request().method() === 'GET' &&
        url.pathname === '/api/clients' &&
        url.searchParams.get('search') === client.name
      );
    });
    await search.fill(client.name);
    expect((await response).status()).toBe(200);
  }
  await page
    .getByLabel('Cliente', { exact: true })
    .selectOption(client.id ?? { label: client.name });
}
