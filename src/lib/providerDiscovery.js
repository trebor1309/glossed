import { supabase } from "@/lib/supabaseClient";

export const DISCOVERY_PAGE_SIZE = 6;

export async function loadServiceCategories() {
  const { data, error } = await supabase.rpc("list_service_categories");
  if (error) throw error;
  return data || [];
}

export function serviceLabel(categories, code) {
  return categories.find((category) => category.code === code)?.fallback_label || code;
}

export function profileServiceCodes(profile, categories) {
  const values = Array.isArray(profile?.business_type)
    ? profile.business_type
    : typeof profile?.business_type === "string"
      ? profile.business_type
          .replace(/^{|}$/g, "")
          .split(",")
          .map((value) => value.replace(/"/g, "").trim())
      : [];
  const normalized = new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));

  return categories
    .filter(
      (category) =>
        normalized.has(category.code.toLowerCase()) ||
        normalized.has(category.fallback_label.toLowerCase())
    )
    .map((category) => category.code);
}

export function targetedBookingErrorMessage(error) {
  const message = error?.message || "Unable to send this request.";
  if (message.includes("Professional is not accepting discoverable requests")) {
    return "This professional is no longer accepting new requests. Please choose another professional.";
  }
  if (message.includes("outside the professional service area")) {
    return "This address is outside the professional's current service area.";
  }
  if (message.includes("Operation identifier was already used")) {
    return "This request changed after an earlier submission. Return to the profile to start a new request.";
  }
  return message;
}
