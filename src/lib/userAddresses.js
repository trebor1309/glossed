import { supabase } from "@/lib/supabaseClient";

function firstRow(data) {
  return Array.isArray(data) ? data[0] || null : data || null;
}

export async function listMyUserAddresses() {
  const { data, error } = await supabase.rpc("list_my_user_addresses_v1");
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createMyUserAddress(addressId, address, makeDefault = false) {
  const { data, error } = await supabase.rpc("create_my_user_address_v1", {
    p_address_id: addressId,
    p_label: address.label,
    p_formatted_address: address.formatted_address,
    p_city: address.city || null,
    p_postal_code: address.postal_code || null,
    p_country_code: address.country_code || null,
    p_latitude: address.latitude,
    p_longitude: address.longitude,
    p_make_default: makeDefault,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function updateMyUserAddress(addressId, address) {
  const { data, error } = await supabase.rpc("update_my_user_address_v1", {
    p_address_id: addressId,
    p_label: address.label,
    p_formatted_address: address.formatted_address,
    p_city: address.city || null,
    p_postal_code: address.postal_code || null,
    p_country_code: address.country_code || null,
    p_latitude: address.latitude,
    p_longitude: address.longitude,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function setMyDefaultUserAddress(addressId) {
  const { data, error } = await supabase.rpc("set_my_default_user_address_v1", {
    p_address_id: addressId,
  });
  if (error) throw error;
  return firstRow(data);
}

export async function deleteMyUserAddress(addressId) {
  const { data, error } = await supabase.rpc("delete_my_user_address_v1", {
    p_address_id: addressId,
  });
  if (error) throw error;
  return firstRow(data);
}

export function savedAddressErrorMessage(error) {
  const message = String(error?.message || "");
  if (/maximum of 20/i.test(message)) return "You can save up to 20 addresses.";
  if (/different request/i.test(message)) {
    return "This address request changed. Please try saving it again.";
  }
  if (/not found/i.test(message)) return "This saved address is no longer available.";
  return "Unable to save your addresses right now. Please try again.";
}
