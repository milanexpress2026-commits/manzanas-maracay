import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { presentationPricesSchema, type Presentation } from '../../../packages/domain/src/commerce';

export async function applyPresentationPrices(
  client: PoolClient,
  updates: {
    variantId: string;
    presentation: Presentation;
    promoUsd: string;
    regularUsd: string;
  }[],
  actor: string,
  key: string,
): Promise<void> {
  const normalized = updates.map((item) => presentationPricesSchema.parse(item));
  if (
    new Set(normalized.map((item) => `${item.variantId}:${item.presentation}`)).size !==
    normalized.length
  )
    throw new BadRequestException(
      'Indica una sola actualización de precios por producto y presentación.',
    );
  for (const input of normalized.sort((a, b) =>
    `${a.variantId}:${a.presentation}`.localeCompare(`${b.variantId}:${b.presentation}`),
  )) {
    const rule = (
      await client.query(
        'select allowed_presentations from packing_rules where variant_id=$1 for update',
        [input.variantId],
      )
    ).rows[0];
    if (!rule) throw new NotFoundException('La configuración del producto no existe.');
    if (!(rule.allowed_presentations as string[]).includes(input.presentation))
      throw new BadRequestException('Esa presentación no está habilitada para este producto.');
    for (const basis of ['usd_cash_promo', 'ves_regular'] as const) {
      await client.query(
        `insert into price_lists(id,name,payment_basis) values($1,$2,$3)
        on conflict(payment_basis) do nothing`,
        [
          randomUUID(),
          basis === 'usd_cash_promo'
            ? 'Promocional · USD efectivo'
            : 'Normal · referencia USD para VES',
          basis,
        ],
      );
      const list = (
        await client.query('select id from price_lists where payment_basis=$1', [basis])
      ).rows[0];
      const before =
        (
          await client.query(
            'select * from price_items where price_list_id=$1 and variant_id=$2 and presentation=$3 for update',
            [list.id, input.variantId, input.presentation],
          )
        ).rows[0] ?? null;
      const value = basis === 'usd_cash_promo' ? input.promoUsd : input.regularUsd;
      const after = (
        await client.query(
          `insert into price_items(price_list_id,variant_id,presentation,unit_usd) values($1,$2,$3,$4)
        on conflict(price_list_id,variant_id,presentation) do update set unit_usd=excluded.unit_usd returning *`,
          [list.id, input.variantId, input.presentation, value],
        )
      ).rows[0];
      await client.query(
        'insert into audit_events(entity_type,entity_id,action,before,after,actor,request_id) values($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)',
        [
          'price_item',
          after.id,
          'explicit_price_update',
          JSON.stringify(before),
          JSON.stringify(after),
          actor,
          key,
        ],
      );
    }
  }
}
