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
  const { data, error } = await supabase.rpc("get_public_reviews", {
    p_target_id: targetUserId,
  });

  if (error) throw error;
  return (data || []).map((review) => ({
    ...review,
    reviewer: {
      username: review.reviewer_username,
      profile_photo: review.reviewer_profile_photo,
    },
  }));
}
