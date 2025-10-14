// 📄 src/pages/prodashboard/pages/ProDashboardHome.jsx
import { useEffect, useState } from "react";
import { Calendar, CheckCircle, Clock, DollarSign } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import CalendarView from "react-calendar";
import "react-calendar/dist/Calendar.css";

export default function ProDashboardHome() {
  const { user } = useUser();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    fetchMissions();
  }, [user]);

  async function fetchMissions() {
    setLoading(true);
    const { data, error } = await supabase
      .from("missions")
      .select(
        `
        id,
        service,
        description,
        date,
        price,
        status,
        client:client_id (name, email)
      `
      )
      .eq("pro_id", user.id)
      .order("date", { ascending: true });

    if (error) console.error("Erreur chargement missions:", error);
    else setMissions(data || []);
    setLoading(false);
  }

  // 🧮 Statistiques
  const pending = missions.filter((m) => m.status === "pending");
  const accepted = missions.filter((m) => m.status === "accepted");
  const completed = missions.filter((m) => m.status === "completed");
  const totalEarnings = completed.reduce((sum, m) => sum + (m.price || 0), 0);

  return (
    <section className="space-y-8">
      <h1 className="text-2xl font-semibold text-gray-800 mb-4">
        Welcome back, {user?.email?.split("@")[0]} 👋
      </h1>

      {/* 📊 Statistiques */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat
          icon={Clock}
          color="text-amber-500"
          value={pending.length}
          label="Pending"
        />
        <Stat
          icon={Calendar}
          color="text-rose-600"
          value={accepted.length}
          label="Accepted"
        />
        <Stat
          icon={CheckCircle}
          color="text-green-500"
          value={completed.length}
          label="Completed"
        />
        <Stat
          icon={DollarSign}
          color="text-rose-600"
          value={`€${totalEarnings}`}
          label="Total Earned"
        />
      </div>

      {/* ⏳ Missions à venir */}
      <Card title="Upcoming Missions">
        {loading ? (
          <p className="text-gray-500">Loading missions...</p>
        ) : accepted.length === 0 ? (
          <p className="text-gray-500">No upcoming missions.</p>
        ) : (
          <ul className="space-y-3">
            {accepted.map((m) => (
              <li
                key={m.id}
                className="flex justify-between items-center border-b border-gray-100 pb-2"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {m.client?.name || m.client?.email}
                  </p>
                  <p className="text-sm text-gray-500">
                    {m.service} —{" "}
                    {new Date(m.date).toLocaleDateString(undefined, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
                <span className="text-rose-600 font-semibold cursor-pointer hover:underline">
                  View
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 🗓️ Calendrier des missions */}
      <Card title="Calendar">
        <CalendarView
          value={new Date()}
          tileContent={({ date }) => {
            const hasMission = missions.some(
              (m) =>
                new Date(m.date).toDateString() === date.toDateString() &&
                m.status !== "cancelled"
            );
            return hasMission ? (
              <span className="text-rose-500 font-bold">•</span>
            ) : null;
          }}
        />
      </Card>
    </section>
  );
}

function Stat({ icon: Icon, color, value, label }) {
  return (
    <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
      <Icon className={`${color} mb-2`} size={24} />
      <span className="text-2xl font-bold">{value}</span>
      <p className="text-gray-500 text-sm">{label}</p>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 text-gray-800">{title}</h2>
      {children}
    </div>
  );
}
