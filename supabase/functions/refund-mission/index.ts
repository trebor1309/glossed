import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { refundIdempotencyKey } from "../_shared/idempotency.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const refundModes = new Set(["pro_cancel", "client_cancel_approved"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const body = await req.json();
    const missionId = body?.mission_id as string | undefined;
    const mode = body?.mode as string | undefined;
    if (!missionId || !mode) throw new HttpError(400, "Missing mission_id or mode");
    if (!refundModes.has(mode)) throw new HttpError(400, "Invalid refund mode");

    const { data: mission, error: missionError } = await admin
      .from("missions")
      .select("id, status, client_id, pro_id")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError) throw missionError;
    if (!mission) throw new HttpError(404, "Mission not found");
    if (mission.pro_id !== authUser.id) throw new HttpError(403, "You cannot refund this mission");

    const expectedStatus = mode === "pro_cancel" ? "confirmed" : "cancel_requested";
    if (mission.status !== expectedStatus) {
      throw new HttpError(409, `Mission must be ${expectedStatus} for this operation`);
    }

    const { data: payment, error: paymentError } = await admin
      .from("payments")
      .select("id, status, amount_total_cents, amount_net_cents, stripe_payment_id")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) throw new HttpError(404, "Payment not found");
    if (payment.status !== "paid") throw new HttpError(409, "Payment is not refundable");
    if (!payment.stripe_payment_id) throw new HttpError(422, "Payment has no Stripe identifier");

    const refundParams: Stripe.RefundCreateParams = {
      payment_intent: payment.stripe_payment_id,
      reverse_transfer: true,
      refund_application_fee: mode === "pro_cancel",
      metadata: { mission_id: missionId, mode, requested_by: authUser.id },
    };
    if (mode === "client_cancel_approved") {
      const netCents = Number(payment.amount_net_cents);
      if (!Number.isSafeInteger(netCents) || netCents <= 0) {
        throw new HttpError(422, "Payment has an invalid refundable amount");
      }
      refundParams.amount = netCents;
    }

    const refund = await stripe.refunds.create(refundParams, {
      idempotencyKey: refundIdempotencyKey(missionId, mode),
    });
    const paymentStatus = mode === "pro_cancel" ? "refunded" : "partially_refunded";

    const { error: finalizeError } = await admin.rpc("finalize_mission_refund", {
      p_mission_id: missionId,
      p_payment_id: payment.id,
      p_expected_mission_status: expectedStatus,
      p_payment_status: paymentStatus,
      p_stripe_refund_id: refund.id,
      p_refund_amount_cents: refund.amount,
    });
    if (finalizeError) throw finalizeError;

    return json(req, {
      ok: true,
      mode,
      payment_status: paymentStatus,
      stripe_refund_id: refund.id,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
