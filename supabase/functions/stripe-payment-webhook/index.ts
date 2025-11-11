// /supabase/functions/stripe-payment-webhook-v2/index.ts
// ✅ Version corrigée : utilise constructEventAsync (compatible Deno)
// ✅ Met à jour les missions après paiement réussi

import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🔐 Initialisation
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

// ------------------------------------------------------
// 🚀 Serveur principal (Deno.serve = point d’entrée Edge Function)
// ------------------------------------------------------
Deno.serve(async (req) => {
  // --- CORS preflight ---
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers":
          "Content-Type, Authorization, Stripe-Signature",
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

    // ✅ Correction majeure : version asynchrone (obligatoire en Deno)
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      sig!,
      webhookSecret!
    );

    console.log("🔔 Webhook reçu :", event.type);
  } catch (err) {
    console.error("❌ Signature verification failed:", err.message);
    return new Response(
      JSON.stringify({ error: `Webhook Error: ${err.message}` }),
      {
        status: 400,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const missionId = session.metadata?.mission_id;
        const clientId = session.metadata?.client_id;
        const proId = session.metadata?.pro_id;

        console.log("💳 Paiement réussi pour mission:", missionId);

        if (!missionId) {
          console.warn("⚠️ Aucun mission_id dans metadata");
          break;
        }

        // ✅ Met à jour la mission en base de données
        const { error } = await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);

        if (error) {
          console.error("❌ Erreur lors de la mise à jour de la mission:", error.message);
        } else {
          console.log(`💾 Mission ${missionId} marquée comme confirmée ✅`);
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const intent = event.data.object;
        console.warn(`❌ Paiement échoué pour ${intent.id}`);
        break;
      }

      default:
        console.log(`ℹ️ Événement ignoré : ${event.type}`);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("❌ Erreur interne webhook:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
