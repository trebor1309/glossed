import Stripe from "stripe";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
  apiVersion: "2023-10-16",
});
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // ⚠️ important: clé SERVICE
);

Deno.serve(async (req) => {
  try {
    const { user_id, email } = await req.json();
    if (!user_id || !email) return new Response("Missing parameters", { status: 400 });

    // 🔹 1. Créer un compte Express Stripe
    const account = await stripe.accounts.create({
      type: "express",
      email,
      capabilities: {
        transfers: { requested: true },
      },
      business_type: "individual",
    });

    // 🔹 2. Générer le lien d’onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://glossed.be/dashboard/stripe/refresh",
      return_url: "https://glossed.be/dashboard/stripe/success",
      type: "account_onboarding",
    });

    // 🔹 3. Sauvegarder le Stripe ID dans Supabase
    await supabase.from("users").update({ stripe_account_id: account.id }).eq("id", user_id);

    // 🔹 4. Retourner l’URL d’onboarding
    return new Response(
      JSON.stringify({
        url: accountLink.url,
        account_id: account.id,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Stripe error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});
