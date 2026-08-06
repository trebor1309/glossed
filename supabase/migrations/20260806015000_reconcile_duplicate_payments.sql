-- One-off reconciliation of the five duplicate test-mode Stripe payments
-- reviewed against Stripe on 2026-08-06.

begin;

do $$
declare
  v_target_rows integer;
  v_valid_groups integer;
begin
  select count(*) into v_target_rows
  from public.payments
  where stripe_payment_id in (
    'pi_3Sk1dt1opUcNNC0M0spIPCPb',
    'pi_3SWnMS1opUcNNC0M12cEtmVm',
    'pi_3SWnQu1opUcNNC0M1iJ8vbAU',
    'pi_3SYXgT1opUcNNC0M1ShLRkYG',
    'pi_3SYXRX1opUcNNC0M0kbufTfR'
  );

  if v_target_rows = 0 then return; end if;
  if v_target_rows = 5 then
    if (select count(distinct stripe_payment_id) from public.payments
        where stripe_payment_id in (
          'pi_3Sk1dt1opUcNNC0M0spIPCPb',
          'pi_3SWnMS1opUcNNC0M12cEtmVm',
          'pi_3SWnQu1opUcNNC0M1iJ8vbAU',
          'pi_3SYXgT1opUcNNC0M1ShLRkYG',
          'pi_3SYXRX1opUcNNC0M0kbufTfR'
        )) <> 5
       or (select count(*) from public.payments
           where stripe_payment_id in (
             'pi_3Sk1dt1opUcNNC0M0spIPCPb',
             'pi_3SWnMS1opUcNNC0M12cEtmVm',
             'pi_3SWnQu1opUcNNC0M1iJ8vbAU',
             'pi_3SYXgT1opUcNNC0M1ShLRkYG',
             'pi_3SYXRX1opUcNNC0M0kbufTfR'
           ) and stripe_session_id is not null) <> 5 then
      raise exception 'Previously reconciled payment structure has changed';
    end if;
    return;
  end if;
  if v_target_rows <> 10 then
    raise exception 'Expected 10 duplicate or 5 reconciled rows, found %', v_target_rows;
  end if;

  select count(*) into v_valid_groups
  from (
    select stripe_payment_id
    from public.payments
    where stripe_payment_id in (
      'pi_3Sk1dt1opUcNNC0M0spIPCPb',
      'pi_3SWnMS1opUcNNC0M12cEtmVm',
      'pi_3SWnQu1opUcNNC0M1iJ8vbAU',
      'pi_3SYXgT1opUcNNC0M1ShLRkYG',
      'pi_3SYXRX1opUcNNC0M0kbufTfR'
    )
    group by stripe_payment_id
    having count(*) = 2
       and count(distinct mission_id) = 1
       and count(distinct amount) = 1
       and count(*) filter (where stripe_session_id is not null) = 1
  ) reviewed;

  if v_valid_groups <> 5 then
    raise exception 'Reviewed duplicate payment structure has changed';
  end if;
end
$$;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated, service_role;

create table if not exists private.payment_reconciliation_archive_20260806 (
  original_payment_id uuid primary key,
  original_row jsonb not null,
  archived_at timestamptz not null default now(),
  reason text not null
);
revoke all on private.payment_reconciliation_archive_20260806
  from public, anon, authenticated, service_role;

insert into private.payment_reconciliation_archive_20260806 (
  original_payment_id, original_row, reason
)
select id, to_jsonb(p), 'Duplicate Stripe payment reconciliation reviewed on 2026-08-06'
from public.payments p
where stripe_payment_id in (
  'pi_3Sk1dt1opUcNNC0M0spIPCPb',
  'pi_3SWnMS1opUcNNC0M12cEtmVm',
  'pi_3SWnQu1opUcNNC0M1iJ8vbAU',
  'pi_3SYXgT1opUcNNC0M1ShLRkYG',
  'pi_3SYXRX1opUcNNC0M0kbufTfR'
)
on conflict (original_payment_id) do nothing;

alter table public.payments add column if not exists stripe_refund_id text;

-- Stripe confirms a successful partial refund of EUR 65.00.
update public.payments
set status = 'partially_refunded',
    refund_amount = 65.00,
    stripe_refund_id = 're_3SWnMS1opUcNNC0M1d7lHGuK',
    refunded_at = '2025-11-24 00:13:26+00'::timestamptz,
    updated_at = greatest(
      coalesce(updated_at, '-infinity'::timestamptz),
      '2025-11-24 00:13:27.794871+00'::timestamptz
    )
where id = '6277f229-9ddc-4d51-a665-6ffa64512323'
  and stripe_payment_id = 'pi_3SWnMS1opUcNNC0M12cEtmVm'
  and stripe_session_id is not null;

-- Stripe confirms a successful full refund of EUR 2.20.
update public.payments
set status = 'refunded',
    refund_amount = 2.20,
    stripe_refund_id = 're_3SWnQu1opUcNNC0M1gKv5zZ9',
    refunded_at = coalesce(refunded_at, '2025-11-24 00:16:51+00'::timestamptz),
    updated_at = greatest(
      coalesce(updated_at, '-infinity'::timestamptz),
      '2025-11-24 00:16:53.669+00'::timestamptz
    )
where id = '9ccc499a-8c46-43e2-914b-c52ccaf25526'
  and stripe_payment_id = 'pi_3SWnQu1opUcNNC0M1iJ8vbAU'
  and stripe_session_id is not null;

delete from public.payments
where id in (
  'eb90ba00-6905-4fab-83d0-24bbf2bf0ef1',
  'f78210d6-565f-43a3-a8fd-9138c7935954',
  '4f3d0ac7-85c5-4f6d-9b56-d7f165500a99',
  '76dc01df-c4f9-40b0-9556-47217f19ab48',
  '60159fe8-6c4c-4764-bc61-c76fcec51e4f'
)
and stripe_session_id is null;

do $$
begin
  if (select count(*) from private.payment_reconciliation_archive_20260806) not in (0, 10) then
    raise exception 'Reconciliation archive is incomplete';
  end if;
  if exists (
    select 1 from public.payments
    where stripe_payment_id is not null
    group by stripe_payment_id having count(*) > 1
  ) then
    raise exception 'Duplicate Stripe payment IDs remain';
  end if;
  if exists (
    select 1 from public.payments
    where stripe_payment_id = 'pi_3SWnMS1opUcNNC0M12cEtmVm'
      and (status <> 'partially_refunded' or refund_amount <> 65.00
           or stripe_refund_id <> 're_3SWnMS1opUcNNC0M1d7lHGuK')
  ) then
    raise exception 'Partial refund reconciliation failed';
  end if;
  if exists (
    select 1 from public.payments
    where stripe_payment_id = 'pi_3SWnQu1opUcNNC0M1iJ8vbAU'
      and (status <> 'refunded' or refund_amount <> 2.20
           or stripe_refund_id <> 're_3SWnQu1opUcNNC0M1gKv5zZ9')
  ) then
    raise exception 'Full refund reconciliation failed';
  end if;
end
$$;

commit;
