import Stripe from "npm:stripe@22.5.0";
import { retrieveConnectAccount, stripe, syncConnectAccount } from "./connect-v2.ts";
import { admin } from "./supabase.ts";

type ConnectContext = {
  provider_id: string;
  stripe_account_id: string;
  connect_revision: number;
};

type TransferReservation = {
  transfer_id: string;
  transfer_status: string;
  amount_cents: number;
  currency: string;
  destination_account_id: string;
  source_transaction_charge_id: string;
  idempotency_key: string;
  attempt_number?: number;
};

async function contextForPayment(paymentId: string) {
  const { data, error } = await admin.rpc("get_checkout_v2_release_connect_context", {
    p_payment_id: paymentId,
  });
  if (error) throw error;
  const context = data?.[0] as ConnectContext | undefined;
  if (!context?.stripe_account_id) throw new Error("Connect account is unavailable");
  return context;
}

export async function refreshConnectForRelease(paymentId: string) {
  for (let pass = 0; pass < 2; pass += 1) {
    const before = await contextForPayment(paymentId);
    const account = await retrieveConnectAccount(before.stripe_account_id);
    const applied = await syncConnectAccount(account, {
      id: `release-preflight-${crypto.randomUUID()}`,
      type: "account.release_preflight",
      createdAt: new Date(),
      source: "account_check",
      expectedRevision: before.connect_revision,
    });
    if (applied) return await contextForPayment(paymentId);
  }
  throw new Error("Connect account changed during release preflight");
}

function retryableStripeFailure(error: unknown) {
  return !(
    error instanceof Stripe.errors.StripeInvalidRequestError ||
    error instanceof Stripe.errors.StripeAuthenticationError ||
    error instanceof Stripe.errors.StripePermissionError
  );
}

function errorDetails(error: unknown) {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      code: error.code ?? error.type ?? "stripe_error",
      message: error.message,
      retryable: retryableStripeFailure(error),
    };
  }
  return {
    code: "transfer_request_failed",
    message: error instanceof Error ? error.message : "Unknown transfer failure",
    retryable: true,
  };
}

export async function dispatchProviderTransferV2(paymentId: string, transferId: string) {
  const context = await refreshConnectForRelease(paymentId);
  const { data, error } = await admin.rpc("reserve_provider_transfer_dispatch_v2", {
    p_transfer_id: transferId,
    p_expected_connect_revision: context.connect_revision,
  });
  if (error) throw error;
  const reservation = data?.[0] as TransferReservation | undefined;
  if (!reservation) throw new Error("Provider transfer reservation is unavailable");
  if (reservation.transfer_status === "succeeded") {
    return { transfer_id: transferId, status: "succeeded", reused: true };
  }

  const { error: submitError } = await admin.rpc("mark_provider_transfer_submitted_v2", {
    p_transfer_id: transferId,
  });
  if (submitError) throw submitError;

  try {
    const transfer = await stripe.transfers.create(
      {
        amount: reservation.amount_cents,
        currency: reservation.currency,
        destination: reservation.destination_account_id,
        source_transaction: reservation.source_transaction_charge_id,
        transfer_group: `glossed_payment_${paymentId}`,
        metadata: {
          financial_flow_version: "marketplace_v2",
          checkout_v2_payment_id: paymentId,
          provider_transfer_v2_id: transferId,
        },
      },
      { idempotencyKey: reservation.idempotency_key }
    );
    const { error: completeError } = await admin.rpc("complete_provider_transfer_v2", {
      p_transfer_id: transferId,
      p_stripe_transfer_id: transfer.id,
    });
    if (completeError) throw completeError;
    return { transfer_id: transferId, stripe_transfer_id: transfer.id, status: "succeeded" };
  } catch (error) {
    const details = errorDetails(error);
    const { error: failureError } = await admin.rpc("fail_provider_transfer_v2", {
      p_transfer_id: transferId,
      p_error_code: details.code.slice(0, 100),
      p_error_message: details.message.slice(0, 4000),
      p_retryable: details.retryable,
    });
    if (failureError) console.error(failureError);
    throw error;
  }
}
