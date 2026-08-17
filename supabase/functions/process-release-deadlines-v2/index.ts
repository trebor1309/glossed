import {
  dispatchProviderTransferV2,
  refreshConnectForRelease,
} from "../_shared/release-transfer-v2.ts";
import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { admin } from "../_shared/supabase.ts";

function requireServiceRole(req: Request) {
  const expected = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supplied = req.headers.get("authorization") ?? "";
  if (!expected || supplied !== `Bearer ${expected}`) {
    throw new HttpError(401, "Service role authorization required");
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    requireServiceRole(req);
    const { data: flag, error: flagError } = await admin
      .from("financial_feature_flags")
      .select("enabled")
      .eq("flag_code", "completion_release_v2")
      .maybeSingle();
    if (flagError) throw flagError;
    if (!flag?.enabled) return json(req, { skipped: true, reason: "feature_disabled" });

    const body = await req.json().catch(() => ({}));
    const requestedLimit =
      body && typeof body === "object" && "limit" in body ? Number(body.limit) : Number.NaN;
    const limit = Number.isSafeInteger(requestedLimit)
      ? Math.max(1, Math.min(requestedLimit, 100))
      : 25;
    const results: unknown[] = [];
    const dispatched = new Set<string>();

    const { data: remindersQueued, error: reminderError } = await admin.rpc(
      "enqueue_due_service_release_reminders_v2",
      { p_limit: limit }
    );
    if (reminderError) throw reminderError;

    const { data: due, error: dueError } = await admin.rpc("list_due_fund_releases_v2", {
      p_limit: limit,
    });
    if (dueError) throw dueError;
    for (const candidate of due ?? []) {
      try {
        const context = await refreshConnectForRelease(candidate.payment_id);
        const rpcName =
          candidate.release_trigger === "client_confirmation"
            ? "reserve_client_confirmed_fund_release_v2"
            : "reserve_due_fund_release_v2";
        const { data, error } = await admin.rpc(rpcName, {
          p_payment_id: candidate.payment_id,
          p_expected_connect_revision: context.connect_revision,
        });
        if (error) throw error;
        const reservation = data?.[0];
        if (reservation?.transfer_id) {
          dispatched.add(reservation.transfer_id);
          results.push(
            await dispatchProviderTransferV2(candidate.payment_id, reservation.transfer_id)
          );
        } else {
          results.push({ payment_id: candidate.payment_id, status: "released_no_transfer" });
        }
      } catch (error) {
        results.push({
          payment_id: candidate.payment_id,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown release failure",
        });
      }
    }

    const { data: pending, error: pendingError } = await admin.rpc(
      "list_provider_transfers_v2_for_dispatch",
      { p_limit: limit }
    );
    if (pendingError) throw pendingError;
    for (const transfer of pending ?? []) {
      if (dispatched.has(transfer.transfer_id)) continue;
      try {
        results.push(await dispatchProviderTransferV2(transfer.payment_id, transfer.transfer_id));
      } catch (error) {
        results.push({
          transfer_id: transfer.transfer_id,
          status: "error",
          message: error instanceof Error ? error.message : "Unknown transfer failure",
        });
      }
    }

    return json(req, {
      reminders_queued: remindersQueued ?? 0,
      processed: results.length,
      results,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
