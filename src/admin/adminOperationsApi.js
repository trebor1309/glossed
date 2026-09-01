import { adminSupabase } from "./adminSupabase";

async function rpc(name, parameters = {}) {
  const { data, error } = await adminSupabase.rpc(name, parameters);
  if (error) throw error;
  return data;
}

export const getOperationsOverview = () => rpc("admin_get_operations_overview");
export const getConnectActionQueue = (limit = 10) =>
  rpc("admin_get_connect_action_queue", { p_limit: limit });
export const globalAdminSearch = (query, limit = 12) =>
  rpc("admin_global_search", { p_query: query, p_limit: limit });
export const listAdminUsers = (query = "", limit = 50, offset = 0) =>
  rpc("admin_list_users", { p_query: query || null, p_limit: limit, p_offset: offset });
export const getAdminUser = (userId) => rpc("admin_get_user_detail", { p_user_id: userId });
export async function refreshAdminConnectAccount(providerId) {
  const { data, error } = await adminSupabase.functions.invoke("check-stripe-account", {
    body: { provider_id: providerId, requested_from: "admin" },
  });
  if (error) throw error;
  return data;
}
export const listAdminMissions = ({
  query = "",
  status = "all",
  flowVersion = "all",
  partyQuery = "",
  dateFrom = null,
  dateTo = null,
  attentionOnly = false,
  limit = 25,
  offset = 0,
} = {}) => rpc("admin_list_missions_ux_v2", {
  p_query: query || null,
  p_status: status,
  p_flow_version: flowVersion,
  p_party_query: partyQuery || null,
  p_date_from: dateFrom,
  p_date_to: dateTo,
  p_attention_only: attentionOnly,
  p_limit: limit,
  p_offset: offset,
});
export const getAdminMission = (missionId) =>
  rpc("admin_get_mission_detail", { p_mission_id: missionId });

export const searchAdminFinance = (query, limit = 50) =>
  rpc("admin_financial_search", { p_query: query, p_limit: limit });
export const getAdminFinancialPayment = (paymentId) =>
  rpc("admin_get_financial_payment_detail", { p_payment_id: paymentId });
export const listAdminPaymentDisputes = (queue = "open", limit = 50, offset = 0) =>
  rpc("admin_list_payment_disputes", { p_queue: queue, p_limit: limit, p_offset: offset });
export const getAdminPaymentDisputeCounts = () => rpc("admin_get_payment_dispute_counts_ux_v2");
export const getAdminPaymentDispute = (disputeId) =>
  rpc("admin_get_payment_dispute_detail", { p_dispute_id: disputeId });
export const previewAdminFinancialOperation = (operationType, operationId) =>
  rpc("admin_preview_financial_operation_v2", {
    p_operation_type: operationType,
    p_operation_id: operationId,
  });

export async function executeAdminFinancialOperation(previewId, reason, operationId) {
  const { data, error } = await adminSupabase.functions.invoke("financial-remediation-v2", {
    body: {
      action: "admin_execute_financial_operation",
      preview_id: previewId,
      reason,
      confirmed: true,
      operation_id: operationId,
    },
  });
  if (error) throw error;
  return data;
}

export const listAdminFinancialIncidents = (queue = "open", limit = 50, offset = 0) =>
  rpc("admin_list_financial_incidents", { p_queue: queue, p_limit: limit, p_offset: offset });
export const getAdminIncidentCounts = () => rpc("admin_get_incident_counts_ux_v2");
export const getAdminFinancialIncident = (incidentKey) =>
  rpc("admin_get_financial_incident_detail", { p_incident_key: incidentKey });
export const reconcileAdminFinancialIncident = (incidentKey) =>
  rpc("admin_reconcile_financial_incident_v2", {
    p_incident_key: incidentKey,
    p_deduplication_key: `admin-incident-reconciliation:${crypto.randomUUID()}`,
  });
export const previewAdminControlReactivation = (controlId, reconciliationId) =>
  rpc("admin_preview_financial_control_reactivation_v2", {
    p_control_id: controlId,
    p_reconciliation_id: reconciliationId,
  });

export async function executeAdminControlReactivation(previewId, reason, operationId) {
  const { data, error } = await adminSupabase.functions.invoke("financial-remediation-v2", {
    body: {
      action: "admin_reactivate_financial_control",
      preview_id: previewId,
      reason,
      confirmed: true,
      operation_id: operationId,
    },
  });
  if (error) throw error;
  return data;
}

export const searchAdminAudit = ({
  query = "",
  source = "all",
  outcome = "all",
  actorQuery = "",
  dateFrom = null,
  dateTo = null,
  limit = 50,
  offset = 0,
} = {}) => rpc("admin_search_audit_ux_v2", {
  p_query: query.trim() || null,
  p_source: source,
  p_outcome: outcome,
  p_actor_query: actorQuery.trim() || null,
  p_date_from: dateFrom,
  p_date_to: dateTo,
  p_limit: limit,
  p_offset: offset,
});
export const getAdminConfiguration = () => rpc("admin_get_configuration_catalog");
export const createAdminConfigurationVersion = (configurationType, version, payload, reason) =>
  rpc("admin_create_configuration_version", {
    p_configuration_type: configurationType,
    p_version: version,
    p_payload: payload,
    p_reason: reason,
  });

export const listAdministrators = (query = "", limit = 50, offset = 0) =>
  rpc("admin_list_administrators", {
    p_query: query.trim() || null,
    p_limit: limit,
    p_offset: offset,
  });
export const getAdministratorCatalog = () => rpc("admin_get_administrator_catalog");
export const getAdministratorHistory = (userId, limit = 25) =>
  rpc("admin_get_administrator_history", { p_target_user_id: userId, p_limit: limit });
export const previewAdministratorChange = ({
  action,
  targetUserId = null,
  targetEmail = null,
  displayName = null,
  roles = null,
  status = null,
}) =>
  rpc("admin_preview_administrator_change_ux_v1", {
    p_action: action,
    p_target_user_id: targetUserId,
    p_target_email: targetEmail,
    p_display_name: displayName,
    p_roles: roles,
    p_status: status,
  });
export const executeAdministratorChange = (previewId, reason, operationId) =>
  rpc("admin_execute_administrator_change", {
    p_preview_id: previewId,
    p_reason: reason,
    p_operation_id: operationId,
  });

export const listAdminDisputeCases = (queue = "disputes_open", limit = 50, offset = 0) =>
  rpc("admin_list_dispute_cases_ux_v2", { p_queue: queue, p_limit: limit, p_offset: offset });
export const getAdminDisputeQueueCounts = () => rpc("admin_get_dispute_queue_counts_ux_v2");
export const listAdminProfessionalVerifications = (view = "open", limit = 50, offset = 0) =>
  rpc("admin_list_professional_verifications_ux_v2", {
    p_view: view,
    p_limit: limit,
    p_offset: offset,
  });
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
