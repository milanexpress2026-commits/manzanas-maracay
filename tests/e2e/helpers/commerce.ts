import { expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {
  ClientSummary,
  SaleDetail,
  Presentation,
} from '../../../packages/domain/src/commerce';
import type { Configuration, ReceiptResult, Supplier } from '../../../packages/domain/src/index';
export const commerceHeaders = (key: string = randomUUID()) => ({
  Origin: 'http://127.0.0.1:3200',
  'Idempotency-Key': key,
});
export async function commercePost<T>(
  request: APIRequestContext,
  path: string,
  data: unknown,
  key?: string,
): Promise<T> {
  const response = await request.post(path, { headers: commerceHeaders(key), data });
  expect(response.status(), await response.text()).toBe(201);
  return response.json();
}
export async function commercialProduct(
  request: APIRequestContext,
  model: 'blister' | 'halves' | 'whole' = 'blister',
  price = '40',
  blisters = 5,
  boxWeightKg?: string,
): Promise<Configuration> {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `DEMO comercio ${randomUUID()}`,
  });
  const rule = await commercePost<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    commercialLine: model === 'blister' ? 'Bandejas' : model === 'halves' ? 'Granel' : 'Caja',
    packingModel: model,
    halfPreparation: model === 'blister' ? 'counted' : model === 'halves' ? 'commercial' : 'none',
    allowedPresentations:
      model === 'blister'
        ? ['box', 'half_box', 'blister']
        : model === 'halves'
          ? ['box', 'half_box']
          : ['box'],
    blistersPerBox: model === 'blister' ? blisters : null,
    confirmationStatus: 'confirmed',
    ...(boxWeightKg === undefined ? {} : { boxWeightKg }),
  });
  await commercePost(request, '/api/prices', {
    items: (model === 'blister'
      ? ['box', 'half_box', 'blister']
      : model === 'halves'
        ? ['box', 'half_box']
        : ['box']
    ).map((presentation) => ({
      variantId: rule.variantId,
      presentation,
      promoUsd: price,
      regularUsd: '50',
    })),
  });
  return rule;
}
export async function commercialCustomer(request: APIRequestContext): Promise<ClientSummary> {
  return commercePost(request, '/api/clients', {
    name: `DEMO cliente ${randomUUID()}`,
    phone: '+584120000001',
    notes: 'Prueba sintética aislada',
    isDemo: true,
  });
}
export async function commercialReceipt(
  request: APIRequestContext,
  rule: Configuration,
  boxes: number,
  cost: string,
  receivedAt = new Date(Date.now() - 1000).toISOString(),
): Promise<ReceiptResult> {
  const supplier = await commercePost<Supplier>(request, '/api/suppliers', {
    name: `DEMO comercio ${randomUUID()}`,
  });
  return commercePost(request, '/api/receipts', {
    supplierId: supplier.id,
    reference: `DEMO-${randomUUID()}`,
    receivedAt,
    isDemo: true,
    lines: [{ configurationId: rule.id, boxes, unitCostUsd: cost }],
  });
}
export function commercialSaleInput(
  customer: ClientSummary,
  rule: Configuration,
  quantity: number,
  price = '40',
  presentation: Presentation = 'box',
) {
  return {
    clientId: customer.id,
    condition: 'credit' as const,
    soldAt: new Date().toISOString(),
    lines: [
      {
        configurationId: rule.id,
        presentation,
        quantity,
        priceBasis: 'usd_cash_promo' as const,
        agreedUnitUsd: price,
      },
    ],
  };
}
export async function commercialSale(
  request: APIRequestContext,
  customer: ClientSummary,
  rule: Configuration,
  quantity: number,
  price = '40',
  presentation: Presentation = 'box',
): Promise<SaleDetail> {
  return commercePost(
    request,
    '/api/sales',
    commercialSaleInput(customer, rule, quantity, price, presentation),
  );
}
