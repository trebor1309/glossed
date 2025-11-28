import { supabase } from "@/lib/supabaseClient";

/* -------------------------------------------------------
   FETCH PUBLIC PROFILE
   ------------------------------------------------------- */

export async function fetchPublicProfile(username) {
  const { data, error } = await supabase
    .from("users")
    .select(
      `
      id,
      username,
      first_name,
      last_name,
      profile_photo,
      role,
      business_name,
      description,
      city,
      country,
      services:business_type,
      portfolio,
      latitude,
      longitude,
      radius_km,
      mobile_service,
      studio_service,
      private_service
    `
    )
    .eq("username", username.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  return data;
}

/* -------------------------------------------------------
   FETCH REVIEWS
   ------------------------------------------------------- */

export async function fetchReviews(targetUserId) {
  const { data, error } = await supabase
    .from("reviews")
    .select(
      `
      id,
      rating,
      comment,
      created_at,
      reviewer:users ( username, profile_photo )
    `
    )
    .eq("target_id", targetUserId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data;
}
