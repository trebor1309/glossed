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

// ---------------------------------------------------------------
// 🧠 Function: create-payment-intent
// ---------------------------------------------------------------
Deno.serve(async (req) => {
  // ✅ Autoriser les requêtes CORS
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

    // 1️⃣ Charger la mission depuis Supabase
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("id, pro_id, client_id, price, service, description")
      .eq("id", mission_id)
      .maybeSingle();

    if (missionError || !mission) throw new Error("Mission not found in Supabase");

    // 2️⃣ Charger le pro et son compte Stripe
    const { data: pro, error: proError } = await supabase
      .from("users")
      .select("id, stripe_account_id, email")
      .eq("id", mission.pro_id)
      .maybeSingle();

    if (proError || !pro?.stripe_account_id) throw new Error("Pro Stripe account not found");

    // 3️⃣ Créer le PaymentIntent + session Checkout
    const amount = Math.round(Number(mission.price) * 100); // € → centimes
    const fee = Math.round(amount * 0.1); // 💸 10 % de commission

    console.log("💳 Creating payment session for mission:", mission.id, "→ pro:", pro.id);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      payment_intent_data: {
        transfer_data: {
          destination: pro.stripe_account_id,
        },
        application_fee_amount: fee,
      },
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: mission.service || "Service booking",
              description: mission.description || "",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      // ✅ C'est ICI que la metadata doit être ajoutée
      metadata: {
        mission_id: mission.id,
        pro_id: mission.pro_id,
        client_id,
      },
      success_url: `${BASE_URL}/dashboard/payment/success`,
      cancel_url: `${BASE_URL}/dashboard/payment/cancel`,
    });

    // 4️⃣ Retourner l’URL vers Stripe Checkout
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
