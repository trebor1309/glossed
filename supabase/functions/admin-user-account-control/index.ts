import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

type RequestBody = {
  target_user_id?: string;
  target_status?: string;
  reason?: string;
  operation_id?: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

function userClient(req: Request) {
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
  });
}

function databaseError(error: { code?: string; message?: string }) {
  const status = error.code === "42501"
    ? 403
    : error.code === "23505" || error.code === "40001"
    ? 409
    : error.code === "P0002"
    ? 404
    : 400;
  return new HttpError(status, error.message || "Account control failed");
}

async function markFailed(operationId: string, message: string, evidence: Record<string, unknown>) {
  const { error } = await admin.rpc("fail_admin_user_account_change", {
    p_operation_id: operationId,
    p_error: message,
    p_evidence: evidence,
  });
  if (error) console.error("Could not record failed account control", error);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const actor = await requireUser(req);
    const body = await req.json().catch(() => ({})) as RequestBody;
    const targetUserId = body.target_user_id?.trim() ?? "";
    const targetStatus = body.target_status?.trim() ?? "";
    const reason = body.reason?.trim() ?? "";
    const operationId = body.operation_id?.trim() ?? "";
    if (!UUID_PATTERN.test(targetUserId) || !UUID_PATTERN.test(operationId)
      || !["active", "suspended"].includes(targetStatus)
      || reason.length < 10 || reason.length > 4000) {
      throw new HttpError(400, "Invalid account control request");
    }

    const scoped = userClient(req);
    const { data: operation, error: beginError } = await scoped.rpc(
      "admin_begin_user_account_change",
      {
        p_target_user_id: targetUserId,
        p_target_status: targetStatus,
        p_reason: reason,
        p_operation_id: operationId,
      },
    );
    if (beginError) throw databaseError(beginError);
    if (operation?.operation_status === "applied") {
      return json(req, operation.result ?? operation);
    }

    const banDuration = targetStatus === "suspended" ? "876000h" : "none";
    const { data: authState, error: authError } = await admin.auth.admin.updateUserById(
      targetUserId,
      { ban_duration: banDuration },
    );
    if (authError) {
      await markFailed(operationId, authError.message, {
        stage: "auth_provider",
        requested_by: actor.id,
      });
      throw new HttpError(502, "Supabase Auth could not apply the account status");
    }

    const { data: result, error: completeError } = await admin.rpc(
      "complete_admin_user_account_change",
      {
        p_operation_id: operationId,
        p_auth_provider_evidence: {
          provider: "supabase_auth",
          banned_until: authState.user?.banned_until ?? null,
          target_status: targetStatus,
        },
      },
    );
    if (completeError) {
      const rollbackDuration = operation.previous_status === "suspended" ? "876000h" : "none";
      const { error: rollbackError } = await admin.auth.admin.updateUserById(
        targetUserId,
        { ban_duration: rollbackDuration },
      );
      await markFailed(operationId, completeError.message, {
        stage: "database_completion",
        auth_rollback_succeeded: !rollbackError,
        auth_rollback_error: rollbackError?.message ?? null,
      });
      throw databaseError(completeError);
    }
    return json(req, result);
  } catch (error) {
    return errorResponse(req, error);
  }
});
