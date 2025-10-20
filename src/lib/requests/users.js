// 📁 src/lib/requests/users.js
import { supabase } from "@/lib/supabaseClient";

/**
 * 👤 Récupère les infos d’un utilisateur via son ID
 */
export async function getUserById(userId) {
  const { data, error } = await supabase.from("users").select("*").eq("id", userId).single();

  if (error) throw error;
  return data;
}

/**
 * 🔍 Recherche un pro par ville ou catégorie
 */
export async function searchPros({ city, category }) {
  let query = supabase.from("users").select("*").eq("role", "pro");

  if (city) query = query.ilike("city", `%${city}%`);
  if (category) query = query.ilike("categories", `%${category}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * ⚙️ Met à jour le profil utilisateur
 */
export async function updateUser(userId, updates) {
  const { data, error } = await supabase.from("users").update(updates).eq("id", userId).select();

  if (error) throw error;
  return data[0];
}
