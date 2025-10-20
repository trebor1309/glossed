import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.22.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY"), {
  apiVersion: "2024-06-20",
});

serve(async (req) => {
  // ✅ Gestion CORS
  const headers = {
    "Access-Control-Allow-Origin": "*", // ← autorise toutes les origines (ou restreins à ton domaine)
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

  // ✅ Réponse immédiate aux requêtes OPTIONS (pré-vol CORS)
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers });
  }

  try {
    const { user_id, email } = await req.json();

    const account = await stripe.accounts.create({
      type: "express",
      country: "BE",
      email,
      capabilities: { transfers: { requested: true } },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://glossed.vercel.app/dashboard/settings/legal",
      return_url: "https://glossed.vercel.app/dashboard/settings/legal",
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url, account_id: account.id }), {
      headers,
      status: 200,
    });
  } catch (error) {
    console.error("Stripe Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers,
      status: 400,
    });
  }
});
