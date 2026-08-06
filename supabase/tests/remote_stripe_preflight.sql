\set ON_ERROR_STOP on

begin transaction read only;

select 'stripe_payment_id' as identifier,
       count(*) as duplicate_groups,
       coalesce(sum(row_count - 1), 0) as extra_rows
from (
  select count(*) as row_count
  from public.payments
  where stripe_payment_id is not null
  group by stripe_payment_id
  having count(*) > 1
) duplicates
union all
select 'stripe_session_id', count(*), coalesce(sum(row_count - 1), 0)
from (
  select count(*) as row_count
  from public.payments
  where stripe_session_id is not null
  group by stripe_session_id
  having count(*) > 1
) duplicates
union all
select 'stripe_account_id', count(*), coalesce(sum(row_count - 1), 0)
from (
  select count(*) as row_count
  from public.users
  where stripe_account_id is not null
  group by stripe_account_id
  having count(*) > 1
) duplicates;

select count(*) as payment_rows,
       min(amount) as amount_min,
       max(amount) as amount_max,
       count(*) filter (where amount <> trunc(amount)) as amount_fractional,
       min(amount_net) as amount_net_min,
       max(amount_net) as amount_net_max,
       count(*) filter (
         where amount_net is not null
           and amount_net * 100 <> trunc(amount_net * 100)
       ) as amount_net_subcent_rows,
       min(application_fee) as fee_min,
       max(application_fee) as fee_max,
       count(*) filter (
         where application_fee is not null
           and application_fee * 100 <> trunc(application_fee * 100)
       ) as fee_subcent_rows
from public.payments;

select count(*) filter (
         where amount < 0
            or amount_net < 0
            or application_fee < 0
            or refund_amount < 0
       ) as negative_rows,
       count(*) filter (where amount is null) as null_amount_rows,
       count(*) filter (where stripe_payment_id is not null) as stripe_payment_rows,
       count(*) filter (where stripe_session_id is not null) as stripe_session_rows
from public.payments;

with duplicate_ids as (
  select stripe_payment_id
  from public.payments
  where stripe_payment_id is not null
  group by stripe_payment_id
  having count(*) > 1
), grouped as (
  select p.stripe_payment_id,
         count(*) as rows_in_group,
         count(distinct p.mission_id) as distinct_missions,
         count(distinct p.stripe_session_id) as distinct_sessions,
         count(distinct p.amount) as distinct_amounts,
         count(distinct p.status) as distinct_statuses,
         min(p.created_at) as first_created_at,
         max(p.created_at) as last_created_at
  from public.payments p
  join duplicate_ids d using (stripe_payment_id)
  group by p.stripe_payment_id
)
select row_number() over (order by md5(stripe_payment_id)) as duplicate_group,
       rows_in_group,
       distinct_missions,
       distinct_sessions,
       distinct_amounts,
       distinct_statuses,
       first_created_at = last_created_at as same_created_at
from grouped
order by duplicate_group;

rollback;
