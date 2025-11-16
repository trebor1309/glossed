// /supabase/functions/create-checkout-session/index.ts
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🔐 Stripe & Supabase
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 🌍 URL front (Vercel)
const BASE_URL = "https://glossed.vercel.app";

// 🔒 CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { mission_id, client_id } = body;

    if (!mission_id || !client_id) {
      return new Response(JSON.stringify({ error: "Missing mission_id or client_id" }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 1️⃣ Mission
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("id, service, description, price, client_id, pro_id")
      .eq("id", mission_id)
      .single();

    if (missionError || !mission) {
      console.error("❌ Mission error:", missionError?.message);
      throw new Error("Mission not found");
    }

    // 2️⃣ Pro
    const { data: pro, error: proError } = await supabase
      .from("users")
      .select("stripe_account_id, email, first_name, last_name")
      .eq("id", mission.pro_id)
      .single();

    if (proError || !pro) {
      console.error("❌ Pro error:", proError?.message);
      throw new Error("Pro Stripe account not found");
    }

    if (!pro.stripe_account_id) {
      throw new Error("Pro not connected to Stripe");
    }

    // 3️⃣ Montants
    const baseAmountCents = Math.round(Number(mission.price) * 100); // montant pro en cents
    const glossedFeeCents = Math.round(baseAmountCents * 0.1); // 10% pour Glossed
    const totalCents = baseAmountCents + glossedFeeCents; // payé par le client

    const feeMetadata = String(glossedFeeCents);

    // 4️⃣ Session Checkout (destination charge)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: totalCents,
            product_data: {
              name: mission.service || "Glossed booking",
              description: mission.description || undefined,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: glossedFeeCents,
        transfer_data: {
          destination: pro.stripe_account_id,
        },
        metadata: {
          mission_id: mission.id,
          client_id,
          pro_id: mission.pro_id,
          fee_cents: feeMetadata,
        },
      },
      metadata: {
        mission_id: mission.id,
        client_id,
        pro_id: mission.pro_id,
        fee_cents: feeMetadata,
      },
      success_url: `${BASE_URL}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${BASE_URL}/dashboard/payment/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("❌ Stripe checkout error:", err?.message || err);
    return new Response(JSON.stringify({ error: err?.message || "Unknown error" }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
