// 📄 src/pages/prodashboard/pages/ProDashboardHome.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Clock, CheckCircle, DollarSign, Star } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function ProDashboardHome() {
  const navigate = useNavigate();
  const { user } = useUser();

  const proId = user?.id;
  const firstName = user?.first_name || user?.business_name || "there";

  const [profilePhoto, setProfilePhoto] = useState(user?.profile_photo || null);
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({
    pending: 0,
    confirmed: 0,
    completed: 0,
    payments: 0,
  });

  /* ---------------------------------------------------------
     📸 Load photo de profil avec cache local
  --------------------------------------------------------- */
  useEffect(() => {
    if (!proId) return;

    const KEY = "glossed_pro_photo";
    const cached = localStorage.getItem(KEY);

    if (cached) {
      setProfilePhoto(cached);
      return;
    }

    supabase
      .from("users")
      .select("profile_photo")
      .eq("id", proId)
      .single()
      .then(({ data }) => {
        if (data?.profile_photo) {
          setProfilePhoto(data.profile_photo);
          localStorage.setItem(KEY, data.profile_photo);
        }
      });
  }, [proId]);

  /* ---------------------------------------------------------
     📊 fetchStats() — version propre et unifiée
  --------------------------------------------------------- */
  const fetchStats = async () => {
    if (!proId) return;

    try {
      // 🔥 pending = booking_notifications
      const { data: pendingNotifs } = await supabase
        .from("booking_notifications")
        .select("id")
        .eq("pro_id", proId);

      // 🔥 missions du pro
      const { data: missions } = await supabase
        .from("missions")
        .select("status")
        .eq("pro_id", proId);

      const pending = pendingNotifs?.length || 0;
      const confirmed = missions?.filter((m) => m.status === "confirmed").length || 0;
      const completed = missions?.filter((m) => m.status === "completed").length || 0;

      // Paiements = missions confirmées
      const payments = confirmed;

      setStats({ pending, confirmed, completed, payments });
    } catch (err) {
      console.error("❌ fetchStats error:", err.message);
    }
  };

  /* ---------------------------------------------------------
     🔁 Realtime synchronisé
  --------------------------------------------------------- */
  useEffect(() => {
    if (!proId) return;
    fetchStats();

    const channel = supabase
      .channel(`pro_realtime_home_${proId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_notifications",
          filter: `pro_id=eq.${proId}`,
        },
        () => {
          setToast({
            type: "success",
            message: "📩 New booking request received!",
          });
          fetchStats();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "missions",
          filter: `pro_id=eq.${proId}`,
        },
        (payload) => {
          if (payload.new.status === "confirmed") {
            setToast({
              type: "success",
              message: "💰 A client confirmed & paid your proposal!",
            });
            fetchStats();
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [proId]);

  /* ---------------------------------------------------------
     🧱 Cartes du dashboard (même design client)
  --------------------------------------------------------- */
  const cards = [
    {
      title: "Pending Requests",
      count: stats.pending,
      color: "from-amber-400 to-amber-600",
      icon: Clock,
      link: "/prodashboard/missions#pending",
    },
    {
      title: "Confirmed Jobs",
      count: stats.confirmed,
      color: "from-blue-400 to-blue-600",
      icon: CheckCircle,
      link: "/prodashboard/missions#confirmed",
    },
    {
      title: "Completed Services",
      count: stats.completed,
      color: "from-green-400 to-green-600",
      icon: Star,
      link: "/prodashboard/missions#completed",
    },
    {
      title: "Recent Payments",
      count: stats.payments,
      color: "from-rose-400 to-red-600",
      icon: DollarSign,
      link: "/prodashboard/payments",
    },
  ];

  /* ---------------------------------------------------------
     🎨 UI
  --------------------------------------------------------- */
  return (
    <section className="mt-10 max-w-4xl mx-auto px-4 sm:px-6 md:px-8 space-y-10">
      {/* Header */}
      <div className="text-center mb-6 flex flex-col items-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-r from-rose-500 to-red-500 p-[2px]">
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={firstName}
                className="w-full h-full rounded-full object-cover bg-white"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-xl">
                {firstName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="absolute inset-0 -z-10 blur-xl bg-rose-200/40 rounded-full"></div>
        </div>

        <h1 className="text-2xl font-bold text-gray-800">
          Welcome back, <span className="text-rose-600">{firstName}</span> 👋
        </h1>
        <p className="text-gray-500 text-sm mt-1">Here’s your current activity overview.</p>
      </div>

      {/* Cards — SAME SIZE AS CLIENT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(({ title, count, color, icon: Icon, link }) => (
          <button
            key={title}
            onClick={() => navigate(link)}
            className={`cursor-pointer bg-gradient-to-r ${color} text-white rounded-2xl shadow-md hover:shadow-lg p-5 flex flex-col items-center justify-center transition-transform hover:scale-[1.03]`}
          >
            <div className="flex items-center gap-3 mb-2">
              <Icon size={24} />
              <h3 className="font-semibold text-lg">{title}</h3>
            </div>
            <p className="text-3xl font-bold">{count}</p>
          </button>
        ))}
      </div>

      {/* Profile summary */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 mt-8 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Your Profile</h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Update your business details to attract more clients.
        </p>
        <button
          onClick={() => navigate("/prodashboard/settings")}
          className="mt-4 px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow hover:shadow-md hover:scale-[1.02] transition-transform"
        >
          Go to Profile
        </button>
      </div>

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </section>
  );
}
