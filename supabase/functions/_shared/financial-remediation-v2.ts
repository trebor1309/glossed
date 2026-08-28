import Stripe from "npm:stripe@22.5.0";
import { stripe } from "./connect-v2.ts";
import { admin } from "./supabase.ts";
import { refreshConnectForRelease } from "./release-transfer-v2.ts";

type ReversalReservation = {
  reversal_id: string;
  operation_status: string;
  stripe_transfer_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
};

type RefundReservation = {
  refund_id: string;
  operation_status: string;
  stripe_payment_intent_id: string;
  amount_cents: number;
  currency: string;
  idempotency_key: string;
};

function errorDetails(error: unknown, fallback: string) {
  if (error instanceof Stripe.errors.StripeError) {
    return {
      code: (error.code ?? error.type ?? "stripe_error").slice(0, 100),
      message: error.message.slice(0, 4000),
      retryable: !(
        error instanceof Stripe.errors.StripeInvalidRequestError ||
        error instanceof Stripe.errors.StripeAuthenticationError ||
        error instanceof Stripe.errors.StripePermissionError
      ),
    };
  }
  return {
    code: fallback,
    message: (error instanceof Error ? error.message : "Unknown Stripe failure").slice(0, 4000),
    retryable: true,
  };
}

export async function dispatchTransferReversalV2(reversalId: string) {
  const { data, error } = await admin.rpc("reserve_transfer_reversal_dispatch_v2", {
    p_reversal_id: reversalId,
  });
  if (error) throw error;
  const reservation = data?.[0] as ReversalReservation | undefined;
  if (!reservation) throw new Error("Transfer reversal reservation is unavailable");
  if (["fully_recovered", "partially_recovered", "retransferred"].includes(
    reservation.operation_status
  )) {
    return { reversal_id: reversalId, status: reservation.operation_status, reused: true };
  }
  const { error: submitError } = await admin.rpc("mark_transfer_reversal_submitted_v2", {
    p_reversal_id: reversalId,
  });
  if (submitError) throw submitError;
  try {
    const reversal = await stripe.transfers.createReversal(
      reservation.stripe_transfer_id,
      {
        amount: reservation.amount_cents,
        metadata: {
          financial_flow_version: "marketplace_v2",
          transfer_reversal_v2_id: reversalId,
        },
      },
      { idempotencyKey: reservation.idempotency_key }
    );
    const { error: completeError } = await admin.rpc("complete_transfer_reversal_v2", {
      p_reversal_id: reversalId,
      p_stripe_reversal_id: reversal.id,
      p_recovered_amount_cents: reversal.amount,
    });
    if (completeError) throw completeError;
    return { reversal_id: reversalId, stripe_reversal_id: reversal.id, status: "succeeded" };
  } catch (error) {
    const details = errorDetails(error, "transfer_reversal_request_failed");
    const { error: failureError } = await admin.rpc("fail_transfer_reversal_v2", {
      p_reversal_id: reversalId,
      p_error_code: details.code,
      p_error_message: details.message,
      p_retryable: details.retryable,
    });
    if (failureError) console.error(failureError);
    throw error;
  }
}

export async function dispatchRefundV2(refundId: string) {
  const { data, error } = await admin.rpc("reserve_refund_dispatch_v2", {
    p_refund_id: refundId,
  });
  if (error) throw error;
  const reservation = data?.[0] as RefundReservation | undefined;
  if (!reservation) throw new Error("Refund reservation is unavailable");
  if (reservation.operation_status === "succeeded") {
    return { refund_id: refundId, status: "succeeded", reused: true };
  }
  const { error: submitError } = await admin.rpc("mark_refund_submitted_v2", {
    p_refund_id: refundId,
  });
  if (submitError) throw submitError;
  try {
    const refund = await stripe.refunds.create(
      {
        payment_intent: reservation.stripe_payment_intent_id,
        amount: reservation.amount_cents,
        metadata: {
          financial_flow_version: "marketplace_v2",
          refund_v2_id: refundId,
        },
      },
      { idempotencyKey: reservation.idempotency_key }
    );
    const { error: recordError } = await admin.rpc("record_refund_submission_v2", {
      p_refund_id: refundId,
      p_stripe_refund_id: refund.id,
    });
    if (recordError) throw recordError;
    return { refund_id: refundId, stripe_refund_id: refund.id, status: refund.status };
  } catch (error) {
    const details = errorDetails(error, "refund_request_failed");
    const { error: failureError } = await admin.rpc("fail_refund_v2", {
      p_refund_id: refundId,
      p_error_code: details.code,
      p_error_message: details.message,
      p_retryable: details.retryable,
    });
    if (failureError) console.error(failureError);
    throw error;
  }
}

export async function dispatchProviderRetransferV2(paymentId: string, reversalId: string) {
  const context = await refreshConnectForRelease(paymentId);
  const { data, error } = await admin.rpc("reserve_provider_retransfer_v2", {
    p_reversal_id: reversalId,
    p_expected_connect_revision: context.connect_revision,
  });
  if (error) throw error;
  const reservation = data?.[0];
  if (!reservation) throw new Error("Provider retransfer reservation is unavailable");
  const transfer = await stripe.transfers.create(
    {
      amount: reservation.amount_cents,
      currency: reservation.currency,
      destination: reservation.destination_account_id,
      source_transaction: reservation.source_transaction_charge_id,
      metadata: {
        financial_flow_version: "marketplace_v2",
        provisional_recovery_return: "true",
        transfer_reversal_v2_id: reversalId,
      },
    },
    { idempotencyKey: reservation.idempotency_key }
  );
  const { error: completeError } = await admin.rpc("complete_provider_retransfer_v2", {
    p_reversal_id: reversalId,
    p_stripe_retransfer_id: transfer.id,
  });
  if (completeError) throw completeError;
  return { reversal_id: reversalId, stripe_retransfer_id: transfer.id, status: "succeeded" };
}
