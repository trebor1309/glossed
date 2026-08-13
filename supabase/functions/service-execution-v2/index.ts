import {
  dispatchProviderTransferV2,
  refreshConnectForRelease,
} from "../_shared/release-transfer-v2.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const user = await requireUser(req);
    const body = await req.json();
    const paymentId = body?.payment_id;
    const action = body?.action;
    if (typeof paymentId !== "string" || typeof action !== "string") {
      throw new HttpError(400, "Missing payment_id or action");
    }
    const operationId =
      typeof body.operation_id === "string" ? body.operation_id : crypto.randomUUID();

    if (action === "provider_complete") {
      const { data, error } = await admin.rpc("provider_complete_service_v2", {
        p_payment_id: paymentId,
        p_provider_id: user.id,
        p_deduplication_key: `execution-v2:${paymentId}:provider:${operationId}`,
      });
      if (error) throw error;
      return json(req, { execution: data });
    }

    if (action === "report_problem") {
      if (typeof body.problem_code !== "string" || typeof body.reason !== "string") {
        throw new HttpError(400, "Missing problem_code or reason");
      }
      const { data, error } = await admin.rpc("client_report_service_problem_v2", {
        p_payment_id: paymentId,
        p_client_id: user.id,
        p_problem_code: body.problem_code,
        p_reason: body.reason,
        p_deduplication_key: `execution-v2:${paymentId}:problem:${operationId}`,
      });
      if (error) throw error;
      return json(req, { execution: data });
    }

    if (action === "client_confirm") {
      const { data: execution, error } = await admin.rpc("client_confirm_service_v2", {
        p_payment_id: paymentId,
        p_client_id: user.id,
        p_deduplication_key: `execution-v2:${paymentId}:confirm:${operationId}`,
      });
      if (error) throw error;
      let reservation;
      try {
        const context = await refreshConnectForRelease(paymentId);
        const { data, error: releaseError } = await admin.rpc(
          "reserve_client_confirmed_fund_release_v2",
          {
            p_payment_id: paymentId,
            p_expected_connect_revision: context.connect_revision,
          }
        );
        if (releaseError) throw releaseError;
        reservation = data?.[0];
      } catch (releaseError) {
        console.error("Client confirmation recorded; release remains pending", releaseError);
        return json(
          req,
          {
            execution,
            release: { status: "blocked_or_pending", retry_scheduled: true },
            transfer: { status: "not_started" },
          },
          202
        );
      }
      if (!reservation?.transfer_id) {
        return json(req, {
          execution,
          release: reservation,
          transfer: { status: "not_required" },
        });
      }
      try {
        const transfer = await dispatchProviderTransferV2(paymentId, reservation.transfer_id);
        return json(req, { execution, release: reservation, transfer });
      } catch (transferError) {
        console.error("Release recorded; provider transfer requires retry", transferError);
        return json(
          req,
          {
            execution,
            release: reservation,
            transfer: { status: "pending_reconciliation", retry_scheduled: true },
          },
          202
        );
      }
    }

    throw new HttpError(400, "Unsupported action");
  } catch (error) {
    return errorResponse(req, error);
  }
});
