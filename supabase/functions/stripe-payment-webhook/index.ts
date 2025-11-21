// /supabase/functions/stripe-payment-webhook/index.ts
// Webhook Stripe centralisé : met à jour les missions + enregistre les paiements

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ IMPORTANT : client Supabase avec service role (bypass RLS pour le webhook)
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role = bypass all RLS
  {
    global: {
      headers: {
        // 👇 Force bypass auth checks côté Supabase
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    },
  }
);

// Stripe client (actuellement seulement pour le typage / évolutions futures)
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

// CORS headers
const cors: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  // Préflight navigateur
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  console.log("📥 Webhook Stripe reçu");

  // ------------------------
  // 1) Récupérer l'event brut
  // ------------------------
  let event: any;

  try {
    const raw = await req.text();
    event = JSON.parse(raw);
  } catch (err: any) {
    console.error("❌ JSON invalide dans le webhook:", err?.message || err);
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: cors,
    });
  }

  const type = event.type;
  const data: any = event.data?.object ?? {};

  // ------------------------
  // 2) Récupération robuste des metadata
  // ------------------------
  const meta =
    data.metadata ||
    data.session?.metadata ||
    data.payment_intent?.metadata ||
    data.object?.payment_intent?.metadata ||
    {};

  const missionId: string | undefined = meta.mission_id;
  const clientId: string | undefined = meta.client_id;
  const proId: string | undefined = meta.pro_id;
  const feeCents: number = meta.fee_cents ? Number(meta.fee_cents) : 0;

  if (!missionId) {
    console.warn("⚠️ Aucun mission_id dans les metadata, on ignore l'event");
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: cors,
    });
  }

  try {
    // ----------------------------------------------------
    // 3) On ne traite que les events de succès de paiement
    // ----------------------------------------------------
    if (type !== "checkout.session.completed" && type !== "payment_intent.succeeded") {
      console.log("⏭️ Event ignoré:", type);
      return new Response(JSON.stringify({ skipped: true, event: type }), {
        status: 200,
        headers: cors,
      });
    }

    console.log("💳 Paiement confirmé pour mission:", missionId, "type:", type);

    // Montants Stripe (en cents)
    const amountTotalCents: number =
      typeof data.amount_total === "number"
        ? data.amount_total
        : typeof data.amount === "number"
          ? data.amount
          : 0;

    const gross = amountTotalCents / 100; // montant total en €
    const applicationFee = feeCents / 100; // frais Glossed en €
    const net = gross - applicationFee; // ce qui revient au pro en €

    // ---------------------------------------
    // 4) Mise à jour de la mission -> confirmed
    // ---------------------------------------
    const { error: missionError } = await supabase
      .from("missions")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(), // comme dans l'ancienne version
      })
      .eq("id", missionId);

    if (missionError) {
      console.error("❌ Erreur mise à jour mission:", missionError.message);
    } else {
      console.log(`✅ Mission ${missionId} marquée comme confirmée`);
    }

    // ---------------------------------------
    // 5) Enregistrer le paiement
    //    - compat avec l'ancien schéma:
    //      * amount = montant brut en cents (comme avant)
    //      * status = "succeeded"
    //    - + nouveaux champs net/gross en €
    // ---------------------------------------
    const stripePaymentId = data.payment_intent ?? data.id;
    const stripeSessionId =
      type === "checkout.session.completed" ? data.id : (meta.session_id ?? null);

    const { error: paymentError } = await supabase.from("payments").insert({
      mission_id: missionId,
      client_id: clientId ?? null,
      pro_id: proId ?? null,
      // compat avec l'ancien code : montant en cents
      amount: amountTotalCents,
      currency: data.currency ?? "eur",
      application_fee: applicationFee,
      // nouveaux champs pratiques en €
      amount_gross: gross,
      amount_net: net,
      stripe_payment_id: stripePaymentId,
      stripe_session_id: stripeSessionId,
      status: "paid" ,
      paid_at: new Date().toISOString(),
    });

    if (paymentError) {
      console.error("❌ Erreur insertion paiement:", paymentError.message);
    } else {
      console.log(`💰 Paiement enregistré pour mission ${missionId}`);
    }

    return new Response(JSON.stringify({ ok: true, event: type }), {
      status: 200,
      headers: cors,
    });
  } catch (err: any) {
    console.error("❌ Webhook error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "internal error" }), {
      status: 500,
      headers: cors,
    });
  }
});
