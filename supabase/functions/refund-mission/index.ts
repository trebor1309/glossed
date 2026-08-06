import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import {
  errorResponse,
  handleOptions,
  HttpError,
  json,
} from "../_shared/http.ts";
import {
  isDefinitiveRefundFailure,
  refundFailureCode,
} from "../_shared/stripe_refund_error.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const refundModes = new Set(["pro_cancel", "client_cancel_approved"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    const authUser = await requireUser(req);
    const body = await req.json();
    const missionId = body?.mission_id as string | undefined;
    const mode = body?.mode as string | undefined;
    if (!missionId || !mode) {
      throw new HttpError(400, "Missing mission_id or mode");
    }
    if (!refundModes.has(mode)) throw new HttpError(400, "Invalid refund mode");

    const { data: attempts, error: reservationError } = await admin.rpc(
      "reserve_mission_refund",
      { p_mission_id: missionId, p_requested_by: authUser.id, p_mode: mode },
    );
    if (reservationError) throw reservationError;
    const attempt = attempts?.[0];
    if (!attempt) throw new Error("Refund reservation failed");
    if (attempt.attempt_status === "completed") {
      return json(req, {
        ok: true,
        mode,
        payment_status: attempt.resulting_payment_status,
        stripe_refund_id: attempt.stripe_refund_id,
      });
    }

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: attempt.stripe_payment_id,
      reverse_transfer: true,
      refund_application_fee: mode === "pro_cancel",
      metadata: { mission_id: missionId, mode, requested_by: authUser.id },
    };
    if (mode === "client_cancel_approved") {
      const refundAmountCents = Number(attempt.refund_amount_cents);
      if (!Number.isSafeInteger(refundAmountCents) || refundAmountCents <= 0) {
        throw new HttpError(422, "Payment has an invalid refundable amount");
      }
      refundParams.amount = refundAmountCents;
    }

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(refundParams, {
        idempotencyKey: attempt.idempotency_key,
      });
    } catch (stripeError) {
      if (!isDefinitiveRefundFailure(stripeError)) throw stripeError;

      const { data: failureStates, error: failureStateError } = await admin.rpc(
        "fail_mission_refund",
        {
          p_attempt_id: attempt.attempt_id,
          p_attempt_number: attempt.attempt_number,
          p_failure_code: refundFailureCode(stripeError),
        },
      );
      if (failureStateError) throw failureStateError;
      const failureState = failureStates?.[0];

      // A concurrent invocation may have completed the same idempotent Stripe
      // operation before this rejection was recorded.
      if (failureState?.attempt_status === "completed") {
        return json(req, {
          ok: true,
          mode,
          payment_status: failureState.resulting_payment_status,
          stripe_refund_id: failureState.stripe_refund_id,
        });
      }

      throw new HttpError(
        422,
        "Stripe rejected the refund and no refund was created. You can retry.",
      );
    }

    const { error: finalizeError } = await admin.rpc(
      "finalize_mission_refund",
      {
        p_attempt_id: attempt.attempt_id,
        p_attempt_number: attempt.attempt_number,
        p_stripe_refund_id: refund.id,
        p_refund_amount_cents: refund.amount,
      },
    );
    if (finalizeError) throw finalizeError;

    return json(req, {
      ok: true,
      mode,
      payment_status: attempt.resulting_payment_status,
      stripe_refund_id: refund.id,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
