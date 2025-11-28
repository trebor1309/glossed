// 📄 src/pages/profile/UserPublicProfile.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { ArrowLeft, Loader2, AlertTriangle } from "lucide-react";

import ProProfileView from "./ProProfileView";
import ClientProfileView from "./ClientProfileView";
import ProfilePortfolio from "./ProfilePortfolio";
import ProfileReviews from "./ProfileReviews";
import ProfileMap from "./ProfileMap";

import Toast from "@/components/ui/Toast";

export default function UserPublicProfile() {
  const { user_id } = useParams();
  const navigate = useNavigate();
  const { user: currentUser } = useUser();

  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!user_id) return;

    const loadProfile = async () => {
      setLoading(true);
      try {
        // 1️⃣ Charger le user
        const { data, error } = await supabase
          .from("users")
          .select(
            `
            id,
            email,
            role,
            username,
            first_name,
            last_name,
            business_name,
            description,
            profile_photo,
            portfolio,
            business_type,
            latitude,
            longitude,
            radius_km,
            city,
            country
          `
          )
          .eq("id", user_id)
          .maybeSingle();

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
          const { data: reviewRows, error: reviewError } = await supabase
            .from("reviews")
            .select("*")
            .or(`pro_id.eq.${user_id},client_id.eq.${user_id}`)
            .order("created_at", { ascending: false });

          if (reviewError) {
            console.warn("⚠️ reviews load error:", reviewError.message);
          } else if (reviewRows) {
            setReviews(reviewRows);
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
  }, [user_id]);

  // 🧱 états intermédiaires
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
