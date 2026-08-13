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

  if (!["checkout.session.completed", "checkout.session.async_payment_succeeded",
        "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
    return response({ skipped: true });
  }

  try {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.metadata?.financial_flow_version === "marketplace_v2") {
      const authoritative = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["payment_intent.latest_charge"],
      });
      const paymentIntent =
        typeof authoritative.payment_intent === "string"
          ? null
          : authoritative.payment_intent;
      const paymentIntentId =
        typeof authoritative.payment_intent === "string"
          ? authoritative.payment_intent
          : authoritative.payment_intent?.id ?? null;
      const latestCharge = paymentIntent?.latest_charge;
      const chargeId = typeof latestCharge === "string" ? latestCharge : latestCharge?.id ?? null;
      const amountTotal = authoritative.amount_total;
      const currency = authoritative.currency;
      if (!Number.isSafeInteger(amountTotal) || !currency) {
        return response({ error: "Invalid Checkout v2 amount" }, 422);
      }
      const { data, error } = await admin.rpc("process_checkout_v2_event", {
        p_event_id: event.id,
        p_event_type: event.type,
        p_stripe_created_at: new Date(event.created * 1000).toISOString(),
        p_livemode: event.livemode,
        p_stripe_session_id: authoritative.id,
        p_payment_status: authoritative.payment_status,
        p_stripe_payment_intent_id: paymentIntentId,
        p_stripe_charge_id: chargeId,
        p_amount_total_cents: amountTotal,
        p_currency: currency,
        p_payload_summary: {
          checkout_status: authoritative.status,
          payment_status: authoritative.payment_status,
          payment_method_types: authoritative.payment_method_types,
        },
      });
      if (error) throw error;
      return response({
        ok: true,
        duplicate: data?.[0]?.duplicate ?? false,
        outcome: data?.[0]?.outcome,
      });
    }

    if (event.type !== "checkout.session.completed") return response({ skipped: true });
    if (session.payment_status !== "paid") return response({ skipped: true });

    const missionId = session.metadata?.mission_id;
    const clientId = session.metadata?.client_id;
    const proId = session.metadata?.pro_id;
    if (!missionId || !clientId || !proId)
      return response({ error: "Missing payment metadata" }, 422);

    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    if (!paymentIntentId) return response({ error: "Missing payment intent" }, 422);
    if (!Number.isSafeInteger(session.amount_total) || !session.currency) {
      return response({ error: "Invalid Stripe amount" }, 422);
    }
    const feeCents = Number(session.metadata?.fee_cents);
    if (!Number.isSafeInteger(feeCents) || feeCents < 0) {
      return response({ error: "Invalid Stripe fee" }, 422);
    }

    const { data, error } = await admin.rpc("process_stripe_checkout_completed", {
      p_event_id: event.id,
      p_event_type: event.type,
      p_stripe_created_at: new Date(event.created * 1000).toISOString(),
      p_livemode: event.livemode,
      p_mission_id: missionId,
      p_client_id: clientId,
      p_pro_id: proId,
      p_stripe_payment_id: paymentIntentId,
      p_stripe_session_id: session.id,
      p_amount_total_cents: session.amount_total,
      p_application_fee_cents: feeCents,
      p_currency: session.currency,
    });
    if (error) throw error;

    return response({ ok: true, duplicate: data?.[0]?.duplicate ?? false });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return response({ error: "Webhook processing failed" }, 500);
  }
});
