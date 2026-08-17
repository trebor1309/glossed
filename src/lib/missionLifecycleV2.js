import { supabase } from "@/lib/supabaseClient";

export const missionLifecycleNotificationTypes = [
  "service_provider_completed",
  "service_confirmation_requested",
  "service_release_reminder",
  "service_funds_released",
  "service_problem_reported",
  "service_problem_resolved",
];

export async function fetchMyMissionLifecyclesV2() {
  const { data, error } = await supabase.rpc("get_my_mission_lifecycle_v2");
  if (error) throw error;
  return data || [];
}

export async function runMissionLifecycleAction(paymentId, action, details = {}) {
  const { data, error } = await supabase.functions.invoke("service-execution-v2", {
    body: {
      payment_id: paymentId,
      action,
      operation_id: crypto.randomUUID(),
      ...details,
    },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

export function indexMissionLifecycles(rows) {
  return new Map((rows || []).map((row) => [row.mission_id, row]));
}

export function formatMissionLifecycleState(state) {
  return typeof state === "string" ? state.replaceAll("_", " ") : "";
}
