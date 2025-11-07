// /supabase/functions/check-stripe-account/index.ts
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  // ✅ Gérer le preflight CORS (OPTIONS)
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
    const { user_id } = await req.json();
    if (!user_id) throw new Error("Missing user_id");

    // Récupère l'utilisateur pour avoir son stripe_account_id
    const { data: user, error } = await supabase
      .from("users")
      .select("stripe_account_id")
      .eq("id", user_id)
      .maybeSingle();

    if (error) throw error;
    if (!user?.stripe_account_id) {
      return new Response(JSON.stringify({ connected: false, reason: "no_account_id" }), {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Vérifie le statut du compte Stripe
    const account = await stripe.accounts.retrieve(user.stripe_account_id);

    return new Response(
      JSON.stringify({
        connected: true,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      }),
      {
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  } catch (err) {
    console.error("❌ Stripe check error:", err);
    return new Response(JSON.stringify({ connected: false, error: err.message }), {
      status: 400,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
});
