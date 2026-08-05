import Stripe from "https://esm.sh/stripe@16.5.0?target=deno";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2023-10-16" });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { data: profile, error } = await admin
      .from("users")
      .select("stripe_account_id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile) throw new HttpError(404, "Profile not found");
    if (!profile.stripe_account_id) return json(req, { connected: false, reason: "no_account_id" });

    const account = await stripe.accounts.retrieve(profile.stripe_account_id);
    const connected = !account.deleted;
    const payoutsEnabled = connected && account.payouts_enabled;
    const detailsSubmitted = connected && account.details_submitted;

    const { error: updateError } = await admin
      .from("users")
      .update({ stripe_account_ready: detailsSubmitted, payouts_enabled: payoutsEnabled })
      .eq("id", authUser.id);
    if (updateError) throw updateError;

    return json(req, {
      connected,
      payouts_enabled: payoutsEnabled,
      details_submitted: detailsSubmitted,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
