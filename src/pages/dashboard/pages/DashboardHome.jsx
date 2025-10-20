import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { Calendar, Clock, CheckCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function DashboardHome() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [counts, setCounts] = useState({
    pending: 0,
    offers: 0,
    confirmed: 0,
  });
  const [loading, setLoading] = useState(true);

  // 🔹 Photo de profil (avec cache local)
  const [profilePhoto, setProfilePhoto] = useState(null);

  // 🧠 Charger les réservations du client
  useEffect(() => {
    const fetchBookings = async () => {
      if (!user?.id) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("bookings")
        .select("status")
        .eq("client_id", user.id);

      if (error) {
        console.error("❌ Supabase error:", error.message);
        setLoading(false);
        return;
      }

      const grouped = {
        pending: data.filter((b) => b.status === "pending").length,
        offers: data.filter((b) => b.status === "offers").length,
        confirmed: data.filter((b) => b.status === "confirmed").length,
      };
      setCounts(grouped);
      setLoading(false);
    };

    fetchBookings();
  }, [user?.id]);

  // 📸 Charger la photo depuis Supabase ou le cache local
  useEffect(() => {
    if (!user?.id) return;

    const KEY = "glossed_client_photo";
    const cached = localStorage.getItem(KEY);

    if (cached) {
      setProfilePhoto(cached);
      return;
    }

    const fetchProfilePhoto = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("profile_photo")
        .eq("id", user.id)
        .single();

      if (!error && data?.profile_photo) {
        setProfilePhoto(data.profile_photo);
        localStorage.setItem(KEY, data.profile_photo);
      }
    };

    fetchProfilePhoto();
  }, [user?.id]);

  const firstName = user?.first_name || "there";

  return (
    <div className="mt-8 max-w-4xl mx-auto px-4 text-center space-y-10">
      {/* --- Header + photo --- */}
      <div className="flex flex-col items-center space-y-4">
        {profilePhoto ? (
          <img
            src={profilePhoto}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
            onError={(e) => (e.target.style.display = "none")}
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-3xl font-semibold shadow-lg">
            {firstName?.[0]?.toUpperCase() || "?"}
          </div>
        )}

        <h1 className="text-3xl font-bold text-gray-800">
          Welcome back, <span className="text-rose-600">{firstName}</span> 👋
        </h1>
        <p className="text-gray-500 max-w-md">
          Manage your bookings and discover new services in a few clicks.
        </p>
      </div>

      {/* --- Summary cards --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <DashboardCard
          title="Pending Requests"
          value={loading ? "…" : counts.pending}
          icon={<Clock className="text-amber-500" size={24} />}
          color="from-amber-400 to-amber-600"
          onClick={() => navigate("/dashboard/reservations#pending")}
        />

        <DashboardCard
          title="Offers Received"
          value={loading ? "…" : counts.offers}
          icon={<Sparkles className="text-rose-500" size={24} />}
          color="from-rose-400 to-rose-600"
          onClick={() => navigate("/dashboard/reservations#offers")}
        />

        <DashboardCard
          title="Confirmed Appointments"
          value={loading ? "…" : counts.confirmed}
          icon={<CheckCircle className="text-blue-500" size={24} />}
          color="from-blue-400 to-blue-600"
          onClick={() => navigate("/dashboard/reservations#confirmed")}
        />

        <DashboardCard
          title="Book a Service"
          icon={<Calendar className="text-green-500" size={24} />}
          color="from-green-400 to-green-600"
          onClick={() => navigate("/dashboard/new")}
          cta
        />
      </div>

      {/* --- CTA vers Account --- */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Your Account</h2>
        <p className="text-gray-500 text-sm mb-4">
          Update your personal information, payment details, and preferences.
        </p>
        <button
          onClick={() => navigate("/dashboard/account")}
          className="px-5 py-2 rounded-full font-medium bg-gradient-to-r from-rose-600 to-red-600 text-white hover:scale-[1.02] transition-transform"
        >
          Go to Account
        </button>
      </section>
    </div>
  );
}

// --- Card ---
function DashboardCard({ title, value, icon, color, onClick, cta = false }) {
  return (
    <div
      onClick={onClick}
      className={`cursor-pointer bg-gradient-to-r ${color} text-white rounded-2xl shadow-md hover:shadow-lg p-5 flex flex-col items-center justify-center transition-transform hover:scale-[1.03]`}
    >
      <div className="flex items-center gap-3 mb-2">
        {icon}
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      {cta ? (
        <span className="text-sm opacity-90 mt-1">Click to book now</span>
      ) : (
        <p className="text-3xl font-bold">{value}</p>
      )}
    </div>
  );
}
