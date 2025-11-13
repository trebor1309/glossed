// src/pages/dashboard/pages/DashboardHome.jsx
import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { Calendar, Clock, CheckCircle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Toast from "@/components/ui/Toast";

export default function DashboardHome() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [counts, setCounts] = useState({ pending: 0, offers: 0, confirmed: 0 });
  const [loading, setLoading] = useState(true);
  const [profilePhoto, setProfilePhoto] = useState(null);
  const [toast, setToast] = useState(null);

  /* ------------------------------------ 📊 Charger stats (corrigé) ------------------------------------ */
  const fetchStats = async () => {
    if (!user?.id) return;
    setLoading(true);

    // Bookings du client
    const { data: bookings, error: bErr } = await supabase
      .from("bookings")
      .select("id, status")
      .eq("client_id", user.id);

    if (bErr) {
      console.error("❌ Bookings fetch error:", bErr.message);
      setLoading(false);
      return;
    }

    // Missions du client
    const { data: missions, error: mErr } = await supabase
      .from("missions")
      .select("id, status, booking_id")
      .eq("client_id", user.id);

    if (mErr) {
      console.error("❌ Missions fetch error:", mErr.message);
      setLoading(false);
      return;
    }

    const pendingBookings = bookings.filter((b) => b.status === "pending");
    const pending = pendingBookings.filter(
      (b) => !missions.some((m) => m.booking_id === b.id)
    ).length;

    const offers = missions.filter((m) => m.status === "proposed").length;
    const confirmed = missions.filter((m) => m.status === "confirmed").length;

    setCounts({ pending, offers, confirmed });
    setLoading(false);
  };

  /* ------------------------------------ 🔁 Realtime notifications ------------------------------------ */
  useEffect(() => {
    if (!user?.id) return;
    fetchStats();

    const clientId = user.id;
    const channel = supabase
      .channel(`client_realtime_${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "missions",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          if (payload.new.status === "proposed") {
            setToast({ type: "success", message: "💌 New offer received from a professional!" });
            fetchStats();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "missions",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          if (payload.new.status === "confirmed") {
            setToast({ type: "success", message: "✅ Your booking has been confirmed and paid!" });
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  /* ------------------------------------ 📸 Photo profil ------------------------------------ */
  useEffect(() => {
    if (!user?.id) return;

    const KEY = "glossed_client_photo";
    const cached = localStorage.getItem(KEY);
    if (cached) return setProfilePhoto(cached);

    supabase
      .from("users")
      .select("profile_photo")
      .eq("id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.profile_photo) {
          setProfilePhoto(data.profile_photo);
          localStorage.setItem(KEY, data.profile_photo);
        }
      });
  }, [user?.id]);

  const firstName = user?.first_name || "there";

  /* ------------------------------------ 🎨 UI ------------------------------------ */
  return (
    <div className="mt-8 max-w-4xl mx-auto px-4 text-center space-y-10">
      {/* Header */}
      <div className="flex flex-col items-center space-y-4">
        {profilePhoto ? (
          <img
            src={profilePhoto}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg"
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

      {/* Cards */}
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

      {/* Account */}
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

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
}

/* --- Card --- */
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
