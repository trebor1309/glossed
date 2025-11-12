// /supabase/functions/create-payment-intent/index.ts
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const BASE_URL = "https://glossed.vercel.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  try {
    const { mission_id, client_id } = await req.json();
    if (!mission_id || !client_id) throw new Error("Missing mission_id or client_id");

    // 1️⃣ Charger la mission
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("id, pro_id, client_id, price, service, description")
      .eq("id", mission_id)
      .maybeSingle();

    if (missionError || !mission) throw new Error("Mission not found in Supabase");

    // 2️⃣ Charger le pro
    const { data: pro, error: proError } = await supabase
      .from("users")
      .select("id, stripe_account_id, email")
      .eq("id", mission.pro_id)
      .maybeSingle();

    if (proError || !pro) throw new Error("Pro Stripe account not found");

    // 3️⃣ Calculs
    const baseAmount = Math.round(Number(mission.price) * 100); // montant pro (ex: 33€)
    const fee = Math.round(baseAmount * 0.1); // 10%
    const totalAmount = baseAmount + fee; // ce que paie le client (ex: 36,30€)

    console.log(
      `💳 Creating checkout for mission ${mission.id}: client pays ${totalAmount}, pro gets ${baseAmount}, fee ${fee}`
    );

    // 4️⃣ Créer la session Stripe
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      expand: ["payment_intent"],
      payment_intent_data: {
        metadata: {
          mission_id: mission.id,
          pro_id: mission.pro_id,
          client_id,
          fee: fee.toString(),
        },
      },
      metadata: {
        mission_id: mission.id,
        pro_id: mission.pro_id,
        client_id,
        fee: fee.toString(),
      },
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: mission.service || "Service booking",
              ...(mission.description ? { description: mission.description } : {}),
            },
            unit_amount: totalAmount, // 💰 le client paie tout (pro + frais)
          },
          quantity: 1,
        },
      ],
      success_url: `${BASE_URL}/dashboard/payment/success`,
      cancel_url: `${BASE_URL}/dashboard/payment/cancel`,
    });

    console.log("✅ Checkout session created:", session.id);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  } catch (err) {
    console.error("❌ Payment error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
