import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";
import ClientProfileView from "./ClientProfileView";
import ProProfileView from "./ProProfileView";

const EMPTY_REVIEW_SUMMARY = { average_rating: null, review_count: 0 };

export default function UserPublicProfile() {
  const { user_id: userId } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useUser();
  const [profile, setProfile] = useState(null);
  const [reviewSummary, setReviewSummary] = useState(EMPTY_REVIEW_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const normalizedUserId = useMemo(() => {
    if (!userId || userId === "undefined" || userId === "null") return null;
    return userId;
  }, [userId]);

  useEffect(() => {
    if (!normalizedUserId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    let active = true;
    const loadProfile = async () => {
      setLoading(true);
      try {
        const [profileResult, summaryResult] = await Promise.all([
          supabase.rpc("get_public_profile", { p_user_id: normalizedUserId }),
          supabase.rpc("get_public_review_summary", { p_target_id: normalizedUserId }),
        ]);
        if (!active) return;

        if (profileResult.error) throw profileResult.error;
        const data = profileResult.data?.[0] || null;
        if (!data) {
          setProfile(null);
          setToast({ type: "error", message: "Profile not found." });
          return;
        }

        let services = [];
        if (Array.isArray(data.business_type)) {
          services = data.business_type;
        } else if (typeof data.business_type === "string") {
          services = data.business_type
            .replace(/^{|}$/g, "")
            .split(",")
            .map((service) => service.replace(/"/g, "").trim())
            .filter(Boolean);
        }

        setProfile({
          ...data,
          services,
          portfolio: Array.isArray(data.portfolio) ? data.portfolio : [],
          displayName:
            data.business_name ||
            data.username ||
            `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
            "Glossed user",
        });

        if (summaryResult.error) {
          console.warn("Unable to load public review summary:", summaryResult.error);
          setReviewSummary(EMPTY_REVIEW_SUMMARY);
        } else {
          setReviewSummary(summaryResult.data?.[0] || EMPTY_REVIEW_SUMMARY);
        }
      } catch (loadError) {
        if (!active) return;
        console.error("Unable to load public profile:", loadError);
        setProfile(null);
        setToast({ type: "error", message: "Error loading profile." });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [normalizedUserId]);

  const backButton = (
    <button
      type="button"
      onClick={() => navigate(-1)}
      className="inline-flex items-center gap-2 rounded-lg text-sm text-gray-500 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-200"
    >
      <ArrowLeft size={16} /> Back
    </button>
  );

  if (!normalizedUserId || !profile || loading) {
    return (
      <main className="mx-auto mt-10 max-w-4xl p-4">
        {backButton}
        <div className="flex h-48 flex-col items-center justify-center gap-3 text-gray-500">
          {loading && normalizedUserId ? (
            <>
              <Loader2 size={24} className="animate-spin" aria-hidden="true" />
              <span>Loading profile…</span>
            </>
          ) : (
            <>
              <AlertTriangle size={24} className="text-amber-500" aria-hidden="true" />
              <span>{normalizedUserId ? "Profile not found." : "Invalid profile link."}</span>
            </>
          )}
        </div>
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </main>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  const isProProfile = profile.role === "pro";

  return (
    <main className="mx-auto mt-10 max-w-4xl space-y-6 p-4">
      <div className="flex items-center justify-between gap-4">
        {backButton}
        {isOwnProfile && (
          <span className="rounded-full border border-rose-100 bg-rose-50 px-3 py-1 text-xs text-rose-600">
            This is your public profile
          </span>
        )}
      </div>

      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow sm:p-6">
        {isProProfile ? (
          <ProProfileView profile={profile} reviewSummary={reviewSummary} />
        ) : (
          <ClientProfileView profile={profile} />
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
