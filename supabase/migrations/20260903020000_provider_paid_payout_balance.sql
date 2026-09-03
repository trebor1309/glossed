-- A completed payout remains a permanent debit of the provider's internal
-- balance. Only failed or cancelled payouts release their reservation.
create or replace function public.provider_internal_balance_v2(
  p_provider_id uuid, p_currency text
)
returns table (
  transferred_amount_cents bigint,
  recovered_amount_cents bigint,
  retransferred_amount_cents bigint,
  reserved_payout_amount_cents bigint,
  unreserved_amount_cents bigint,
  transfer_pending_amount_cents bigint
)
language sql stable security definer set search_path = public, pg_temp as $$
  with transferred as (
    select coalesce(sum(amount_cents), 0)::bigint amount
    from public.provider_transfers_v2
    where provider_id = p_provider_id and currency = lower(p_currency)
      and succeeded_at is not null
  ), recovered as (
    select coalesce(sum(reversal.recovered_amount_cents), 0)::bigint amount
    from public.transfer_reversals_v2 reversal
    join public.provider_transfers_v2 transfer
      on transfer.id = reversal.provider_transfer_id
    where transfer.provider_id = p_provider_id
      and reversal.currency = lower(p_currency)
      and reversal.completed_at is not null
  ), retransferred as (
    select coalesce(sum(reversal.recovered_amount_cents), 0)::bigint amount
    from public.transfer_reversals_v2 reversal
    join public.provider_transfers_v2 transfer
      on transfer.id = reversal.provider_transfer_id
    where transfer.provider_id = p_provider_id
      and reversal.currency = lower(p_currency)
      and reversal.retransferred_at is not null
  ), committed_payouts as (
    select coalesce(sum(payout.provider_balance_debit_amount_cents), 0)::bigint amount
    from public.provider_payouts_v2 payout
    where payout.provider_id = p_provider_id and payout.currency = lower(p_currency)
      and payout.failed_at is null and payout.cancelled_at is null
  ), pending as (
    select coalesce(sum(amount_cents), 0)::bigint amount
    from public.provider_transfers_v2
    where provider_id = p_provider_id and currency = lower(p_currency)
      and succeeded_at is null
  )
  select transferred.amount, recovered.amount, retransferred.amount,
    committed_payouts.amount,
    greatest(0, transferred.amount - recovered.amount + retransferred.amount
      - committed_payouts.amount)::bigint,
    pending.amount
  from transferred, recovered, retransferred, committed_payouts, pending
$$;
