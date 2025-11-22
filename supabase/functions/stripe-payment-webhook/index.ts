// /supabase/functions/stripe-payment-webhook/index.ts
// Webhook Stripe centralisé : met à jour les missions + enregistre les paiements

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ IMPORTANT : client Supabase avec service role (bypass RLS)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  {
    global: {
      headers: {
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    },
  }
);

// Initialisation Stripe
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

// CORS headers
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  console.log("📥 Webhook Stripe reçu");

  // ------------------------
  // 1) Lire event brut
  // ------------------------
  let event: any;
  try {
    const raw = await req.text();
    event = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: cors,
    });
  }

  const type = event.type;
  const data = event.data?.object ?? {};

  // ------------------------
  // 2) Extraire les metadata
  // ------------------------
  const meta = data.metadata || data.session?.metadata || data.payment_intent?.metadata || {};

  const missionId = meta.mission_id;
  const clientId = meta.client_id;
  const proId = meta.pro_id;

  const feeCents = meta.fee_cents ? Number(meta.fee_cents) : 0;

  if (!missionId) {
    console.warn("⚠️ Aucun mission_id -> on ignore");
    return new Response(JSON.stringify({ skipped: true }), {
      status: 200,
      headers: cors,
    });
  }

  try {
    if (type !== "checkout.session.completed" && type !== "payment_intent.succeeded") {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: cors,
      });
    }

    console.log(`💳 Paiement confirmé pour mission ${missionId}`);

    // ------------------------
    // 3) Montants Stripe
    // ------------------------
    const amountTotalCents =
      typeof data.amount_total === "number"
        ? data.amount_total
        : typeof data.amount === "number"
          ? data.amount
          : 0;

    const amountGross = amountTotalCents / 100;
    const applicationFee = feeCents / 100;
    const amountNet = amountGross - applicationFee;

    // ------------------------
    // 4) On récupère la mission
    // ------------------------
    const { data: mission, error: missionFetchError } = await supabase
      .from("missions")
      .select("service_price, travel_fee, total_price")
      .eq("id", missionId)
      .single();

    if (missionFetchError || !mission) {
      console.error("❌ Erreur fetching mission:", missionFetchError?.message);
    }

    const proServicePrice = mission?.service_price ?? null;
    const travelFee = mission?.travel_fee ?? null;
    const proTotalPrice = mission?.total_price ?? null;

    // ------------------------
    // 5) Mise à jour mission
    // ------------------------
    await supabase
      .from("missions")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", missionId);

    console.log(`✅ Mission ${missionId} confirmée`);

    // ------------------------
    // 6) Insertion du paiement
    // ------------------------
    const stripePaymentId = data.payment_intent ?? data.id;
    const stripeSessionId =
      type === "checkout.session.completed" ? data.id : (meta.session_id ?? null);

    const { error: paymentError } = await supabase.from("payments").insert({
      mission_id: missionId,
      client_id: clientId,
      pro_id: proId,

      amount: amountTotalCents,
      currency: data.currency ?? "eur",

      application_fee: applicationFee,
      amount_net: amountNet,

      // 🔥 Champs propres
      travel_fee: travelFee,
      pro_service_price: proServicePrice,
      pro_total_price: proTotalPrice,

      stripe_payment_id: stripePaymentId,
      stripe_session_id: stripeSessionId,

      status: "paid",
      paid_at: new Date().toISOString(),
    });

    if (paymentError) {
      console.error("❌ Erreur insertion paiement:", paymentError.message);
    } else {
      console.log(`💰 Paiement enregistré pour mission ${missionId}`);
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: cors,
    });
  } catch (e: any) {
    console.error("❌ Webhook error:", e?.message || e);
    return new Response(JSON.stringify({ error: e?.message }), {
      status: 500,
      headers: cors,
    });
  }
});

