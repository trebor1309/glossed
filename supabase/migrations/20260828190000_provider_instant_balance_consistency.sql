-- Stripe exposes standard-available and instant-available balances as distinct
-- payout views. Funds eligible for an Instant Payout can still be pending for
-- a standard payout, so instant_available is not constrained to available.
alter table public.provider_balance_snapshots_v2
  drop constraint provider_balance_snapshot_instant_consistent;

alter table public.provider_balance_snapshots_v2
  add constraint provider_balance_snapshot_instant_consistent check (
    stripe_instant_available_net_amount_cents
      + stripe_instant_fee_amount_cents
      = stripe_instant_available_gross_amount_cents
    and (
      (stripe_instant_available_gross_amount_cents = 0
        and instant_destination_id is null and instant_destination_type is null)
      or
      (stripe_instant_available_gross_amount_cents > 0
        and length(instant_destination_id) between 3 and 255
        and instant_destination_type in ('bank_account', 'card'))
    )
  );
