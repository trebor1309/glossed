import {
  confirmAndDispatchInstantPayoutV2,
  quoteInstantPayoutV2,
  refreshProviderBalanceV2,
} from "../_shared/provider-payouts-v2.ts";
import { stripe } from "../_shared/connect-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

async function featureEnabled() {
  const { data, error } = await admin
    .from("financial_feature_flags")
    .select("enabled")
    .eq("flag_code", "provider_payouts_v2")
    .single();
  if (error) throw error;
  return Boolean(data.enabled);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json().catch(() => ({}));
    const action = body && typeof body === "object" && "action" in body ? body.action : "refresh";
    if (!(await featureEnabled())) {
      return json(req, { enabled: false, reason: "feature_disabled" });
    }

    if (action === "refresh") {
      await refreshProviderBalanceV2(user.id);
      const authorization = req.headers.get("authorization") ?? "";
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authorization } },
        auth: { autoRefreshToken: false, persistSession: false },
      });
      const { data, error } = await client.rpc("get_my_provider_gains_v2");
      if (error) throw error;
      return json(req, data);
    }
    if (action === "quote_instant") {
      return json(req, { enabled: true, quote: await quoteInstantPayoutV2(user.id) });
    }
    if (action === "confirm_instant") {
      const payoutId = typeof body.payout_id === "string" ? body.payout_id : "";
      if (!payoutId) throw new HttpError(400, "payout_id is required");
      return json(req, {
        enabled: true,
        payout: await confirmAndDispatchInstantPayoutV2(user.id, payoutId),
      });
    }
    if (action === "express_dashboard") {
      const { data: account, error } = await admin
        .from("provider_connect_accounts")
        .select("stripe_account_id, dashboard, closed, connection_enabled")
        .eq("provider_id", user.id)
        .single();
      if (error) throw error;
      if (!account.stripe_account_id || account.dashboard !== "express" || account.closed || !account.connection_enabled) {
        throw new HttpError(409, "Express Dashboard is unavailable");
      }
      const link = await stripe.accounts.createLoginLink(account.stripe_account_id);
      return json(req, { enabled: true, url: link.url });
    }
    throw new HttpError(400, "Unsupported payout action");
  } catch (error) {
    return errorResponse(req, error);
  }
});
