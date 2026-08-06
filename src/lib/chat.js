import { supabase } from "@/lib/supabaseClient";

export async function getOrCreateChat({ missionId = null, proId = null } = {}) {
  const { data, error } = await supabase.rpc("get_or_create_chat", {
    p_mission_id: missionId,
    p_pro_id: proId,
  });

  if (error) throw error;
  if (!data) throw new Error("Unable to open this conversation.");
  return data;
}
