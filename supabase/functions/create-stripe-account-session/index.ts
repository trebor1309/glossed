import { stripe } from "../_shared/connect-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { data: account, error } = await admin
      .from("provider_connect_accounts")
      .select("stripe_account_id, closed")
      .eq("provider_id", authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!account?.stripe_account_id || account.closed) {
      throw new HttpError(409, "Stripe Connect onboarding has not been started");
    }

    const session = await stripe.accountSessions.create({
      account: account.stripe_account_id,
      components: {
        account_onboarding: { enabled: true },
        account_management: { enabled: true },
        notification_banner: { enabled: true },
      },
    });

    return json(req, { client_secret: session.client_secret });
  } catch (error) {
    return errorResponse(req, error);
  }
});
