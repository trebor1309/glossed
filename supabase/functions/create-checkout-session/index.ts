import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const appUrl = (Deno.env.get("APP_URL") ?? "https://glossed.vercel.app").replace(/\/$/, "");

function startsDuringWithdrawalPeriod(serviceDate: string) {
  const start = new Date(`${serviceDate.slice(0, 10)}T00:00:00Z`);
  const deadline = new Date();
  deadline.setUTCDate(deadline.getUTCDate() + 14);
  return !Number.isNaN(start.getTime()) && start < deadline;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { error: launchGateError } = await admin.rpc("assert_platform_feature_enabled", {
      p_flag_code: "bookings",
    });
    if (launchGateError) {
      throw new HttpError(503, "Bookings and payments are not open yet");
    }
    const { error: acceptanceError } = await admin.rpc("assert_user_current_legal_acceptances", {
      p_user_id: authUser.id,
      p_document_codes: ["privacy_notice", "client_terms"],
    });
    if (acceptanceError) throw acceptanceError;

    const { mission_id: missionId, early_performance_requested: earlyPerformanceRequested } =
      await req.json();
    if (!missionId) throw new HttpError(400, "Missing mission_id");

    const { data: attempts, error: reservationError } = await admin.rpc(
      "reserve_checkout_attempt",
      { p_mission_id: missionId, p_client_id: authUser.id, p_ttl_seconds: 3600 }
    );
    if (reservationError) throw reservationError;
    const attempt = attempts?.[0];
    if (!attempt) throw new Error("Checkout reservation failed");
    const { data: mission, error: missionError } = await admin
      .from("missions")
      .select("id, service, description, price, client_id, pro_id, status, date, time")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError) throw missionError;
    if (!mission) throw new HttpError(404, "Mission not found");
    if (mission.client_id !== authUser.id)
      throw new HttpError(403, "You cannot pay for this mission");
    if (mission.status !== "proposed") throw new HttpError(409, "Mission is not payable");
    const needsEarlyPerformanceRequest = startsDuringWithdrawalPeriod(mission.date);
    if (needsEarlyPerformanceRequest && earlyPerformanceRequested !== true) {
      throw new HttpError(422, "Expressly request early performance before starting payment");
    }

    const { data: legalVersions, error: legalError } = await admin.rpc(
      "snapshot_user_legal_acceptances",
      {
        p_user_id: authUser.id,
        p_document_codes: ["privacy_notice", "client_terms"],
        p_transaction_type: "legacy_checkout",
        p_transaction_id: attempt.attempt_id,
        p_evidence: {
          mission_id: mission.id,
          scheduled_date: mission.date,
          early_performance_requested: needsEarlyPerformanceRequest,
        },
      }
    );
    if (legalError) throw legalError;
    if (attempt.attempt_status === "open" && attempt.stripe_session_url) {
      return json(req, { url: attempt.stripe_session_url });
    }

    const { data: pro, error: proError } = await admin
      .from("users")
      .select("stripe_account_id")
      .eq("id", mission.pro_id)
      .maybeSingle();
    if (proError) throw proError;
    if (!pro?.stripe_account_id)
      throw new HttpError(409, "Professional Stripe account is not connected");

    const baseAmountCents = Math.round(Number(mission.price) * 100);
    if (!Number.isSafeInteger(baseAmountCents) || baseAmountCents <= 0) {
      throw new HttpError(422, "Mission has an invalid price");
    }
    const glossedFeeCents = Math.round(baseAmountCents * 0.1);
    const totalCents = baseAmountCents + glossedFeeCents;
    const metadata = {
      mission_id: mission.id,
      client_id: authUser.id,
      pro_id: mission.pro_id,
      fee_cents: String(glossedFeeCents),
      client_terms_version: String(legalVersions?.client_terms ?? "unknown"),
      privacy_notice_version: String(legalVersions?.privacy_notice ?? "unknown"),
      early_performance_requested: String(needsEarlyPerformanceRequest),
    };

    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        client_reference_id: authUser.id,
        expires_at: Math.floor(new Date(attempt.expires_at).getTime() / 1000),
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: totalCents,
              product_data: {
                name: mission.service || "Glossed booking",
                description: mission.description || undefined,
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: glossedFeeCents,
          transfer_data: { destination: pro.stripe_account_id },
          metadata,
        },
        metadata,
        success_url: `${appUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/dashboard/reservations`,
      },
      { idempotencyKey: attempt.idempotency_key }
    );

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    const { error: attachError } = await admin.rpc("attach_checkout_session", {
      p_attempt_id: attempt.attempt_id,
      p_stripe_session_id: session.id,
      p_stripe_session_url: session.url,
      p_expires_at: new Date(session.expires_at * 1000).toISOString(),
    });
    if (attachError) throw attachError;

    return json(req, { url: session.url });
  } catch (error) {
    return errorResponse(req, error);
  }
});
