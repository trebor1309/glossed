import {
  retrieveConnectAccount,
  syncConnectAccount,
} from "../_shared/connect-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

type SessionClaims = {
  sub?: string;
  aal?: string;
  session_id?: string;
  amr?: Array<{ method?: string; timestamp?: number }>;
};

function sessionClaims(req: Request): SessionClaims {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) throw new HttpError(401, "Invalid session");
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as SessionClaims;
  } catch {
    throw new HttpError(401, "Invalid session claims");
  }
}

function latestMfaTimestamp(claims: SessionClaims) {
  const timestamps = (claims.amr ?? [])
    .filter((entry) => ["totp", "webauthn", "phone"].includes(entry.method ?? ""))
    .map((entry) => entry.timestamp)
    .filter((value): value is number => Number.isSafeInteger(value));
  return timestamps.length > 0 ? new Date(Math.max(...timestamps) * 1000).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const body = await req.json().catch(() => ({})) as { provider_id?: string };
    const providerId = body.provider_id?.trim() || authUser.id;
    const isAdministrativeRefresh = providerId !== authUser.id;
    const claims = sessionClaims(req);

    if (isAdministrativeRefresh) {
      if (claims.sub !== authUser.id || claims.aal !== "aal2") {
        throw new HttpError(403, "Administrator MFA authentication required");
      }
      const { data: allowed, error: permissionError } = await admin.rpc(
        "admin_account_has_permission",
        { p_user_id: authUser.id, p_permission_code: "users.read" },
      );
      if (permissionError) throw permissionError;
      if (allowed !== true) throw new HttpError(403, "Missing administrator permission: users.read");
    }

    const { data: accountState, error } = await admin
      .from("provider_connect_accounts")
      .select("stripe_account_id, revision")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (error) throw error;
    if (!accountState?.stripe_account_id) {
      return json(req, { connected: false, reason: "no_account_id" });
    }

    const account = await retrieveConnectAccount(accountState.stripe_account_id);
    await syncConnectAccount(account, {
      id: `account-check:${account.id}:${crypto.randomUUID()}`,
      type: "v2.core.account.polled",
      createdAt: new Date(),
      livemode: Boolean(account.livemode),
      source: "account_check",
      expectedRevision: accountState.revision,
    });

    const { data: connect, error: connectError } = await admin
      .from("provider_connect_accounts")
      .select("account_api_version, creation_state, closed, connection_enabled, stripe_transfers_status, payouts_status, requirements, future_requirements, last_synced_at")
      .eq("provider_id", providerId)
      .single();
    if (connectError) throw connectError;

    if (isAdministrativeRefresh) {
      const { error: auditError } = await admin.from("admin_audit_log").insert({
        admin_account_id: authUser.id,
        event_type: "connect_account_refreshed",
        entity_type: "provider_connect_account",
        entity_id: providerId,
        action: "users.connect.refresh",
        outcome: "success",
        evidence: {
          stripe_account_id: accountState.stripe_account_id,
          creation_state: connect.creation_state,
          stripe_transfers_status: connect.stripe_transfers_status,
          payouts_status: connect.payouts_status,
          source: "admin_user_detail",
        },
        session_id: claims.session_id ?? null,
        mfa_authenticated_at: latestMfaTimestamp(claims),
        deduplication_key: `admin-connect-refresh:${authUser.id}:${providerId}:${crypto.randomUUID()}`,
      });
      if (auditError) throw auditError;
    }

    const connected = !connect.closed;

    return json(req, {
      connected,
      account_api_version: connect.account_api_version,
      creation_state: connect.creation_state,
      connection_enabled: connect.connection_enabled,
      transfers_status: connect.stripe_transfers_status,
      payouts_status: connect.payouts_status,
      ready: connected && connect.stripe_transfers_status === "active",
      requirements: connect.requirements,
      future_requirements: connect.future_requirements,
      last_synced_at: connect.last_synced_at,
    });
  } catch (error) {
    return errorResponse(req, error);
  }
});
