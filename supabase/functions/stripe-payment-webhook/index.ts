// /supabase/functions/stripe-payment-webhook/index.ts
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Stripe-Signature",
      },
    });
  }

  const sig = req.headers.get("stripe-signature");
  let event;

  try {
    const rawBody = await req.text();
    event = JSON.parse(rawBody);
    console.log("🧪 Mode test sans vérification de signature:", event.type);
  } catch (err) {
    console.error("❌ Erreur parsing:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const type = event.type;
    const data = event.data.object;
    const metadata =
      data.metadata ||
      data.session?.metadata ||
      data.payment_intent?.metadata ||
      data.object?.payment_intent?.metadata ||
      {};

    const missionId = metadata.mission_id;
    const clientId = metadata.client_id;
    const proId = metadata.pro_id;
    const fee = metadata.fee || 0;

    switch (type) {
      case "payment_intent.succeeded":
      case "checkout.session.completed": {
        console.log("💳 Paiement confirmé pour mission:", missionId);

        if (!missionId) {
          console.warn("⚠️ Aucun mission_id fourni dans metadata");
          break;
        }

        // ✅ Mise à jour de la mission
        const { error } = await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);

        if (error) {
          console.error("❌ Erreur mise à jour mission:", error.message);
        } else {
          console.log(`✅ Mission ${missionId} marquée comme confirmée`);
        }

        // ✅ Enregistrer le paiement
        const { error: paymentError } = await supabase.from("payments").insert({
          mission_id: missionId,
          client_id: clientId,
          pro_id: proId,
          stripe_payment_id: data.payment_intent || data.id,
          stripe_session_id: data.id,
          amount: data.amount_total || data.amount || 0,
          currency: data.currency || "eur",
          application_fee: fee,
          status: "succeeded",
        });

        if (paymentError) {
          console.error("❌ Erreur insertion paiement:", paymentError.message);
        } else {
          console.log(`💰 Paiement enregistré pour mission ${missionId}`);
        }

        break;
      }

      case "payment_intent.payment_failed": {
        console.warn(`❌ Paiement échoué : ${data.id}`);
        break;
      }

      default:
        console.log(`ℹ️ Événement ignoré : ${type}`);
    }

    return new Response(JSON.stringify({ success: true, event: type }), {
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
