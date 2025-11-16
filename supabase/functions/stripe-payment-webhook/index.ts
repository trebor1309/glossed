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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let event: any;
  try {
    const raw = await req.text();
    event = JSON.parse(raw);
  } catch (err: any) {
    console.error("❌ Webhook JSON parse error:", err?.message);
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const type = event.type;
  const data = event.data?.object || {};

  try {
    switch (type) {
      case "checkout.session.completed": {
        console.log("💳 checkout.session.completed:", data.id);

        const metadata = data.metadata || {};
        const missionId = metadata.mission_id;
        const clientId = metadata.client_id || null;
        const proId = metadata.pro_id || null;
        const feeCents = Number(metadata.fee_cents ?? metadata.fee ?? 0);

        if (!missionId) {
          console.warn("⚠ Missing mission_id in metadata");
          break;
        }

        const grossCents = typeof data.amount_total === "number" ? data.amount_total : 0;
        const gross = grossCents / 100;
        const applicationFee = feeCents / 100;
        const net = gross - applicationFee;

        console.log(
          `💰 Payment received for mission ${missionId}: gross=${gross}, fee=${applicationFee}, net=${net}`
        );

        // 1️⃣ Mission → confirmed
        const { error: missionError } = await supabase
          .from("missions")
          .update({
            status: "confirmed",
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", missionId);

        if (missionError) {
          console.error("❌ Mission update error:", missionError.message);
        }

        // 2️⃣ Enregistrer le paiement (UNE seule ligne)
        const paymentRow = {
          mission_id: missionId,
          client_id: clientId,
          pro_id: proId,
          amount: net, // net pour le pro
          amount_gross: gross, // total client
          amount_net: net,
          platform_fee: applicationFee,
          application_fee: applicationFee,
          currency: data.currency ?? "eur",
          stripe_session_id: data.id,
          stripe_payment_id: data.payment_intent ?? null,
          status: "paid",
          paid_at: new Date().toISOString(),
        };

        const { error: paymentError } = await supabase.from("payments").insert(paymentRow);

        if (paymentError) {
          console.error("❌ Payment insert error:", paymentError.message);
        } else {
          console.log("✅ Payment row inserted for mission", missionId);
        }

        break;
      }

      case "payment_intent.payment_failed": {
        const metadata = data.metadata || {};
        console.warn("❌ Payment failed:", data.id, "for mission:", metadata.mission_id);
        // Ici tu pourrais mettre à jour un éventuel paiement "pending" en "failed"
        break;
      }

      default:
        console.log("ℹ️ Webhook event ignored:", type);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error("❌ Webhook internal error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
