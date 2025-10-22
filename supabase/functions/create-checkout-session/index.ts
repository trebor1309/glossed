// ✅ Compatible Deno + Supabase + Stripe Connect
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 🧠 Initialisation Stripe et Supabase
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// 🌍 URLs (prod = vercel)
const BASE_URL = "https://glossed.vercel.app"; // ✅ ton URL Vercel

// 🔒 Headers CORS
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 🚀 Fonction principale
Deno.serve(async (req) => {
  // ⚙️ Preflight (OPTIONS)
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

    // 🔹 Récupérer la mission et le pro
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .select("id, service, description, price, client_total, client_id, pro_id")
      .eq("id", mission_id)
      .single();

    if (missionError || !mission) {
      throw new Error("Mission not found");
    }

    // 🔹 Récupérer l’account Stripe du pro
    const { data: pro } = await supabase
      .from("users")
      .select("stripe_account_id, email, first_name, last_name")
      .eq("id", mission.pro_id)
      .single();

    if (!pro?.stripe_account_id) {
      throw new Error("Pro not connected to Stripe");
    }

    // 💸 Calcul frais Glossed (10 %)
    const baseAmount = Math.round(Number(mission.price) * 100); // cents
    const glossedFee = Math.round(baseAmount * 0.1); // 10 %

    // 🧾 Création de la session Checkout
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ["card"],
        mode: "payment",
        customer_email: undefined, // on peut remplir plus tard
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: baseAmount + glossedFee,
              product_data: {
                name: `${mission.service}`,
                description: mission.description || "Service Glossed",
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: glossedFee, // 💰 la commission Glossed
          transfer_data: {
            destination: pro.stripe_account_id, // 💼 paiement direct au pro
          },
        },
        metadata: {
          mission_id: mission.id,
          pro_id: mission.pro_id,
          client_id,
        },
        success_url: `${BASE_URL}/dashboard/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${BASE_URL}/dashboard/payment/cancel`,
      },
      {
        stripeAccount: pro.stripe_account_id, // pour Stripe Connect
      }
    );

    // 🧠 Enregistre le paiement côté Supabase (facultatif mais utile)
    await supabase.from("payments").insert([
      {
        id: crypto.randomUUID(),
        mission_id: mission.id,
        client_id,
        pro_id: mission.pro_id,
        amount: (baseAmount + glossedFee) / 100,
        platform_fee: glossedFee / 100,
        status: "pending",
        stripe_session_id: session.id,
      },
    ]);

    // ✅ Retourne l’URL de redirection Stripe
    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Stripe checkout error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
