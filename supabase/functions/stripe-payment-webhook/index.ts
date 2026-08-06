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
