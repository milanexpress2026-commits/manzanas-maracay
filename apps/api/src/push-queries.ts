const effectiveReminder = `case when d.id is null then s.reminder_date else d.reminder_date end`;
const latestDateJoin = `left join lateral(select id,reminder_date from sale_date_events where sale_id=s.id order by event_order desc limit 1)d on true`;

// Shared with integration tests so the actual dispatcher predicates are exercised
// against PostgreSQL without registering a device or contacting a push provider.
export const collectionPushCandidatesSql = `select s.id as sale_id,(${effectiveReminder})::text as reminder_date
  from sales s join receivables r on r.sale_id=s.id ${latestDateJoin}
  where s.condition='credit' and r.balance_usd>0 and ${effectiveReminder}<=$1::date
    and not exists(select 1 from push_notices n where n.sale_id=s.id and n.reminder_date=${effectiveReminder})
  order by ${effectiveReminder},s.id limit 100`;

export const eligibleCollectionPushNoticesSql = `select n.id from push_notices n
  join sales s on s.id=n.sale_id join receivables r on r.sale_id=s.id ${latestDateJoin}
  where n.batch_id=$1 and n.status='claimed' and s.condition='credit' and r.balance_usd>0
    and n.reminder_date=${effectiveReminder} and n.reminder_date<=$2::date`;
