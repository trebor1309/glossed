// /supabase/functions/stripe-payment-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ✅ Initialisation
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ✅ Récupération de la clé de signature du webhook Stripe
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// ⚙️ Helper pour les logs
const log = (...args: any[]) => console.log("[stripe-webhook]", ...args);

Deno.serve(async (req) => {
  // --- Gérer le preflight CORS ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const sig = req.headers.get("stripe-signature");
  let event;

  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, sig!, webhookSecret!);
  } catch (err) {
    log("❌ Signature verification failed:", err.message);
    return new Response(JSON.stringify({ error: `Webhook Error: ${err.message}` }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as any;
        const missionId = session.metadata?.mission_id;
        const clientId = session.metadata?.client_id;
        const proId = session.metadata?.pro_id;

        if (!missionId) {
          log("⚠️ No mission_id in metadata");
          break;
        }

        log(`✅ Payment completed for mission ${missionId}`);

        // Mettre à jour la mission
        const { error } = await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);

        if (error) {
          log("❌ Supabase update error:", error.message);
        } else {
          log(`💾 Mission ${missionId} marked as confirmed`);
        }

        // (Facultatif) notifier le pro ou le client ici plus tard
        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object as any;
        log(`❌ Payment failed for ${intent.id}`);
        break;
      }

      default:
        log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    log("❌ Webhook processing error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
