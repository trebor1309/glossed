import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { admin } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const cryptoProvider = Stripe.createSubtleCryptoProvider();

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature || !webhookSecret) return response({ error: "Webhook is not configured" }, 500);

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      webhookSecret,
      undefined,
      cryptoProvider
    );
  } catch (error) {
    console.error("Invalid Stripe signature", error);
    return response({ error: "Invalid signature" }, 400);
  }

  if (event.type !== "checkout.session.completed") {
    return response({ skipped: true });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") return response({ skipped: true });

    const missionId = session.metadata?.mission_id;
    const clientId = session.metadata?.client_id;
    const proId = session.metadata?.pro_id;
    if (!missionId || !clientId || !proId)
      return response({ error: "Missing payment metadata" }, 422);

    const { data: mission, error: missionError } = await admin
      .from("missions")
      .select("id, status, client_id, pro_id, price, service_price, travel_fee, total_price")
      .eq("id", missionId)
      .maybeSingle();
    if (missionError) throw missionError;
    if (!mission) return response({ error: "Mission not found" }, 404);
    if (mission.client_id !== clientId || mission.pro_id !== proId) {
      return response({ error: "Payment metadata mismatch" }, 422);
    }

    const baseAmountCents = Math.round(Number(mission.price) * 100);
    const feeCents = Math.round(baseAmountCents * 0.1);
    const expectedTotalCents = baseAmountCents + feeCents;
    if (
      session.amount_total !== expectedTotalCents ||
      Number(session.metadata?.fee_cents) !== feeCents
    ) {
      return response({ error: "Payment amount mismatch" }, 422);
    }

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return response({ error: "Missing payment intent" }, 422);

    const { data: existing, error: existingError } = await admin
      .from("payments")
      .select("id")
      .eq("stripe_payment_id", paymentIntentId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (mission.status === "proposed") {
        const now = new Date().toISOString();
        const { error: updateError } = await admin
          .from("missions")
          .update({ status: "confirmed", paid_at: now, updated_at: now })
          .eq("id", missionId)
          .eq("status", "proposed");
        if (updateError) throw updateError;
      }
      return response({ ok: true, duplicate: true });
    }

    if (mission.status !== "proposed") {
      return response({ error: "Mission is not payable" }, 409);
    }

    const now = new Date().toISOString();
    const { error: paymentError } = await admin.from("payments").insert({
      mission_id: missionId,
      client_id: clientId,
      pro_id: proId,
      amount: expectedTotalCents,
      currency: session.currency ?? "eur",
      application_fee: feeCents / 100,
      amount_net: baseAmountCents / 100,
      travel_fee: mission.travel_fee ?? null,
      pro_service_price: mission.service_price ?? null,
      pro_total_price: mission.total_price ?? null,
      stripe_payment_id: paymentIntentId,
      stripe_session_id: session.id,
      status: "paid",
      paid_at: now,
    });
    if (paymentError) throw paymentError;

    const { error: updateError } = await admin
      .from("missions")
      .update({ status: "confirmed", paid_at: now, updated_at: now })
      .eq("id", missionId)
      .eq("status", "proposed");
    if (updateError) throw updateError;

    return response({ ok: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return response({ error: "Webhook processing failed" }, 500);
  }
});
