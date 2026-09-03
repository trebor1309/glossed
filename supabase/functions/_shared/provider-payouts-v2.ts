import Stripe from "npm:stripe@22.5.0";
import {
  retrieveConnectAccount,
  stripe,
  syncConnectAccount,
} from "./connect-v2.ts";
import { isRetryableStripeBalanceOperationFailure } from "./stripe_balance_operation_error.ts";
import { admin } from "./supabase.ts";

type PayoutContext = {
  provider_id: string;
  stripe_account_id: string;
  connect_revision: number;
  payouts_status: string;
  livemode: boolean;
  policy_version: string;
  manual_schedule_configured: boolean;
  block_reasons: string[];
};

type BalanceSnapshot = {
  id: string;
  provider_id: string;
  stripe_account_id: string;
  currency: string;
  stripe_available_amount_cents: number;
  stripe_pending_amount_cents: number;
  stripe_instant_available_gross_amount_cents: number;
  stripe_instant_available_net_amount_cents: number;
  stripe_instant_fee_amount_cents: number;
  instant_destination_id: string | null;
};

type PayoutReservation = {
  payout_id: string;
  payout_method: "standard" | "instant";
  bank_payout_amount_cents: number;
  currency: string;
  stripe_account_id: string;
  destination_id: string | null;
  idempotency_key: string;
  attempt_number: number;
};

function amountForCurrency(
  rows:
    | Array<{ amount?: number; currency?: string; source_types?: unknown }>
    | undefined,
  currency: string,
) {
  const row = rows?.find((item) => item.currency?.toLowerCase() === currency);
  return {
    amount: Math.max(0, Number(row?.amount ?? 0)),
    sourceTypes: row?.source_types ?? {},
  };
}

function instantForCurrency(balance: Stripe.Balance, currency: string) {
  const row = balance.instant_available?.find(
    (item) => item.currency.toLowerCase() === currency,
  );
  const candidates = (row?.net_available ?? []) as Array<{
    amount: number;
    destination: string;
  }>;
  const candidate = candidates
    .filter((item) => item.amount > 0 && typeof item.destination === "string")
    .sort((left, right) => right.amount - left.amount)[0];
  const gross = candidate ? Math.max(0, Number(row?.amount ?? 0)) : 0;
  const net = candidate ? Math.max(0, Number(candidate.amount)) : 0;
  if (net > gross) {
    throw new Error("Stripe returned an invalid Instant Payout balance");
  }
  return {
    gross,
    net,
    destination: candidate?.destination ?? null,
    destinationType: candidate?.destination?.startsWith("card_")
      ? "card"
      : "bank_account",
    sourceTypes: row?.source_types ?? {},
  };
}

async function payoutContext(providerId: string) {
  const { data, error } = await admin.rpc("get_provider_payout_context_v2", {
    p_provider_id: providerId,
    p_currency: "eur",
  });
  if (error) throw error;
  const context = data?.[0] as PayoutContext | undefined;
  if (!context?.stripe_account_id) {
    throw new Error("Provider Connect account is unavailable");
  }
  return context;
}

async function refreshConnectAccount(context: PayoutContext) {
  for (let pass = 0; pass < 2; pass += 1) {
    const current = pass === 0
      ? context
      : await payoutContext(context.provider_id);
    const account = await retrieveConnectAccount(current.stripe_account_id);
    const applied = await syncConnectAccount(account, {
      id: `payout-preflight-${crypto.randomUUID()}`,
      type: "account.payout_preflight",
      createdAt: new Date(),
      source: "account_check",
      expectedRevision: current.connect_revision,
    });
    if (applied) return await payoutContext(context.provider_id);
  }
  throw new Error("Connect account changed during payout preflight");
}

async function ensureManualSchedule(context: PayoutContext) {
  const settings = await stripe.balanceSettings.update(
    { payments: { payouts: { schedule: { interval: "manual" } } } },
    { stripeAccount: context.stripe_account_id },
  );
  const interval = settings.payments?.payouts?.schedule?.interval;
  if (interval !== "manual") {
    throw new Error("Stripe manual payout schedule was not applied");
  }
  const { error } = await admin.rpc(
    "record_provider_payout_schedule_control_v2",
    {
      p_provider_id: context.provider_id,
      p_stripe_account_id: context.stripe_account_id,
      p_interval: interval,
      p_balance_settings_revision: null,
    },
  );
  if (error) throw error;
}

export async function refreshProviderBalanceV2(providerId: string) {
  let context = await payoutContext(providerId);
  context = await refreshConnectAccount(context);
  if (context.payouts_status !== "active") {
    throw new Error("Stripe payout capability is not active");
  }
  if (!context.manual_schedule_configured) {
    await ensureManualSchedule(context);
    context = await payoutContext(providerId);
  }

  const balance = await stripe.balance.retrieve(
    { expand: ["instant_available.net_available"] },
    { stripeAccount: context.stripe_account_id },
  );
  const currency = "eur";
  const available = amountForCurrency(balance.available, currency);
  const pending = amountForCurrency(balance.pending, currency);
  const instant = instantForCurrency(balance, currency);
  const { data, error } = await admin.rpc(
    "record_provider_balance_snapshot_v2",
    {
      p_stripe_account_id: context.stripe_account_id,
      p_currency: currency,
      p_available_amount_cents: available.amount,
      p_pending_amount_cents: pending.amount,
      p_instant_gross_amount_cents: instant.gross,
      p_instant_net_amount_cents: instant.net,
      p_instant_destination_id: instant.destination,
      p_instant_destination_type: instant.destination
        ? instant.destinationType
        : null,
      p_source_types: {
        available: available.sourceTypes,
        pending: pending.sourceTypes,
        instant: instant.sourceTypes,
      },
      p_livemode: context.livemode,
      p_retrieval_key:
        `provider-balance-v2:${context.stripe_account_id}:${crypto.randomUUID()}`,
    },
  );
  if (error) throw error;
  return data as BalanceSnapshot;
}

function errorDetails(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      code: (error.code ?? error.type ?? "stripe_error").slice(0, 100),
      message: error.message.slice(0, 4000),
      retryable: isRetryableStripeBalanceOperationFailure(error),
    };
  }
  return {
    code: "payout_request_failed",
    message: (error instanceof Error ? error.message : "Unknown payout failure")
      .slice(0, 4000),
    retryable: true,
  };
}

export async function dispatchProviderPayoutV2(
  payoutId: string,
  providerId: string,
) {
  const snapshot = await refreshProviderBalanceV2(providerId);
  const { data, error } = await admin.rpc(
    "reserve_provider_payout_dispatch_v2",
    {
      p_payout_id: payoutId,
      p_balance_snapshot_id: snapshot.id,
    },
  );
  if (error) throw error;
  const reservation = data?.[0] as PayoutReservation | undefined;
  if (!reservation) {
    throw new Error("Provider payout reservation is unavailable");
  }

  try {
    const payout = await stripe.payouts.create(
      {
        amount: reservation.bank_payout_amount_cents,
        currency: reservation.currency,
        method: reservation.payout_method,
        ...(reservation.destination_id
          ? { destination: reservation.destination_id }
          : {}),
        metadata: {
          financial_flow_version: "marketplace_v2",
          provider_payout_v2_id: reservation.payout_id,
          provider_id: providerId,
        },
      },
      {
        stripeAccount: reservation.stripe_account_id,
        idempotencyKey: reservation.idempotency_key,
      },
    );
    const applicationFee = typeof payout.application_fee === "string"
      ? payout.application_fee
      : payout.application_fee?.id;
    const balanceTransaction = typeof payout.balance_transaction === "string"
      ? payout.balance_transaction
      : payout.balance_transaction?.id;
    const { error: attachError } = await admin.rpc(
      "attach_provider_payout_stripe_object_v2",
      {
        p_payout_id: reservation.payout_id,
        p_stripe_payout_id: payout.id,
        p_stripe_status: payout.status,
        p_arrival_date: payout.arrival_date
          ? new Date(payout.arrival_date * 1000).toISOString().slice(0, 10)
          : null,
        p_stripe_application_fee_id: applicationFee ?? null,
        p_stripe_balance_transaction_id: balanceTransaction ?? null,
      },
    );
    if (attachError) throw attachError;
    return {
      payout_id: reservation.payout_id,
      stripe_payout_id: payout.id,
      status: payout.status,
    };
  } catch (error) {
    const details = errorDetails(error);
    const { error: failureError } = await admin.rpc(
      "fail_provider_payout_dispatch_v2",
      {
        p_payout_id: reservation.payout_id,
        p_error_code: details.code,
        p_error_message: details.message,
        p_retryable: details.retryable,
      },
    );
    if (failureError) console.error(failureError);
    throw error;
  }
}

export async function reserveAndDispatchStandardPayoutV2(providerId: string) {
  const snapshot = await refreshProviderBalanceV2(providerId);
  const { data, error } = await admin.rpc(
    "reserve_standard_provider_payout_v2",
    {
      p_provider_id: providerId,
      p_balance_snapshot_id: snapshot.id,
    },
  );
  if (error) throw error;
  if (!data?.id) throw new Error("Standard payout reservation failed");
  return await dispatchProviderPayoutV2(data.id, providerId);
}

export async function quoteInstantPayoutV2(providerId: string) {
  const snapshot = await refreshProviderBalanceV2(providerId);
  const { data, error } = await admin.rpc("quote_provider_instant_payout_v2", {
    p_provider_id: providerId,
    p_balance_snapshot_id: snapshot.id,
  });
  if (error) throw error;
  return data;
}

export async function confirmAndDispatchInstantPayoutV2(
  providerId: string,
  payoutId: string,
) {
  const { data, error } = await admin.rpc(
    "confirm_provider_instant_payout_v2",
    {
      p_provider_id: providerId,
      p_payout_id: payoutId,
    },
  );
  if (error) throw error;
  if (!data?.id) throw new Error("Instant payout confirmation failed");
  return await dispatchProviderPayoutV2(data.id, providerId);
}
