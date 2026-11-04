import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import dotenv from 'dotenv';
dotenv.config({ quiet: true });
const headers = (key = randomUUID()) => ({
  Origin: 'http://127.0.0.1:3200',
  'Idempotency-Key': key,
});
test('API idempotente ante solicitudes simultáneas, con auditoría única', async ({ request }) => {
  const key = randomUUID(),
    name = `Fruta idempotente ${Date.now()}`;
  const responses = await Promise.all(
    [1, 2].map(() =>
      request.post('/api/catalog/fruits', { headers: headers(key), data: { name } }),
    ),
  );
  expect(responses.map((r) => r.status())).toEqual([201, 201]);
  const a = await responses[0].json(),
    b = await responses[1].json();
  expect(a.id).toBe(b.id);
  expect(
    (
      await request.post('/api/catalog/fruits', {
        headers: headers(key),
        data: { name: 'Otro contenido' },
      })
    ).status(),
  ).toBe(409);
  await withDatabase(async (c) => {
    expect(
      (await c.query('select count(*) from audit_events where request_id=$1', [key])).rows[0].count,
    ).toBe('1');
  });
});
test('rechaza duplicados, cantidades inválidas y combinaciones de frutas distintas', async ({
  request,
}) => {
  expect(
    (
      await request.post('/api/catalog/fruits', { headers: headers(), data: { name: ' manzana ' } })
    ).status(),
  ).toBe(409);
  const catalog = await (await request.get('/api/catalog')).json();
  const gala = catalog.configurations[0];
  const pear = catalog.fruits.find((f: { name: string }) => f.name === 'Pera');
  expect(
    (
      await request.post('/api/catalog/configurations', {
        headers: headers(),
        data: {
          fruitId: gala.fruitId,
          varietyId: gala.varietyId,
          caliberId: gala.caliberId,
          blistersPerBox: 0,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.post('/api/catalog/configurations', {
        headers: headers(),
        data: {
          fruitId: pear.id,
          varietyId: gala.varietyId,
          caliberId: gala.caliberId,
          blistersPerBox: 5,
        },
      })
    ).status(),
  ).toBe(400);
});
test('detecta edición concurrente sin pisar cambios', async ({ request }) => {
  const catalog = await (await request.get('/api/catalog')).json();
  const rule = catalog.configurations[0];
  const data = { blistersPerBox: rule.blistersPerBox, notes: rule.notes, version: rule.version };
  const results = await Promise.all(
    [1, 2].map(() =>
      request.patch(`/api/catalog/configurations/${rule.id}`, { headers: headers(), data }),
    ),
  );
  expect(results.map((r) => r.status()).sort()).toEqual([200, 409]);
});
test('protege mutaciones contra origen ajeno y la API interna', async ({ request }) => {
  expect(
    (await request.post('/api/catalog/fruits', { data: { name: 'Origen ausente' } })).status(),
  ).toBe(403);
  expect(
    (
      await request.post('/api/catalog/fruits', {
        headers: { ...headers(), Origin: 'https://example.org' },
        data: { name: 'Origen ajeno' },
      })
    ).status(),
  ).toBe(403);
  expect((await request.get('http://127.0.0.1:3201/api/catalog')).status()).toBe(401);
});
async function withDatabase(fn: (client: Client) => Promise<void>) {
  const url = process.env.MIGRATION_DATABASE_URL!.replace(
    '/manzanas_maracay_dev',
    '/manzanas_maracay_test',
  );
  if (new URL(url).pathname !== '/manzanas_maracay_test') throw new Error('Solo base de pruebas.');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}
test('PostgreSQL: auditoría inmutable y rol de aplicación sin acceso a ventas', async () => {
  await withDatabase(async (c) => {
    const event = await c.query('select id from audit_events limit 1');
    await expect(
      c.query('delete from audit_events where id=$1', [event.rows[0].id]),
    ).rejects.toMatchObject({ code: '23514' });
  });
  await withDatabase(async (c) => {
    expect(
      (await c.query("select has_table_privilege('mm_app','sales','INSERT') as allowed")).rows[0]
        .allowed,
    ).toBe(false);
    expect(
      (await c.query("select rolsuper from pg_roles where rolname='mm_app'")).rows[0].rolsuper,
    ).toBe(false);
  });
});
test('PostgreSQL: rechaza fraccionamiento sin conservación física', async () => {
  await withDatabase(async (c) => {
    await expect(
      c.query(
        "insert into inventory_movements(idempotency_key,request_hash,kind,reason,actor,counted_before,delivered_pieces,remaining_pieces) values($1,'test','fraction','Test físico','test',37,18,20)",
        [randomUUID()],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
test('PostgreSQL: no permite doble conteo de caja y blíster', async () => {
  await withDatabase(async (c) => {
    const rule = (
      await c.query('select id,variant_id,version,blisters_per_box from packing_rules limit 1')
    ).rows[0];
    const supplier = (
      await c.query("insert into suppliers(name) values('Proveedor de prueba') returning id")
    ).rows[0].id;
    const warehouse = (
      await c.query('insert into warehouses(name) values($1) returning id', [
        `Prueba ${randomUUID()}`,
      ])
    ).rows[0].id;
    const lot = (
      await c.query(
        'insert into lots(code,variant_id,supplier_id,packing_rule_id,packing_rule_version,blisters_per_box_snapshot,received_at,unit_cost_usd) values($1,$2,$3,$4,$5,$6,now(),0) returning id',
        [randomUUID(), rule.variant_id, supplier, rule.id, rule.version, rule.blisters_per_box],
      )
    ).rows[0].id;
    const box = (
      await c.query(
        "insert into containers(lot_id,warehouse_id,kind) values($1,$2,'box') returning id",
        [lot, warehouse],
      )
    ).rows[0].id;
    const blister = (
      await c.query(
        "insert into containers(lot_id,warehouse_id,parent_id,kind) values($1,$2,$3,'blister') returning id",
        [lot, warehouse, box],
      )
    ).rows[0].id;
    await c.query(
      "insert into stock_balances(container_id,unit,quantity) values($1,'sealed_box',1),($2,'intact_blister',5)",
      [box, blister],
    );
    await expect(c.query('SET CONSTRAINTS ALL IMMEDIATE')).rejects.toMatchObject({ code: '23514' });
  });
});
