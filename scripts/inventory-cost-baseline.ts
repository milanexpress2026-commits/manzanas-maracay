import type { Pool } from 'pg';
import { replayLegacyCosts, type CostReplayMovement } from '../packages/domain/src/costing';

/** One-time, append-only valuation baseline for already existing phase-2 physical history. */
export async function establishCostBaseline(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('select pg_advisory_xact_lock(68493003)');
    const lots = (
      await client.query(`select distinct l.id,l.unit_cost_usd from lots l join containers c on c.lot_id=l.id
      where not exists(select 1 from inventory_cost_openings o where o.container_id=c.id)
      and not exists(select 1 from inventory_cost_entries e where e.container_id=c.id)`)
    ).rows;
    let updated = 0,
      unknown = 0;
    for (const lot of lots) {
      const movements = (
        await client.query(
          'select * from inventory_movements where lot_id=$1 order by lot_version_after',
          [lot.id],
        )
      ).rows as CostReplayMovement[];
      const { current } = replayLegacyCosts(movements, lot.unit_cost_usd);
      const containers = (
        await client.query(
          `select c.id,s.quantity from containers c join stock_balances s on s.container_id=c.id
        where c.lot_id=$1 and not exists(select 1 from inventory_cost_openings o where o.container_id=c.id)
        and not exists(select 1 from inventory_cost_entries e where e.container_id=c.id)`,
          [lot.id],
        )
      ).rows;
      for (const c of containers) {
        const cost = c.quantity === 0 ? '0.0000' : (current.get(c.id) ?? null);
        await client.query(
          'insert into inventory_cost_openings(container_id,cost_usd,method) values($1,$2,$3)',
          [c.id, cost, 'phase2-physical-history-replay-v1'],
        );
        await client.query('update stock_balances set cost_usd=$2 where container_id=$1', [
          c.id,
          cost,
        ]);
        updated++;
        if (cost === null) unknown++;
      }
    }
    await client.query('commit');
    console.log(
      `Costo inicial trazable: ${updated} contenedores; ${unknown} pendientes de revisión (venta bloqueada).`,
    );
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
