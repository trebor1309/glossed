import { adminSupabase } from "./adminSupabase";

async function rpc(name, parameters = {}) {
  const { data, error } = await adminSupabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export const getOperationsOverview = () => rpc("admin_get_operations_overview");
export const globalAdminSearch = (query, limit = 12) =>
  rpc("admin_global_search", { p_query: query, p_limit: limit });
export const listAdminUsers = (query = "", limit = 50, offset = 0) =>
  rpc("admin_list_users", { p_query: query || null, p_limit: limit, p_offset: offset });
export const getAdminUser = (userId) => rpc("admin_get_user_detail", { p_user_id: userId });
export const listAdminMissions = (query = "", limit = 50, offset = 0) =>
  rpc("admin_list_missions", { p_query: query || null, p_limit: limit, p_offset: offset });
export const getAdminMission = (missionId) =>
  rpc("admin_get_mission_detail", { p_mission_id: missionId });

export const listAdminDisputeCases = (queue = "disputes", limit = 50, offset = 0) =>
  rpc("admin_list_dispute_cases", { p_queue: queue, p_limit: limit, p_offset: offset });
export const getAdminDisputeCase = (disputeId) =>
  rpc("admin_get_dispute_case", { p_dispute_id: disputeId });
export const getAdminCancellationCase = (cancellationId) =>
  rpc("admin_get_cancellation_case", { p_cancellation_id: cancellationId });
export const previewDisputeAllocation = (disputeId, decisionCode, amounts = {}) =>
  rpc("admin_preview_service_dispute_allocation_v2", {
    p_dispute_id: disputeId,
    p_decision_code: decisionCode,
    p_provider_awarded_gross_amount_cents:
      amounts.provider_awarded_gross_amount_cents ?? null,
    p_provider_statutory_withholding_amount_cents:
      amounts.provider_statutory_withholding_amount_cents ?? null,
    p_client_tax_allocated_amount_cents:
      amounts.client_tax_allocated_amount_cents ?? null,
  });

export async function addAdminDisputeEvidence(disputeId, statement, attachments) {
  const { data, error } = await adminSupabase.functions.invoke("financial-remediation-v2", {
    body: {
      action: "admin_add_service_dispute_evidence",
      dispute_id: disputeId,
      statement,
      attachments,
      operation_id: crypto.randomUUID(),
    },
  });
  if (error) throw error;
  return data;
}

export async function decideAdminDispute(previewId, reason, evidenceManifest = {}) {
  const { data, error } = await adminSupabase.functions.invoke("financial-remediation-v2", {
    body: {
      action: "admin_decide_service_dispute",
      preview_id: previewId,
      reason,
      evidence_manifest: evidenceManifest,
      confirmed: true,
      operation_id: crypto.randomUUID(),
    },
  });
  if (error) throw error;
  return data;
}

export async function uploadAdminDisputeEvidence(disputeId, userId, file) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
  const path = `${disputeId}/${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await adminSupabase.storage.from("service-dispute-evidence").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw error;
  return { bucket: "service-dispute-evidence", path, name: file.name, mime_type: file.type, size: file.size };
}

export async function getAdminEvidenceUrl(reference) {
  const { data, error } = await adminSupabase.storage
    .from(reference.bucket)
    .createSignedUrl(reference.path, 600);
  if (error) throw error;
  return data.signedUrl;
}
