import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import webPush from 'web-push';
import { z } from 'zod';
import {
  pushSubscribeSchema,
  pushUnsubscribeSchema,
  caracasBusinessDate,
} from '../../../packages/domain/src/push';
import { readVapidConfig, validBrowserPushKey } from './push-config';
import { dispatchCollectionPush, type PushBatch, type PushOutcome } from './push-dispatch';
import { assertBusinessWritesReady, operationsReady } from './production-state';

type DeviceRow = {
  id: string;
  generation: string;
  device_label: string;
  endpoint: string | null;
  p256dh: string | null;
  auth: string | null;
  active: boolean;
};
const lockName = 'mm-push-device-slot';
const effectiveReminder = `case when d.id is null then s.reminder_date else d.reminder_date end`;
const latestDateJoin = `left join lateral(select id,reminder_date from sale_date_events where sale_id=s.id order by event_order desc limit 1)d on true`;

@Injectable()
export class PushService implements OnModuleInit, OnModuleDestroy {
  readonly pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 10000,
    statement_timeout: 5000,
  });
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private readonly vapid = readVapidConfig();

  constructor() {
    this.pool.on('error', () =>
      console.warn('El servicio de avisos de cobranza no está disponible.'),
    );
  }
  onModuleInit() {
    if (!this.vapid) return;
    this.timer = setInterval(() => {
      void this.dispatch().catch(() =>
        console.warn('No se pudo comprobar la cola de avisos de cobranza.'),
      );
    }, 60_000);
    this.timer.unref();
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.pool.end();
  }

  async status() {
    const device = (
      await this.pool.query<DeviceRow>(
        'select id,generation,device_label,endpoint,p256dh,auth,active from push_devices where slot=1',
      )
    ).rows[0];
    return {
      configured: !!this.vapid,
      subscribed: !!device?.active,
      publicKey: this.vapid?.publicKey ?? null,
      deviceLabel: device?.active ? device.device_label : null,
      endpointHash:
        device?.active && device.endpoint
          ? createHash('sha256').update(device.endpoint).digest('hex')
          : null,
    };
  }

  private async command<T>(
    kind: string,
    data: unknown,
    key: string | undefined,
    actor: string,
    fn: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!z.uuid().safeParse(key).success || !z.uuid().safeParse(actor).success)
      throw new BadRequestException('Falta la identidad o la clave para guardar sin duplicados.');
    const hash = createHash('sha256').update(JSON.stringify({ kind, data, actor })).digest('hex');
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [key]);
      const previous = (
        await client.query('select request_hash,response from command_receipts where key=$1', [key])
      ).rows[0];
      if (previous) {
        if (previous.request_hash !== hash)
          throw new ConflictException('Esta solicitud ya se utilizó con otros datos.');
        await client.query('commit');
        return previous.response as T;
      }
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockName]);
      const result = await fn(client);
      await client.query(
        'insert into command_receipts(key,request_hash,response) values($1,$2,$3::jsonb)',
        [key, hash, JSON.stringify(result)],
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async subscribe(body: unknown, key: string | undefined, actor: string) {
    assertBusinessWritesReady();
    if (!this.vapid)
      throw new ServiceUnavailableException(
        'Los avisos push aún no están configurados. El centro de cobranza sigue disponible.',
      );
    const data = pushSubscribeSchema.parse(body);
    if (
      !validBrowserPushKey(data.subscription.keys.p256dh) ||
      (data.subscription.expirationTime && data.subscription.expirationTime <= Date.now())
    )
      throw new BadRequestException('La suscripción del navegador no es válida o ya venció.');
    return this.command('push.subscribe', data, key, actor, async (client) => {
      const previous = (
        await client.query<DeviceRow>('select * from push_devices where slot=1 for update')
      ).rows[0];
      if (
        previous?.active &&
        previous.endpoint !== data.subscription.endpoint &&
        !data.replaceExisting
      )
        throw new ConflictException(
          'Ya hay una tablet de cobranza. Confirma si deseas reemplazarla por este dispositivo.',
        );
      const next = (
        await client.query<DeviceRow>(
          `insert into push_devices(slot,device_label,endpoint,p256dh,auth,updated_by)
         values(1,$1,$2,$3,$4,$5) on conflict(slot) do update set generation=gen_random_uuid(),
         device_label=excluded.device_label,endpoint=excluded.endpoint,p256dh=excluded.p256dh,auth=excluded.auth,
         active=true,updated_by=excluded.updated_by,updated_at=now() returning *`,
          [
            data.deviceLabel,
            data.subscription.endpoint,
            data.subscription.keys.p256dh,
            data.subscription.keys.auth,
            actor,
          ],
        )
      ).rows[0]!;
      await client.query(
        `update push_notices set status='cancelled',result_code='device_changed',finished_at=now() where status='claimed' and device_generation<>$1`,
        [next.generation],
      );
      await client.query(
        `insert into audit_events(entity_type,entity_id,action,"before","after",actor,request_id) values('push_device',$1,$2,$3::jsonb,$4::jsonb,$5,$6)`,
        [
          next.id,
          previous?.active && previous.endpoint !== next.endpoint ? 'replace' : 'subscribe',
          JSON.stringify(
            previous ? { active: previous.active, deviceLabel: previous.device_label } : null,
          ),
          JSON.stringify({ active: true, deviceLabel: next.device_label }),
          actor,
          key,
        ],
      );
      return { subscribed: true, deviceLabel: next.device_label };
    });
  }

  async unsubscribe(body: unknown, key: string | undefined, actor: string) {
    const data = pushUnsubscribeSchema.parse(body);
    return this.command('push.unsubscribe', data, key, actor, async (client) => {
      const previous = (
        await client.query<DeviceRow>('select * from push_devices where slot=1 for update')
      ).rows[0];
      if (!previous?.active) return { subscribed: false };
      if (previous.endpoint !== data.endpoint)
        throw new ConflictException('La tablet activa es otra. No se desactivaron sus avisos.');
      await client.query(
        'update push_devices set active=false,endpoint=null,p256dh=null,auth=null,updated_by=$1,updated_at=now() where id=$2',
        [actor, previous.id],
      );
      await client.query(
        "update push_notices set status='cancelled',result_code='unsubscribed',finished_at=now() where status='claimed'",
        [],
      );
      await client.query(
        `insert into audit_events(entity_type,entity_id,action,"before","after",actor,request_id) values('push_device',$1,'unsubscribe',$2::jsonb,'{"active":false}'::jsonb,$3,$4)`,
        [
          previous.id,
          JSON.stringify({ active: true, deviceLabel: previous.device_label }),
          actor,
          key,
        ],
      );
      return { subscribed: false };
    });
  }

  private async claim(at: Date): Promise<PushBatch | null> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'");
      const lock = (
        await client.query('select pg_try_advisory_xact_lock(hashtextextended($1,0)) as acquired', [
          lockName,
        ])
      ).rows[0]?.acquired;
      if (!lock) {
        await client.query('rollback');
        return null;
      }
      const device = (
        await client.query<DeviceRow>(
          'select * from push_devices where slot=1 and active for update',
        )
      ).rows[0];
      if (!device?.endpoint || !device.p256dh || !device.auth) {
        await client.query('commit');
        return null;
      }
      // A crash after a claim may have followed a successful send. Do not retry ambiguously.
      await client.query(
        "update push_notices set status='uncertain',result_code='interrupted',finished_at=now() where status='claimed' and created_at<now()-interval '5 minutes'",
      );
      const candidates = (
        await client.query<{ sale_id: string; reminder_date: string }>(
          `select s.id as sale_id,(${effectiveReminder})::text as reminder_date
         from sales s join receivables r on r.sale_id=s.id ${latestDateJoin}
         where r.balance_usd>0 and ${effectiveReminder}<=$1::date
           and not exists(select 1 from push_notices n where n.sale_id=s.id and n.reminder_date=${effectiveReminder})
         order by ${effectiveReminder},s.id limit 100`,
          [caracasBusinessDate(at)],
        )
      ).rows;
      if (!candidates.length) {
        await client.query('commit');
        return null;
      }
      const batchId = randomUUID();
      for (const row of candidates)
        await client.query(
          'insert into push_notices(sale_id,reminder_date,device_generation,batch_id) values($1,$2,$3,$4) on conflict(sale_id,reminder_date) do nothing',
          [row.sale_id, row.reminder_date, device.generation, batchId],
        );
      await client.query('commit');
      return {
        id: batchId,
        generation: device.generation,
        subscription: {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
      };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async revalidate(batch: PushBatch, at: Date) {
    if (!operationsReady()) return false;
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockName]);
      const device = (
        await client.query(
          'select 1 from push_devices where slot=1 and active and generation=$1 and endpoint=$2',
          [batch.generation, batch.subscription.endpoint],
        )
      ).rowCount;
      const eligible = device
        ? (
            await client.query<{ id: string }>(
              `select n.id from push_notices n join sales s on s.id=n.sale_id join receivables r on r.sale_id=s.id ${latestDateJoin}
         where n.batch_id=$1 and n.status='claimed' and r.balance_usd>0
           and n.reminder_date=${effectiveReminder} and n.reminder_date<=$2::date`,
              [batch.id, caracasBusinessDate(at)],
            )
          ).rows.map((row) => row.id)
        : [];
      await client.query(
        "update push_notices set status='cancelled',result_code='no_longer_pending',finished_at=now() where batch_id=$1 and status='claimed' and not(id=any($2::uuid[]))",
        [batch.id, eligible],
      );
      await client.query('commit');
      return eligible.length > 0;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  private async finish(batch: PushBatch, outcome: PushOutcome, code: string) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query("set local lock_timeout='3s'");
      await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [lockName]);
      await client.query(
        "update push_notices set status=$2,result_code=$3,finished_at=now() where batch_id=$1 and status='claimed'",
        [batch.id, outcome, code],
      );
      if (code === '404' || code === '410')
        await client.query(
          'update push_devices set active=false,endpoint=null,p256dh=null,auth=null,updated_at=now() where slot=1 and generation=$1',
          [batch.generation],
        );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async dispatch() {
    if (!this.vapid || this.busy || !operationsReady()) return 'idle';
    this.busy = true;
    try {
      const config = this.vapid;
      return await dispatchCollectionPush(
        {
          claim: (at) => this.claim(at),
          revalidate: (batch, at) => this.revalidate(batch, at),
          finish: (batch, outcome, code) => this.finish(batch, outcome, code),
        },
        (subscription, payload) => {
          assertBusinessWritesReady();
          return webPush.sendNotification(subscription, payload, {
            vapidDetails: config,
            TTL: 300,
            urgency: 'normal',
            topic: 'mm-cobranza',
            timeout: 8000,
          });
        },
      );
    } finally {
      this.busy = false;
    }
  }
}
