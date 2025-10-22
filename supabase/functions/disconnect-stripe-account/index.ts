// ✅ version compatible Deno pour Supabase Edge Functions
import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialiser Stripe et Supabase
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2023-10-16",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  try {
    const { user_id } = await req.json();
    if (!user_id) return new Response("Missing user_id", { status: 400 });

    // 🔹 Récupérer le compte Stripe associé
    const { data: user } = await supabase
      .from("users")
      .select("stripe_account_id")
      .eq("id", user_id)
      .single();

    if (user?.stripe_account_id) {
      try {
        // (Optionnel) marquer le compte comme déconnecté côté Stripe
        await stripe.accounts.update(user.stripe_account_id, {
          metadata: { disconnected_at: new Date().toISOString() },
        });
      } catch (err) {
        console.warn("⚠️ Unable to update Stripe account:", err.message);
      }
    }

    // 🔹 Supprimer les champs Stripe côté Supabase
    await supabase
      .from("users")
      .update({
        stripe_account_id: null,
        stripe_account_ready: false,
        payouts_enabled: false,
      })
      .eq("id", user_id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("❌ Disconnect error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});
