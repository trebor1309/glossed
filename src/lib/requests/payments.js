// 📁 src/lib/requests/payments.js
import { supabase } from "@/lib/supabaseClient";

/**
 * 💳 Récupère les paiements d’un pro
 */
export async function getProPayments(proId) {
  const { data, error } = await supabase
    .from("payments")
    .select("*, missions(service, date)")
    .eq("pro_id", proId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}

/**
 * 💰 Ajoute un paiement
 */
export async function addPayment(payment) {
  const { data, error } = await supabase.from("payments").insert([payment]).select();
  if (error) throw error;
  return data[0];
}

/**
 * ⚙️ Met à jour le statut d’un paiement
 */
export async function updatePaymentStatus(paymentId, status) {
  const { error } = await supabase
    .from("payments")
    .update({ status })
    .eq("id", paymentId);
  if (error) throw error;
}
