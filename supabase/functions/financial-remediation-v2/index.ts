import {
  dispatchProviderRetransferV2,
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
    return JSON.parse(atob(padded)) as {
      aal?: string;
      amr?: Array<{ method?: string; timestamp?: number }>;
    };
  } catch {
    throw new HttpError(401, "Invalid session claims");
  }
}

function mfaAuthenticatedAt(req: Request) {
  const claims = tokenClaims(req);
  const timestamps = (claims.amr ?? [])
    .filter((entry) => ["totp", "webauthn", "phone"].includes(entry.method ?? ""))
    .map((entry) => entry.timestamp)
    .filter((value): value is number => Number.isSafeInteger(value));
  const latest = timestamps.length > 0 ? Math.max(...timestamps) : null;
  if (claims.aal !== "aal2" || latest === null) {
    throw new HttpError(403, "Recent MFA authentication required");
  }
  return new Date(latest * 1000).toISOString();
}

async function requireAdminPermissions(userId: string, permissions: string[]) {
  for (const permission of permissions) {
    const { data, error } = await admin.rpc("admin_account_has_permission", {
      p_user_id: userId,
      p_permission_code: permission,
    });
    if (error) throw error;
    if (data !== true) throw new HttpError(403, `Missing administrator permission: ${permission}`);
  }
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
      const { data: payment, error: paymentError } = await admin
        .from("checkout_v2_payments")
        .select("client_id, provider_id")
        .eq("id", context.paymentId)
        .single();
      if (paymentError) throw paymentError;
      if (![payment.client_id, payment.provider_id].includes(user.id)) {
        throw new HttpError(403, "Cancellation participant required");
      }
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
    if (action === "admin_add_service_dispute_evidence") {
      await requireAdminPermissions(user.id, ["disputes.decide"]);
      const { data, error } = await admin.rpc("add_service_dispute_evidence_v2", {
        p_dispute_id: body.dispute_id,
        p_actor_type: "admin",
        p_actor_user_id: user.id,
        p_statement: body.statement,
        p_attachments: body.attachments ?? [],
        p_deduplication_key: `admin-dispute-evidence:${operationId}`,
      });
      if (error) throw error;
      return json(req, { evidence: data });
    }
    if (action === "decide_service_dispute") {
      throw new HttpError(
        410,
        "Direct dispute allocations are disabled; create and explicitly confirm a server preview"
      );
    }
    if (action === "admin_decide_service_dispute") {
      if (body.confirmed !== true) throw new HttpError(400, "Explicit confirmation required");
      if (typeof body.reason !== "string" || body.reason.trim().length < 10) {
        throw new HttpError(400, "A detailed justification is required");
      }
      await requireAdminPermissions(user.id, ["disputes.allocate", "finance.execute"]);
      const mfaAt = mfaAuthenticatedAt(req);
      const { data: preview, error: previewError } = await admin
        .from("admin_dispute_allocation_previews_v2")
        .select("dispute_id, provider_transfer_amount_cents, service_disputes_v2(payment_id)")
        .eq("id", body.preview_id)
        .single();
      if (previewError) throw previewError;
      const disputeContext = preview.service_disputes_v2 as unknown as { payment_id: string };
      const expectedRevision = await connectRevision(
        disputeContext.payment_id,
        Number(preview.provider_transfer_amount_cents) > 0
      );
      const { data, error } = await admin.rpc("execute_admin_service_dispute_decision_v2", {
        p_preview_id: body.preview_id,
        p_admin_id: user.id,
        p_reason: body.reason.trim(),
        p_evidence_manifest: body.evidence_manifest ?? {},
        p_mfa_authenticated_at: mfaAt,
        p_expected_connect_revision: expectedRevision,
        p_operation_id: operationId,
      });
      if (error) throw error;
      const result = data?.[0] ?? {};
      let operations: Record<string, unknown> = {};
      let outcome = "success";
      try {
        operations = await executeOperations(result);
      } catch (operationError) {
        outcome = "failed";
        operations = {
          status: "failed",
          message: operationError instanceof Error ? operationError.message : "Execution failed",
        };
      }
      const { error: auditError } = await admin.rpc("record_admin_dispute_execution_audit_v2", {
        p_admin_id: user.id,
        p_dispute_id: preview.dispute_id,
        p_operation_id: operationId,
        p_outcome: outcome,
        p_operations: operations,
        p_mfa_authenticated_at: mfaAt,
      });
      if (auditError) throw auditError;
      return json(req, { decision: result, operations, execution_status: outcome }, 202);
    }
    if (action === "admin_execute_financial_operation") {
      if (body.confirmed !== true) throw new HttpError(400, "Explicit confirmation required");
      if (typeof body.reason !== "string" || body.reason.trim().length < 10) {
        throw new HttpError(400, "A detailed justification is required");
      }
      await requireAdminPermissions(user.id, ["finance.execute"]);
      const mfaAt = mfaAuthenticatedAt(req);
      const { data: preview, error: previewError } = await admin
        .from("admin_financial_operation_previews_v2")
        .select("operation_type, operation_id, payment_id, payment_dispute_id")
        .eq("id", body.preview_id)
        .single();
      if (previewError) throw previewError;
      if (preview.payment_dispute_id) {
        await requireAdminPermissions(user.id, ["risk.manage"]);
      }
      const { data, error } = await admin.rpc("consume_admin_financial_operation_preview_v2", {
        p_preview_id: body.preview_id,
        p_admin_id: user.id,
        p_reason: body.reason.trim(),
        p_mfa_authenticated_at: mfaAt,
        p_execution_operation_id: operationId,
      });
      if (error) throw error;
      const operation = data?.[0] ?? preview;
      let result: Record<string, unknown>;
      let outcome = "success";
      try {
        if (operation.operation_type === "refund") {
          result = await dispatchRefundV2(operation.operation_id);
          outcome = result.status === "pending" ? "pending" : "success";
        } else if (operation.operation_type === "transfer_reversal") {
          result = await dispatchTransferReversalV2(operation.operation_id);
        } else if (operation.operation_type === "provider_retransfer") {
          result = await dispatchProviderRetransferV2(
            operation.payment_id,
            operation.operation_id
          );
        } else {
          throw new HttpError(400, "Unsupported financial operation type");
        }
      } catch (operationError) {
        outcome = "failed";
        result = {
          status: "failed",
          message: operationError instanceof Error ? operationError.message : "Execution failed",
        };
      }
      const { error: auditError } = await admin.rpc(
        "record_admin_financial_execution_audit_v2",
        {
          p_admin_id: user.id,
          p_operation_type: operation.operation_type,
          p_operation_id: operation.operation_id,
          p_execution_operation_id: operationId,
          p_outcome: outcome,
          p_result: result,
          p_mfa_authenticated_at: mfaAt,
        }
      );
      if (auditError) throw auditError;
      return json(req, { operation, result, execution_status: outcome }, 202);
    }
    if (action === "admin_reactivate_financial_control") {
      if (body.confirmed !== true) throw new HttpError(400, "Explicit confirmation required");
      if (typeof body.reason !== "string" || body.reason.trim().length < 10) {
        throw new HttpError(400, "A detailed justification is required");
      }
      await requireAdminPermissions(user.id, ["finance.execute", "incidents.reactivate"]);
      const mfaAt = mfaAuthenticatedAt(req);
      const { data, error } = await admin.rpc(
        "consume_admin_financial_control_reactivation_v2",
        {
          p_preview_id: body.preview_id,
          p_admin_id: user.id,
          p_reason: body.reason.trim(),
          p_mfa_authenticated_at: mfaAt,
          p_execution_operation_id: operationId,
        }
      );
      if (error) throw error;
      return json(req, { control: data, execution_status: "success" });
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
