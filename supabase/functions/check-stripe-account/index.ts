import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// ✅ Autoriser les requêtes cross-origin (pour ton front local et Vercel)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  // Réponse au preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    if (!user_id) {
      return new Response("Missing user_id", {
        status: 400,
        headers: corsHeaders,
      });
    }

    // 🔹 Récupère le Stripe account_id du pro dans Supabase
    const { data: user } = await supabase
      .from("users")
      .select("stripe_account_id")
      .eq("id", user_id)
      .single();

    if (!user?.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔹 Interroge Stripe
    const account = await stripe.accounts.retrieve(user.stripe_account_id);

    // 🔹 Mets à jour Supabase
    await supabase
      .from("users")
      .update({
        payouts_enabled: account.payouts_enabled,
        stripe_account_ready: account.details_submitted,
      })
      .eq("id", user_id);

    // 🔹 Retourne l’état au front
    return new Response(
      JSON.stringify({
        connected: true,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
        charges_enabled: account.charges_enabled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stripe check error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
