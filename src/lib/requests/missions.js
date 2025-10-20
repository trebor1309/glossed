// 📁 src/lib/requests/missions.js
import { supabase } from "@/lib/supabaseClient";

/**
 * 🧾 Récupère toutes les missions d’un professionnel
 */
export async function getProMissions(proId) {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("pro_id", proId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * 🧭 Récupère toutes les missions d’un client
 */
export async function getClientMissions(clientId) {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("client_id", clientId)
    .order("date", { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * ✏️ Met à jour le statut d’une mission
 */
export async function updateMissionStatus(missionId, status) {
  const { error } = await supabase.from("missions").update({ status }).eq("id", missionId);

  if (error) throw error;
}

/**
 * ➕ Crée une nouvelle mission
 */
export async function createMission(mission) {
  const { data, error } = await supabase.from("missions").insert([mission]).select();
  if (error) throw error;
  return data[0];
}
