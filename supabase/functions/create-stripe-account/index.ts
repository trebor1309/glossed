import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });
const appUrl = (Deno.env.get("APP_URL") ?? "https://glossed.vercel.app").replace(/\/$/, "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { data: profile, error } = await admin
      .from("users")
      .select("role, stripe_account_id")
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new HttpError(404, "Profile not found");
    if (profile.role !== "pro") throw new HttpError(403, "A professional profile is required");

    let accountId = profile.stripe_account_id;
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        country: "BE",
        email: authUser.email,
        capabilities: { transfers: { requested: true } },
        metadata: { supabase_user_id: authUser.id },
      });
      accountId = account.id;

      const { error: updateError } = await admin
        .from("users")
        .update({ stripe_account_id: accountId })
        .eq("id", authUser.id);
      if (updateError) throw updateError;
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${appUrl}/prodashboard/stripe/refresh`,
      return_url: `${appUrl}/prodashboard/stripe/success`,
      type: "account_onboarding",
    });

    return json(req, { url: accountLink.url });
  } catch (error) {
    return errorResponse(req, error);
  }
});
