import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Clock, CheckCircle, Bell } from "lucide-react";

export default function DashboardHome() {
  const { session } = useUser();
  const [stats, setStats] = useState({ pending: 0, offers: 0, confirmed: 0 });

  useEffect(() => {
    if (!session?.user) return;

    const fetchStats = async () => {
      const { data } = await supabase
        .from("bookings")
        .select("status")
        .eq("client_id", session.user.id);
      if (!data) return;

      const grouped = data.reduce(
        (acc, b) => ({ ...acc, [b.status]: (acc[b.status] || 0) + 1 }),
        {}
      );
      setStats(grouped);
    };

    fetchStats();
  }, [session]);

  return (
    <div className="mt-10 max-w-4xl mx-auto p-4 text-center">
      <h1 className="text-3xl font-bold text-gray-800 mb-3">Welcome back 👋</h1>
      <p className="text-gray-600 mb-8">Here’s a quick overview of your bookings and offers.</p>

      <div className="grid md:grid-cols-3 gap-6">
        <StatCard
          icon={<Clock size={22} className="text-amber-500" />}
          label="Pending"
          value={stats.pending || 0}
        />
        <StatCard
          icon={<Bell size={22} className="text-red-500" />}
          label="Offers to review"
          value={stats.offers || 0}
        />
        <StatCard
          icon={<CheckCircle size={22} className="text-green-500" />}
          label="Confirmed"
          value={stats.confirmed || 0}
        />
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="p-6 bg-white rounded-2xl shadow hover:shadow-md transition">
      <div className="flex flex-col items-center justify-center">
        <div className="mb-2">{icon}</div>
        <h3 className="text-lg font-semibold text-gray-800">{label}</h3>
        <p className="text-2xl font-bold text-rose-600 mt-2">{value}</p>
      </div>
    </div>
  );
}
