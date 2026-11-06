import type { APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import type {
  ClientSummary,
  Configuration,
  ReceiptResult,
  SaleDetail,
  Presentation,
} from '../../../packages/domain/src/index';
import { commercePost } from './commerce';

/** A real catalogue configuration in disposable QA; deliberately creates no price list. */
export async function unpricedProduct(
  request: APIRequestContext,
  model: 'whole' | 'blister' | 'halves' = 'whole',
  countedHalves = false,
) {
  const fruit = await commercePost<{ id: string }>(request, '/api/catalog/fruits', {
    name: `QA V4.5 ${randomUUID()}`,
  });
  return commercePost<Configuration>(request, '/api/catalog/configurations', {
    fruitId: fruit.id,
    commercialLine: 'QA sin precio',
    packingModel: model,
    halfPreparation: model === 'halves' ? 'commercial' : countedHalves ? 'counted' : 'none',
    allowedPresentations:
      model === 'blister'
        ? countedHalves
          ? ['box', 'blister', 'half_box']
          : ['box', 'blister']
        : model === 'halves'
          ? ['box', 'half_box']
          : ['box'],
    blistersPerBox: model === 'blister' ? 4 : null,
    confirmationStatus: 'confirmed',
  });
}

export function unknownCostLine(rule: Configuration, boxes: number) {
  return { product: { configurationId: rule.id, expectedPackingVersion: rule.version }, boxes };
}

export async function receiveUnknown(
  request: APIRequestContext,
  rule: Configuration,
  boxes: number,
  receivedAt?: string,
) {
  return commercePost<ReceiptResult>(request, '/api/receipts', {
    schemaVersion: 3,
    ...(receivedAt ? { receivedAt } : {}),
    lines: [unknownCostLine(rule, boxes)],
  });
}

export function manualSaleInput(
  client: ClientSummary,
  rule: Configuration,
  quantity: number,
  price = '40',
  presentation: Presentation = 'box',
  settlementBasis: 'divisa' | 'bcv' = 'divisa',
) {
  return {
    schemaVersion: 2,
    clientId: client.id,
    condition: 'credit' as const,
    settlementBasis,
    soldAt: new Date().toISOString(),
    lines: [{ configurationId: rule.id, presentation, quantity, agreedUnitUsd: price }],
  };
}

export async function manualSale(
  request: APIRequestContext,
  client: ClientSummary,
  rule: Configuration,
  quantity: number,
  price = '40',
  presentation: Presentation = 'box',
  settlementBasis: 'divisa' | 'bcv' = 'divisa',
) {
  return commercePost<SaleDetail>(
    request,
    '/api/sales',
    manualSaleInput(client, rule, quantity, price, presentation, settlementBasis),
  );
}
