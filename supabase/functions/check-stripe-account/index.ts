import {
  retrieveConnectAccount,
  syncConnectAccount,
} from "../_shared/connect-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

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

    const account = await retrieveConnectAccount(profile.stripe_account_id);
    await syncConnectAccount(account, {
      id: `account-check:${account.id}:${crypto.randomUUID()}`,
      type: "v2.core.account.polled",
      createdAt: new Date(),
      livemode: Boolean(account.livemode),
      source: "account_check",
    });

    const { data: connect, error: connectError } = await admin
      .from("provider_connect_accounts")
      .select("closed, stripe_transfers_status, payouts_status, requirements, future_requirements")
      .eq("provider_id", authUser.id)
      .single();
    if (connectError) throw connectError;

    const connected = !connect.closed;

    return json(req, {
      connected,
      transfers_status: connect.stripe_transfers_status,
      payouts_status: connect.payouts_status,
      ready: connected && connect.stripe_transfers_status === "active",
      requirements: connect.requirements,
      future_requirements: connect.future_requirements,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
