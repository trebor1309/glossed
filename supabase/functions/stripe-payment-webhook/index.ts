// 🔥 Disable JWT requirement for Stripe webhook
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ⚠️ IMPORTANT : crée un client sans validation JWT
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, // service role = bypass all RLS
  {
    global: {
      headers: {
        // 👇 Force bypass auth checks
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
    },
  }
);

// Stripe client
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

// CORS headers
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  // Stripe does NOT sign with JWT, so skip all auth checks
  console.log("📥 Webhook received");

  const raw = await req.text();
  let event;

  try {
    event = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: cors,
    });
  }

  const data = event.data?.object ?? {};
  const meta = data.metadata || data.session?.metadata || data.payment_intent?.metadata || {};

  const missionId = meta.mission_id;
  const proId = meta.pro_id;
  const clientId = meta.client_id;

  if (!missionId) {
    console.log("⚠️ No mission_id -> ignored");
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: cors,
    });
  }

  try {
    // ❗ Filter ONLY the event we want
    if (event.type !== "checkout.session.completed") {
      console.log("⏭️ Ignoring event:", event.type);
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: cors,
      });
    }

    // Stripe amounts
    const gross = (data.amount_total ?? data.amount ?? 0) / 100;
    const applicationFee = meta.fee_cents ? Number(meta.fee_cents) / 100 : 0;
    const net = gross - applicationFee;

    // ---- UPDATE MISSION ----
    await supabase
      .from("missions")
      .update({
        status: "confirmed",
        paid_at: new Date().toISOString(),
      })
      .eq("id", missionId);

    // ---- INSERT PAYMENT ----
    await supabase.from("payments").insert({
      mission_id: missionId,
      client_id: clientId,
      pro_id: proId,
      amount: net,
      amount_gross: gross,
      amount_net: net,
      application_fee: applicationFee,
      currency: data.currency ?? "eur",
      stripe_payment_id: data.payment_intent ?? data.id,
      stripe_session_id: data.id,
      status: "paid",
      paid_at: new Date().toISOString(),
    });

    console.log("✅ Mission updated + payment inserted");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: cors,
    });
  } catch (err) {
    console.error("❌ Webhook error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: cors,
    });
  }
});
