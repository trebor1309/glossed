import { supabase } from "@/lib/supabaseClient";

export async function getMyLegalRequirements(intendedRole = null) {
  const { data, error } = await supabase.rpc("get_my_legal_requirements", {
    p_intended_role: intendedRole,
  });
  if (error) throw error;
  return data || [];
}

export async function recordMyLegalAcceptances({
  documents,
  context,
  intendedRole = null,
  locale = "en",
}) {
  const { data, error } = await supabase.rpc("record_my_legal_acceptances", {
    p_documents: documents.map(({ code, version }) => ({ code, version })),
    p_context: context,
    p_intended_role: intendedRole,
    p_locale: locale,
    p_operation_id: crypto.randomUUID(),
  });
  if (error) throw error;
  return data;
}
