// /supabase/functions/refund-mission/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Stripe client
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

// Supabase (service role, comme dans le webhook)
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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();
    const missionId = body?.mission_id as string | undefined;
    const mode = body?.mode as string | undefined; // "pro_cancel" | "client_cancel_approved"

    if (!missionId || !mode) {
      throw new Error("Missing mission_id or mode");
    }

    if (!["pro_cancel", "client_cancel_approved"].includes(mode)) {
      throw new Error("Invalid mode");
    }

    // 1️⃣ Récupérer la mission
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("id, status, client_id, pro_id")
      .eq("id", missionId)
      .single();

    if (missionError || !mission) {
      console.error("❌ Mission error:", missionError);
      throw new Error("Mission not found");
    }

    if (!["confirmed", "cancel_requested"].includes(mission.status)) {
      throw new Error(`Mission is not refundable from current status: ${mission.status}`);
    }

    // 2️⃣ Récupérer le paiement lié (le plus récent, status='paid')
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status, amount, amount_net, application_fee, stripe_payment_id")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error("❌ Payment fetch error:", paymentError);
      throw new Error("Could not fetch payment");
    }

    if (!payment) {
      throw new Error("No payment found for this mission");
    }

    if (payment.status !== "paid") {
      throw new Error(`Payment is not refundable (status = ${payment.status})`);
    }

    const stripePaymentId = payment.stripe_payment_id as string | null;
    if (!stripePaymentId) {
      throw new Error("Missing Stripe payment id");
    }

    // ⚠️ Dans ton webhook actuel :
    // - amount = montant total en CENTS (data.amount_total)
    // - amount_net = montant net pro en EUROS
    // - application_fee = frais plateforme en EUROS
    const amountTotalCents = Number(payment.amount ?? 0);
    const amountNetEuros = Number(payment.amount_net ?? 0); // net pour le pro, en €
    const applicationFeeEuros = Number(payment.application_fee ?? 0); // en €

    const netCents = Math.round(amountNetEuros * 100);

    console.log("💶 refund-mission debug:", {
      mode,
      missionId,
      amountTotalCents,
      amountNetEuros,
      applicationFeeEuros,
      netCents,
    });

    // 3️⃣ Créer le refund Stripe
    let refund;
    if (mode === "pro_cancel") {
      // 👉 Cas A : annulation initiée côté pro -> remboursement TOTAL
      // On rembourse TOUT, on reverse aussi le transfert et les frais d'application.
      refund = await stripe.refunds.create({
        payment_intent: stripePaymentId,
        // full refund (pas de amount -> 100%)
        refund_application_fee: true,
        reverse_transfer: true,
      });
    } else {
      // 👉 Cas B : annulation demandée par le client et APPROUVÉE par le pro
      // On rembourse uniquement la part pro (net), on garde les frais Glossed.
      refund = await stripe.refunds.create({
        payment_intent: stripePaymentId,
        amount: netCents, // uniquement le net pro
        reverse_transfer: true,
        refund_application_fee: false, // on garde l'application_fee
      });
    }

    const newPaymentStatus = mode === "pro_cancel" ? "refunded" : "partially_refunded";

    const now = new Date().toISOString();

    // 4️⃣ Mettre à jour le paiement
    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({
        status: newPaymentStatus,
        refunded_at: now,
      })
      .eq("id", payment.id);

    if (updatePaymentError) {
      console.error("❌ Error updating payment after refund:", updatePaymentError);
    }

    // 5️⃣ Mettre à jour la mission
    const { error: updateMissionError } = await supabase
      .from("missions")
      .update({
        status: "cancelled",
      })
      .eq("id", missionId);

    if (updateMissionError) {
      console.error("❌ Error updating mission after refund:", updateMissionError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        mode,
        payment_status: newPaymentStatus,
        stripe_refund_id: refund.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("❌ refund-mission error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
