import {
  dispatchProviderPayoutV2,
  reserveAndDispatchStandardPayoutV2,
} from "../_shared/provider-payouts-v2.ts";
import { errorResponse, json } from "../_shared/http.ts";
import { requireServiceRole } from "../_shared/service_role.ts";
import { admin } from "../_shared/supabase.ts";

function messageFor(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = String(error.message ?? "").trim();
    if (message) return message;
  }
  return fallback;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }
  try {
    requireServiceRole(req);
    const { data: flag, error: flagError } = await admin
      .from("financial_feature_flags")
      .select("enabled")
      .eq("flag_code", "provider_payouts_v2")
      .single();
    if (flagError) throw flagError;
    if (!flag.enabled) {
      return json(req, { skipped: true, reason: "feature_disabled" });
    }
    const body = await req.json().catch(() => ({}));
    const requested = Number(body?.limit);
    const limit = Number.isSafeInteger(requested)
      ? Math.max(1, Math.min(requested, 100))
      : 50;
    const results: unknown[] = [];
    const dispatched = new Set<string>();

    const { error: expiryError } = await admin.rpc(
      "expire_provider_instant_payout_quotes_v2",
      {
        p_limit: limit,
      },
    );
    if (expiryError) throw expiryError;

    const { data: due, error: dueError } = await admin.rpc(
      "list_due_provider_payout_accounts_v2",
      { p_limit: limit },
    );
    if (dueError) throw dueError;
    for (const candidate of due ?? []) {
      try {
        const result = await reserveAndDispatchStandardPayoutV2(
          candidate.provider_id,
        );
        if (result.payout_id) dispatched.add(result.payout_id);
        results.push(result);
      } catch (error) {
        results.push({
          provider_id: candidate.provider_id,
          status: "error",
          message: messageFor(error, "Unknown standard payout failure"),
        });
      }
    }

    const { data: pending, error: pendingError } = await admin.rpc(
      "list_provider_payouts_for_dispatch_v2",
      { p_limit: limit },
    );
    if (pendingError) throw pendingError;
    for (const payout of pending ?? []) {
      if (dispatched.has(payout.payout_id)) continue;
      try {
        results.push(
          await dispatchProviderPayoutV2(payout.payout_id, payout.provider_id),
        );
      } catch (error) {
        results.push({
          payout_id: payout.payout_id,
          status: "error",
          message: messageFor(error, "Unknown payout retry failure"),
        });
      }
    }
    return json(req, { processed: results.length, results });
  } catch (error) {
    return errorResponse(req, error);
  }
});
