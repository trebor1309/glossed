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
