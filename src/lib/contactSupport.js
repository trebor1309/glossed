import { supabase } from "@/lib/supabaseClient";

async function edgeFunctionMessage(error) {
  const fallback = error?.message || "Unable to send your message right now.";
  const response = error?.context;
  if (!response || typeof response.clone !== "function") return fallback;

  try {
    const payload = await response.clone().json();
    return typeof payload?.error === "string" && payload.error ? payload.error : fallback;
  } catch {
    return fallback;
  }
}

export async function submitContactRequest(payload) {
  const { data, error } = await supabase.functions.invoke("submit-contact-request", {
    body: payload,
  });

  if (error) throw new Error(await edgeFunctionMessage(error));
  if (!data?.ok) throw new Error("The support service returned an invalid response.");
  return data;
}
