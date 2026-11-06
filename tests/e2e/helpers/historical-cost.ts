import { expect } from '@playwright/test';
import { receiptDatabase } from './receipt-v42';

/** Costs are hidden operationally in V4.5. These read-only QA assertions preserve historical accounting coverage. */
export async function historicalSaleCost(saleId: string, cost: string) {
  await receiptDatabase(async (db) => {
    expect(
      (await db.query('select cost_usd from sales where id=$1', [saleId])).rows[0]?.cost_usd,
    ).toBe(cost);
  });
}
export async function historicalLotCost(lotId: string, cost: string) {
  await receiptDatabase(async (db) => {
    expect(
      (await db.query('select unit_cost_usd from lots where id=$1', [lotId])).rows[0]
        ?.unit_cost_usd,
    ).toBe(cost);
  });
}
export async function historicalContainerCosts(lotId: string) {
  return receiptDatabase(async (db) =>
    (
      await db.query(
        'select s.cost_usd from stock_balances s join containers c on c.id=s.container_id where c.lot_id=$1 order by s.cost_usd::text',
        [lotId],
      )
    ).rows.map((row) => row.cost_usd as string | null),
  );
}
