import {
  dispatchRefundV2,
  dispatchTransferReversalV2,
} from "../_shared/financial-remediation-v2.ts";
import {
  dispatchProviderTransferV2,
  refreshConnectForRelease,
} from "../_shared/release-transfer-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

function tokenClaims(req: Request) {
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const payload = token.split(".")[1];
  if (!payload) throw new HttpError(401, "Invalid session");
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as { aal?: string; iat?: number };
  } catch {
    throw new HttpError(401, "Invalid session claims");
  }
}

function mfaAuthenticatedAt(req: Request) {
  const claims = tokenClaims(req);
  if (claims.aal !== "aal2" || !Number.isSafeInteger(claims.iat)) {
    throw new HttpError(403, "Recent MFA authentication required");
  }
  return new Date(Number(claims.iat) * 1000).toISOString();
}

async function connectRevision(paymentId: string, required: boolean) {
  if (!required) return null;
  const context = await refreshConnectForRelease(paymentId);
  return context.connect_revision;
}

async function cancellationExecutionContext(cancellationId: string) {
  const { data: cancellation, error: cancellationError } = await admin
    .from("cancellation_cases_v2")
    .select("payment_id")
    .eq("id", cancellationId)
    .single();
  if (cancellationError) throw cancellationError;
  const { data: allocation, error: allocationError } = await admin
    .from("cancellation_allocation_proposals_v2")
    .select("provider_awarded_gross_amount_cents")
    .eq("cancellation_id", cancellationId)
    .not("accepted_at", "is", null)
    .order("revision", { ascending: false })
    .limit(1)
    .single();
  if (allocationError) throw allocationError;
  return {
    paymentId: cancellation.payment_id as string,
    requiresConnect: Number(allocation.provider_awarded_gross_amount_cents) > 0,
  };
}

async function resolutionExecutionContext(resolutionId: string) {
  const { data, error } = await admin
    .from("financial_resolutions_v2")
    .select("payment_id, provider_transfer_amount_cents")
    .eq("id", resolutionId)
    .single();
  if (error) throw error;
  return {
    paymentId: data.payment_id as string,
    requiresConnect: Number(data.provider_transfer_amount_cents) > 0,
  };
}

async function executeOperations(result: Record<string, unknown>) {
  const operations: Record<string, unknown> = {};
  if (typeof result.reversal_id === "string") {
    try {
      operations.reversal = await dispatchTransferReversalV2(result.reversal_id);
    } catch (error) {
      operations.reversal = {
        status: "attempted_recovery_failed",
        message: error instanceof Error ? error.message : "Unknown reversal failure",
      };
    }
  }
  if (typeof result.refund_id === "string") {
    operations.refund = await dispatchRefundV2(result.refund_id);
  }
  return operations;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);
  try {
    const user = await requireUser(req);
    const body = await req.json();
    const action = body?.action;
    const operationId = typeof body?.operation_id === "string"
      ? body.operation_id
      : crypto.randomUUID();
    if (typeof action !== "string") throw new HttpError(400, "Missing action");

    if (action === "request_client_cancellation") {
      const { data, error } = await admin.rpc("request_client_cancellation_v2", {
        p_payment_id: body.payment_id,
        p_client_id: user.id,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:cancellation:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "provider_respond_cancellation") {
      const { data, error } = await admin.rpc("provider_respond_cancellation_v2", {
        p_cancellation_id: body.cancellation_id,
        p_provider_id: user.id,
        p_action: body.response,
        p_provider_awarded_gross_amount_cents: body.provider_awarded_gross_amount_cents ?? 0,
        p_provider_statutory_withholding_amount_cents:
          body.provider_statutory_withholding_amount_cents ?? 0,
        p_client_tax_allocated_amount_cents: body.client_tax_allocated_amount_cents ?? 0,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:cancellation-response:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "client_respond_cancellation") {
      const { data, error } = await admin.rpc("client_respond_cancellation_v2", {
        p_cancellation_id: body.cancellation_id,
        p_client_id: user.id,
        p_accept: body.accept === true,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:cancellation-client:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "provider_cancel") {
      const { data, error } = await admin.rpc("provider_cancel_service_v2", {
        p_payment_id: body.payment_id,
        p_provider_id: user.id,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:provider-cancel:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "propose_mutual_cancellation") {
      const actorType = body.actor_type === "provider" ? "provider" : "client";
      const { data, error } = await admin.rpc("propose_mutual_cancellation_v2", {
        p_payment_id: body.payment_id,
        p_actor_type: actorType,
        p_actor_user_id: user.id,
        p_provider_awarded_gross_amount_cents: body.provider_awarded_gross_amount_cents,
        p_provider_statutory_withholding_amount_cents:
          body.provider_statutory_withholding_amount_cents ?? 0,
        p_client_tax_allocated_amount_cents: body.client_tax_allocated_amount_cents ?? 0,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:mutual-cancellation:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "respond_mutual_cancellation") {
      const actorType = body.actor_type === "provider" ? "provider" : "client";
      const { data, error } = await admin.rpc("respond_mutual_cancellation_v2", {
        p_cancellation_id: body.cancellation_id,
        p_actor_type: actorType,
        p_actor_user_id: user.id,
        p_accept: body.accept === true,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:mutual-response:${operationId}`,
      });
      if (error) throw error;
      return json(req, { cancellation: data });
    }
    if (action === "execute_cancellation") {
      const context = await cancellationExecutionContext(body.cancellation_id);
      const expectedRevision = await connectRevision(context.paymentId, context.requiresConnect);
      const { data, error } = await admin.rpc("execute_agreed_cancellation_v2", {
        p_cancellation_id: body.cancellation_id,
        p_expected_connect_revision: expectedRevision,
        p_deduplication_key: `remediation-v2:cancellation-execute:${operationId}`,
      });
      if (error) throw error;
      const result = data?.[0] ?? {};
      return json(
        req,
        { resolution: result, operations: await executeOperations(result) },
        202
      );
    }
    if (action === "open_service_dispute") {
      const actorType = body.actor_type === "provider" ? "provider" : "client";
      const { data, error } = await admin.rpc("open_service_dispute_v2", {
        p_payment_id: body.payment_id,
        p_actor_type: actorType,
        p_actor_user_id: user.id,
        p_issue_code: body.issue_code,
        p_reason: body.reason,
        p_deduplication_key: `remediation-v2:service-dispute:${operationId}`,
      });
      if (error) throw error;
      return json(req, { dispute: data });
    }
    if (action === "add_service_dispute_evidence") {
      const actorType = body.actor_type === "provider" ? "provider" : "client";
      const { data, error } = await admin.rpc("add_service_dispute_evidence_v2", {
        p_dispute_id: body.dispute_id,
        p_actor_type: actorType,
        p_actor_user_id: user.id,
        p_statement: body.statement,
        p_attachments: body.attachments ?? [],
        p_deduplication_key: `remediation-v2:evidence:${operationId}`,
      });
      if (error) throw error;
      return json(req, { evidence: data });
    }
    if (action === "decide_service_dispute") {
      const mfaAt = mfaAuthenticatedAt(req);
      const { data: disputeContext, error: disputeContextError } = await admin
        .from("service_disputes_v2")
        .select("payment_id")
        .eq("id", body.dispute_id)
        .single();
      if (disputeContextError) throw disputeContextError;
      const expectedRevision = await connectRevision(
        disputeContext.payment_id,
        Number(body.provider_awarded_gross_amount_cents ?? 0) > 0
      );
      const { data, error } = await admin.rpc("decide_service_dispute_v2", {
        p_dispute_id: body.dispute_id,
        p_admin_id: user.id,
        p_provider_awarded_gross_amount_cents: body.provider_awarded_gross_amount_cents,
        p_provider_statutory_withholding_amount_cents:
          body.provider_statutory_withholding_amount_cents ?? 0,
        p_client_tax_allocated_amount_cents: body.client_tax_allocated_amount_cents ?? 0,
        p_reason: body.reason,
        p_evidence_manifest: body.evidence_manifest ?? {},
        p_mfa_authenticated_at: mfaAt,
        p_security_policy_version: "financial_admin_mfa_v1",
        p_expected_connect_revision: expectedRevision,
        p_deduplication_key: `remediation-v2:service-decision:${operationId}`,
      });
      if (error) throw error;
      const result = data?.[0] ?? {};
      return json(req, { decision: result, operations: await executeOperations(result) }, 202);
    }
    if (action === "finalize_resolution") {
      const context = await resolutionExecutionContext(body.resolution_id);
      const expectedRevision = await connectRevision(context.paymentId, context.requiresConnect);
      const { data, error } = await admin.rpc("finalize_financial_resolution_v2", {
        p_resolution_id: body.resolution_id,
        p_expected_connect_revision: expectedRevision,
        p_deduplication_key: `remediation-v2:finalize:${operationId}`,
      });
      if (error) throw error;
      const result = data?.[0];
      let transfer;
      if (result?.provider_transfer_id && result.provider_transfer_status !== "succeeded") {
        transfer = await dispatchProviderTransferV2(context.paymentId, result.provider_transfer_id);
      }
      return json(req, { resolution: result, transfer }, 202);
    }
    throw new HttpError(400, "Unsupported action");
  } catch (error) {
    return errorResponse(req, error);
  }
});
