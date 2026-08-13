import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    const authUser = await requireUser(req);
    const { data: profile, error } = await admin
      .from("users")
      .select("stripe_account_id")
      .eq("id", authUser.id)
      .maybeSingle();
    if (error) throw error;
    if (!profile) throw new HttpError(404, "Profile not found");

    if (!profile.stripe_account_id) return json(req, { success: true });

    const { error: updateError } = await admin.rpc(
      "set_provider_connect_connection_enabled",
      { p_provider_id: authUser.id, p_enabled: false }
    );
    if (updateError) throw updateError;

    return json(req, { success: true });
  } catch (error) {
    return errorResponse(req, error);
  }
});
