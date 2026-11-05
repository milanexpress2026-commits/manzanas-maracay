import type { Pool, PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

/** Confirmed names/capabilities only. Never seed stock, costs, prices, customers or rates. */
export async function addCommercialCatalog(pool: Pool) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock(68493002)');
    if (
      (
        await c.query(
          "select 1 from audit_events where entity_type='catalog_bootstrap' and action='phase3_confirmed_names' limit 1",
        )
      ).rowCount
    ) {
      await c.query('commit');
      return;
    }
    const named = async (
      table: 'fruits' | 'varieties' | 'calibers',
      name: string,
      fruitId?: string,
    ): Promise<string> => {
      const column = table === 'calibers' ? 'label' : 'name';
      const existing = (
        await c.query(
          `select id from ${table} where lower(btrim(${column}))=lower(btrim($1))${fruitId ? ' and fruit_id=$2' : ''}`,
          fruitId ? [name, fruitId] : [name],
        )
      ).rows[0];
      if (existing) return existing.id;
      return (
        await c.query(
          `insert into ${table}(${column}${fruitId ? ',fruit_id' : ''}) values($1${fruitId ? ',$2' : ''}) returning id`,
          fruitId ? [name, fruitId] : [name],
        )
      ).rows[0].id;
    };
    const apple = await named('fruits', 'Manzana'),
      pear = await named('fruits', 'Pera'),
      kiwi = await named('fruits', 'Kiwi'),
      grape = await named('fruits', 'Uva');
    const configuration = async (
      fruitId: string,
      varietyId: string | null,
      caliberId: string | null,
      line: string,
      model: string,
      half: string,
      presentations: string[],
      weight: string | null = null,
    ) => {
      const prior = (
        await c.query(
          `select id from product_variants where fruit_id=$1 and variety_id is not distinct from $2::uuid
        and caliber_id is not distinct from $3::uuid and commercial_line=$4`,
          [fruitId, varietyId, caliberId, line],
        )
      ).rows[0];
      if (prior) return;
      const id = (
        await c.query(
          'insert into product_variants(fruit_id,variety_id,caliber_id,commercial_line) values($1,$2,$3,$4) returning id',
          [fruitId, varietyId, caliberId, line],
        )
      ).rows[0].id;
      await c.query(
        `insert into packing_rules(variant_id,blisters_per_box,packing_model,half_preparation,allowed_presentations,box_weight_kg,confirmation_status,notes)
        values($1,null,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          model,
          half,
          presentations,
          weight,
          model === 'blister' ? 'pending' : 'confirmed',
          model === 'blister'
            ? 'Pendiente: confirmar blíster por caja y calibres aplicables. No es una regla de producción.'
            : 'Presentaciones comunicadas por el propietario; sin precio ni existencia precargados.',
        ],
      );
    };
    for (const name of ['Verde', 'Lady', 'Gala']) {
      const variety = await named('varieties', name, apple);
      await configuration(apple, variety, null, 'En blíster', 'blister', 'counted', [
        'box',
        'half_box',
        'blister',
      ]);
    }
    for (const label of [
      '88',
      '100',
      '113',
      '125',
      '135',
      '150',
      '163',
      '175',
      '198',
      '216',
      '232',
    ]) {
      const caliber = await named('calibers', label, apple);
      if (['150', '163', '175', '198', '216', '232'].includes(label))
        await configuration(apple, null, caliber, 'Granel', 'halves', 'commercial', [
          'box',
          'half_box',
        ]);
    }
    for (const name of ['FORELLE', 'PACKCAM']) {
      const variety = await named('varieties', name, pear);
      await configuration(pear, variety, null, 'En blíster', 'blister', 'pending', [
        'box',
        'half_box',
        'blister',
      ]);
    }
    for (const label of ['90', '100', '110', '120', '135']) await named('calibers', label, pear);
    await configuration(
      kiwi,
      null,
      null,
      'Caja 10 kg',
      'halves',
      'commercial',
      ['box', 'half_box'],
      '10.000',
    );
    for (const name of ['ROJA', 'MORADA'])
      await configuration(
        grape,
        await named('varieties', name, grape),
        null,
        'Caja',
        'whole',
        'none',
        ['box'],
      );
    await c.query(
      `insert into audit_events(entity_type,entity_id,action,actor,request_id,after)
      values('catalog_bootstrap',$1,'phase3_confirmed_names','authorized-phase3',$2,$3::jsonb)`,
      [
        randomUUID(),
        randomUUID(),
        JSON.stringify({ source: 'brief-fase-3', stockCreated: false, pricesCreated: false }),
      ],
    );
    await c.query('commit');
    console.log(
      'Catálogo comercial añadido sin existencias, precios ni reglas de blíster inventadas.',
    );
  } catch (error) {
    await c.query('rollback');
    throw error;
  } finally {
    c.release();
  }
}
