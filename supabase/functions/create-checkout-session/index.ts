import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const appUrl = (Deno.env.get("APP_URL") ?? "https://glossed.vercel.app").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { mission_id: missionId } = await req.json();
    if (!missionId) throw new HttpError(400, "Missing mission_id");

    const { data: attempts, error: reservationError } = await admin.rpc(
      "reserve_checkout_attempt",
      { p_mission_id: missionId, p_client_id: authUser.id, p_ttl_seconds: 3600 }
    );
    if (reservationError) throw reservationError;
    const attempt = attempts?.[0];
    if (!attempt) throw new Error("Checkout reservation failed");
    if (attempt.attempt_status === "open" && attempt.stripe_session_url) {
      return json(req, { url: attempt.stripe_session_url });
    }

    const { data: mission, error: missionError } = await admin
      .from("missions")
      .select("id, service, description, price, client_id, pro_id, status")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError) throw missionError;
    if (!mission) throw new HttpError(404, "Mission not found");
    if (mission.client_id !== authUser.id)
      throw new HttpError(403, "You cannot pay for this mission");
    if (mission.status !== "proposed") throw new HttpError(409, "Mission is not payable");

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
    };

    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
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
