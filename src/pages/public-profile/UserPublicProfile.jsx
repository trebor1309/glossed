// 📄 src/pages/profile/UserPublicProfile.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

import ProProfileView from "./ProProfileView";
import ClientProfileView from "./ClientProfileView";
import Toast from "@/components/ui/Toast";

export default function UserPublicProfile() {
  const { user_id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useUser();

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  // 🔒 Normalisation de l'ID (évite "undefined", "null", etc.)
  const normalizedUserId = useMemo(() => {
    if (!user_id) return null;
    if (user_id === "undefined" || user_id === "null") return null;
    return user_id;
  }, [user_id]);

  useEffect(() => {
    // Si l'ID est invalide → on ne touche pas à Supabase
    if (!normalizedUserId) {
      setLoading(false);
      setProfile(null);
      return;
    }

    const loadProfile = async () => {
      setLoading(true);
      try {
        // 1️⃣ Charger le user
        const { data: profileRows, error } = await supabase.rpc("get_public_profile", {
          p_user_id: normalizedUserId,
        });
        const data = profileRows?.[0] || null;

        if (error) {
          console.error("❌ loadProfile error:", error.message);
          setToast({ type: "error", message: "Error loading profile." });
          setLoading(false);
          return;
        }

        if (!data) {
          setToast({ type: "error", message: "Profile not found." });
          setLoading(false);
          return;
        }

        // 2️⃣ Normaliser services (business_type) → array propre
        let services = [];
        try {
          if (Array.isArray(data.business_type)) {
            services = data.business_type;
          } else if (typeof data.business_type === "string") {
            if (data.business_type.startsWith("{")) {
              services = data.business_type
                .replace(/^{|}$/g, "")
                .split(",")
                .map((s) => s.replace(/"/g, "").trim())
                .filter(Boolean);
            } else {
              services = data.business_type
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean);
            }
          }
        } catch (e) {
          console.warn("⚠️ Impossible de parser business_type pour le profil:", e);
        }

        const normalizedProfile = {
          ...data,
          services,
          portfolio: Array.isArray(data.portfolio) ? data.portfolio : [],
          displayName:
            data.business_name ||
            data.username ||
            `${data.first_name || ""} ${data.last_name || ""}`.trim() ||
            "Glossed user",
        };

        setProfile(normalizedProfile);

        // 3️⃣ Charger les reviews (pro ou client)
        try {
          const { data: reviewRows, error: reviewError } = await supabase.rpc(
            "get_public_reviews",
            { p_target_id: normalizedUserId }
          );

          if (reviewError) {
            console.warn("⚠️ reviews load error:", reviewError.message);
          } else if (reviewRows) {
            setReviews(
              reviewRows.map((review) => ({
                ...review,
                reviewer: {
                  username: review.reviewer_username,
                  profile_photo: review.reviewer_profile_photo,
                },
              }))
            );
          }
        } catch (e) {
          console.warn("⚠️ reviews table seems missing or inaccessible:", e.message);
        }

        setLoading(false);
      } catch (err) {
        console.error("❌ Unexpected loadProfile error:", err);
        setToast({ type: "error", message: "Unexpected error while loading profile." });
        setLoading(false);
      }
    };

    loadProfile();
  }, [normalizedUserId]);

  // 🧱 états intermédiaires
  if (!normalizedUserId) {
    return (
      <main className="max-w-4xl mx-auto mt-10 p-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
          <AlertTriangle size={24} className="text-amber-500" />
          <span>Invalid profile link.</span>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto mt-10 p-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading profile…</span>
        </div>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="max-w-4xl mx-auto mt-10 p-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 mb-4"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex flex-col items-center justify-center h-48 text-gray-500 gap-3">
          <AlertTriangle size={24} className="text-amber-500" />
          <span>Profile not found.</span>
        </div>
      </main>
    );
  }

  const isOwnProfile = currentUser?.id === profile.id;
  const isProProfile = profile.role === "pro";

  return (
    <main className="max-w-4xl mx-auto mt-10 p-4 space-y-6">
      {/* Header / back / info mini */}
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800"
        >
          <ArrowLeft size={16} /> Back
        </button>

        {isOwnProfile && (
          <span className="text-xs px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-100">
            This is your public profile
          </span>
        )}
      </div>

      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        {isProProfile ? (
          <ProProfileView profile={profile} reviews={reviews} />
        ) : (
          <ClientProfileView profile={profile} reviews={reviews} />
        )}
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
