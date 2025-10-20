import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Clock, CheckCircle, DollarSign, Star } from "lucide-react";

export default function ProDashboardHome() {
  const navigate = useNavigate();
  const { session } = useUser();
  const proId = session?.user?.id;
  const proName = session?.user?.user_metadata?.name || "Professional";

  const [profilePhoto, setProfilePhoto] = useState(null);
  const [stats, setStats] = useState({
    pending: 0,
    confirmed: 0,
    completed: 0,
    payments: 0,
  });

  /* ----------------------------- 🧩 Photo de profil ----------------------------- */
  useEffect(() => {
    if (!proId) return;

    // Vérifie d’abord le cache local
    const cached = localStorage.getItem("glossed_pro_photo");
    if (cached) {
      setProfilePhoto(cached);
      return;
    }

    const fetchProfilePhoto = async () => {
      const { data, error } = await supabase
        .from("users")
        .select("profile_photo")
        .eq("id", proId)
        .single();

      if (!error && data?.profile_photo) {
        setProfilePhoto(data.profile_photo);
        localStorage.setItem("glossed_pro_photo", data.profile_photo);
      }
    };

    fetchProfilePhoto();
  }, [proId]);

  /* ----------------------------- 📊 Charger les stats ----------------------------- */
  useEffect(() => {
    if (!proId) return;

    const fetchStats = async () => {
      const [pending, confirmed, completed, payments] = await Promise.all([
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "pending"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "confirmed"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "completed"),
        supabase
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId),
      ]);

      setStats({
        pending: pending.count || 0,
        confirmed: confirmed.count || 0,
        completed: completed.count || 0,
        payments: payments.count || 0,
      });
    };

    fetchStats();
  }, [proId]);

  /* ----------------------------- 🔄 Realtime updates ----------------------------- */
  useEffect(() => {
    if (!proId) return;

    const bookingsChannel = supabase
      .channel("bookings-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `pro_id=eq.${proId}` },
        () => refreshStats()
      )
      .subscribe();

    const paymentsChannel = supabase
      .channel("payments-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `pro_id=eq.${proId}` },
        () => refreshStats()
      )
      .subscribe();

    const refreshStats = async () => {
      const [pending, confirmed, completed, payments] = await Promise.all([
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "pending"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "confirmed"),
        supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId)
          .eq("status", "completed"),
        supabase
          .from("payments")
          .select("*", { count: "exact", head: true })
          .eq("pro_id", proId),
      ]);

      setStats({
        pending: pending.count || 0,
        confirmed: confirmed.count || 0,
        completed: completed.count || 0,
        payments: payments.count || 0,
      });
    };

    // Nettoyage à la fermeture
    return () => {
      supabase.removeChannel(bookingsChannel);
      supabase.removeChannel(paymentsChannel);
    };
  }, [proId]);

  /* ----------------------------- 🧱 Cartes ----------------------------- */
  const cards = [
    {
      title: "Pending Requests",
      count: stats.pending,
      color: "from-amber-400 to-amber-500",
      icon: Clock,
      link: "/prodashboard/missions#pending",
    },
    {
      title: "Accepted Appointments",
      count: stats.confirmed,
      color: "from-blue-400 to-blue-500",
      icon: CheckCircle,
      link: "/prodashboard/missions#confirmed",
    },
    {
      title: "Completed Jobs",
      count: stats.completed,
      color: "from-green-400 to-green-500",
      icon: Star,
      link: "/prodashboard/missions#completed",
    },
    {
      title: "Recent Payments",
      count: stats.payments,
      color: "from-rose-400 to-red-500",
      icon: DollarSign,
      link: "/prodashboard/payments",
    },
  ];

  /* ----------------------------- 🎨 Rendu ----------------------------- */
  return (
    <section className="mt-10 max-w-6xl mx-auto px-4 sm:px-6 md:px-8 space-y-10">
      {/* 🔹 Welcome section */}
      <div className="text-center mb-6 flex flex-col items-center">
        <div className="relative mb-4">
          <div className="w-24 h-24 rounded-full bg-gradient-to-r from-rose-500 to-red-500 p-[2px]">
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={proName}
                className="w-full h-full rounded-full object-cover bg-white"
              />
            ) : (
              <div className="w-full h-full rounded-full bg-rose-100 flex items-center justify-center text-rose-600 font-bold text-xl">
                {proName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="absolute inset-0 -z-10 blur-xl bg-rose-200/40 rounded-full"></div>
        </div>

        <h1 className="text-2xl font-bold text-gray-800">
          Welcome back,{" "}
          <span className="text-rose-600">{proName.split(" ")[0]}</span> 
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Here’s a quick overview of your current activity.
        </p>
      </div>

      {/* 🔹 Cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map(({ title, count, color, icon: Icon, link }) => (
          <button
            key={title}
            onClick={() => navigate(link)}
            className={`group bg-gradient-to-r ${color} text-white rounded-2xl shadow-md hover:shadow-lg p-6 flex flex-col items-center justify-center transition-transform hover:scale-[1.03]`}
          >
            <Icon size={32} className="mb-3 opacity-90" />
            <h3 className="text-lg font-semibold text-white text-center">
              {title}
            </h3>
            <p className="text-2xl font-bold mt-2">{count}</p>
          </button>
        ))}
      </div>

      {/* 🔹 Profile summary */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 mt-8 text-center">
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          Your Profile at a Glance
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Keep your profile up to date to attract more clients and appear higher in search results.
        </p>
        <button
          onClick={() => navigate("/prodashboard/settings")}
          className="mt-4 px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow hover:shadow-md hover:scale-[1.02] transition-transform"
        >
          Go to Profile
        </button>
      </div>
    </section>
  );
}
