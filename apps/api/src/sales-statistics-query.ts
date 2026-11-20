import type { StatisticsFilter } from '../../../packages/domain/src/sales-statistics';

export const statisticsPageSize = 25;
const metrics = `trim_scale(round(coalesce(sum(boxes),0),12))::text as boxes,
  coalesce(sum(line_total_usd),0)::numeric(18,2)::text as "totalUsd",
  count(distinct sale_id)::integer as "saleCount",count(distinct client_id)::integer as "clientCount",
  count(*) filter(where boxes is null)::integer as "unknownLines"`;

/** One read snapshot. Allocation conversions are aggregated before joining money,
 * so a multi-lot sale never multiplies amounts. All ratios use the historical lot.
 * Pagination is over computed groups (not a truncated set of sale lines). */
export function statisticsQuery(filter: StatisticsFilter) {
  const groups = {
    products: {
      select: `variant_id::text||':'||description as key,variant_id as "variantId",description,
        null::uuid as "clientId",null::text as "clientName",null::uuid as "saleId",null::text as number,
        null::timestamptz as "soldAt",null::text as seller`,
      by: 'variant_id,description',
      order: 'boxes::numeric desc,key',
    },
    clients: {
      select: `client_id::text as key,null::uuid as "variantId",null::text as description,
        client_id as "clientId",client_name as "clientName",null::uuid as "saleId",null::text as number,
        null::timestamptz as "soldAt",null::text as seller`,
      by: 'client_id,client_name',
      order: 'boxes::numeric desc,key',
    },
    sales: {
      select: `sale_id::text||':'||variant_id::text||':'||description as key,
        variant_id as "variantId",description,client_id as "clientId",client_name as "clientName",
        sale_id as "saleId",number,sold_at as "soldAt",seller`,
      by: 'sale_id,number,sold_at,seller,client_id,client_name,variant_id,description',
      order: '"soldAt" desc,number desc,key',
    },
  }[filter.group];
  return {
    text: `with base as materialized (
      select s.id as sale_id,s.number,s.sold_at,s.seller,s.client_id,c.name as client_name,
        l.variant_id,l.description_snapshot as description,l.line_total_usd,
        case when l.presentation='box' then l.quantity::numeric
          when l.presentation='half_box' then l.quantity::numeric/2
          when a.allocated=l.quantity and a.valid then a.boxes else null end as boxes
      from sales s join effective_sale_lines l on l.sale_id=s.id join clients c on c.id=s.client_id
      left join lateral (
        select sum(x.quantity) as allocated,
          bool_and(lot.blisters_per_box_snapshot>0 and lot.blisters_per_box_snapshot is not null) as valid,
          sum(x.quantity::numeric/nullif(lot.blisters_per_box_snapshot,0)) as boxes
        from sale_allocations x join lots lot on lot.id=x.lot_id
        where l.presentation='blister' and x.sale_line_id=l.id
          and not exists(select 1 from sale_stock_returns ret where ret.allocation_id=x.id)
      )a on l.presentation='blister'
      where l.quantity>0 and s.status='confirmed'
        and s.sold_at >= ($1::date::timestamp at time zone 'America/Caracas')
        and s.sold_at < (($2::date+1)::timestamp at time zone 'America/Caracas')
        and not exists(select 1 from sale_cancellations cancel where cancel.sale_id=s.id)
        and ($4::uuid is null or l.variant_id=$4::uuid)
        and ($5::uuid is null or s.client_id=$5::uuid)
    ), selected as materialized (
      select * from base where $3='all' or seller=$3 or ($3='unassigned' and seller is null)
    ), totals as (select ${metrics} from selected),
    sellers as (select seller,${metrics} from base group by seller),
    grouped as (select ${groups.select},${metrics} from selected group by ${groups.by}),
    paged as (select * from grouped order by ${groups.order} limit $6 offset $7)
    select (select to_jsonb(t) from totals t) as totals,
      coalesce((select jsonb_agg(t order by seller nulls last) from sellers t),'[]'::jsonb) as sellers,
      coalesce((select jsonb_agg(t order by ${groups.order}) from paged t),'[]'::jsonb) as rows,
      (select count(*)::integer from grouped) as "rowCount"`,
    values: [
      filter.from,
      filter.to,
      filter.seller,
      filter.variantId ?? null,
      filter.clientId ?? null,
      statisticsPageSize,
      filter.page * statisticsPageSize,
    ],
  };
}
