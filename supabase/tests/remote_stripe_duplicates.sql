\set ON_ERROR_STOP on
\pset format csv

begin transaction read only;

with duplicate_ids as (
  select stripe_payment_id
  from public.payments
  where stripe_payment_id is not null
  group by stripe_payment_id
  having count(*) > 1
)
select p.stripe_payment_id,
       p.id as local_payment_id,
       p.mission_id,
       p.stripe_session_id,
       p.status,
       p.amount,
       p.amount_net,
       p.application_fee,
       p.refund_amount,
       p.paid_at,
       p.refunded_at,
       p.created_at,
       p.updated_at
from public.payments p
join duplicate_ids d using (stripe_payment_id)
order by p.stripe_payment_id, p.created_at, p.id;

rollback;
