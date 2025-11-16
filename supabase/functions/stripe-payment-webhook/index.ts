import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature") || "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

  let event;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("❌ Invalid signature:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }

  try {
    const data = event.data.object;
    const metadata = data.metadata ?? {};

    const missionId = metadata.mission_id;
    const clientId = metadata.client_id;
    const proId = metadata.pro_id;
    const fee = Number(metadata.fee || 0); // % Glossed

    // We will fill these values depending on the event type
    let stripe_payment_id = null;
    let stripe_session_id = null;
    let stripe_charge_id = null;
    let amount_gross = null;
    let currency = "eur";
    let stripe_fee = 0;

    /* ---------------------------------------------------------------------
       🔔 EVENT: checkout.session.completed
       --------------------------------------------------------------------- */
    if (event.type === "checkout.session.completed") {
      console.log("💳 Checkout session completed");

      stripe_session_id = data.id;
      stripe_payment_id = data.payment_intent;

      const intent = await stripe.paymentIntents.retrieve(stripe_payment_id);
      amount_gross = intent.amount_received / 100;
      currency = intent.currency;

      // Retrieve charges to get Stripe fees
      const charge = intent.charges.data[0];
      if (charge) {
        stripe_fee = (charge.balance_transaction?.fee || 0) / 100;
        stripe_charge_id = charge.id;
      }
    }

    /* ---------------------------------------------------------------------
       🔔 EVENT: payment_intent.succeeded
       --------------------------------------------------------------------- */
    if (event.type === "payment_intent.succeeded") {
      console.log("💰 PaymentIntent succeeded");

      stripe_payment_id = data.id;
      amount_gross = data.amount_received / 100;
      currency = data.currency;

      const charge = data.charges?.data?.[0];
      if (charge) {
        stripe_fee = (charge.balance_transaction?.fee || 0) / 100;
        stripe_charge_id = charge.id;
      }
    }

    /* ---------------------------------------------------------------------
       🔔 EVENT: charge.succeeded (in case needed)
       --------------------------------------------------------------------- */
    if (event.type === "charge.succeeded") {
      console.log("🧾 Charge succeeded");
    }

    /* ---------------------------------------------------------------------
       🧮 COMPUTATIONS (always executed)
       --------------------------------------------------------------------- */
    if (amount_gross) {
      const platform_fee = Number((amount_gross * fee).toFixed(2)); // Glossed fee
      const amount_net = Number((amount_gross - platform_fee - stripe_fee).toFixed(2));

      // === Update mission ===
      if (missionId) {
        await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);
      }

      // === Insert payment ===
      await supabase.from("payments").insert({
        mission_id: missionId,
        client_id: clientId,
        pro_id: proId,

        stripe_payment_id,
        stripe_session_id,
        stripe_charge_id,

        currency,
        amount_gross,
        stripe_fee,
        platform_fee,
        amount_net,

        status: "paid",
        paid_at: new Date().toISOString(),
      });

      console.log("💾 Payment stored:", { missionId, amount_gross });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error("❌ Webhook internal error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
