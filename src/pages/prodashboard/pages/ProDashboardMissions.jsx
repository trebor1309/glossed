import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { CheckCircle, Clock, XCircle, Star, Eye, Bell } from "lucide-react";
import CalendarView from "@/components/CalendarView";
import Toast from "@/components/ui/Toast";

export default function ProDashboardMissions() {
  const { session, setProBadge } = useUser();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayMissions, setSelectedDayMissions] = useState(null);
  const [toast, setToast] = useState(null);

  // 🔹 Charger les missions du pro
  useEffect(() => {
    if (!session?.user) return;

    const fetchMissions = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("pro_id", session.user.id)
        .order("date", { ascending: true });

      if (!error && data) setMissions(data);
      setLoading(false);
    };

    fetchMissions();
  }, [session]);

  // 🔔 Écouter les nouvelles réservations en temps réel
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel("bookings-changes-pro")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "bookings",
          filter: `pro_id=eq.${session.user.id}`,
        },
        (payload) => {
          const newBooking = payload.new;
          setMissions((prev) => [newBooking, ...prev]);
          setProBadge((n) => (n || 0) + 1);
          setToast({
            message: "New booking request received!",
            type: "success",
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, setProBadge]);

  const displayMissions = selectedDayMissions ? selectedDayMissions.dayMissions : missions;

  const grouped = {
    pending: displayMissions.filter((m) => m.status === "pending"),
    confirmed: displayMissions.filter((m) => m.status === "confirmed"),
    completed: displayMissions.filter((m) => m.status === "completed"),
    cancelled: displayMissions.filter((m) => m.status === "cancelled"),
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-48 text-gray-600">
        Loading your missions...
      </div>
    );

  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-10 overflow-x-hidden">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">My Missions</h1>

      {/* ✅ Vue calendrier (même que client) */}
      <CalendarView
        bookings={missions}
        onSelectDay={(date, dayMissions) => {
          setSelectedDayMissions({ date, dayMissions });
        }}
      />

      {selectedDayMissions && (
        <div className="text-center text-gray-600 mb-4">
          <p className="text-sm">
            Showing missions for{" "}
            <span className="font-semibold text-gray-800">{selectedDayMissions.date}</span> (
            {selectedDayMissions.dayMissions.length} items)
          </p>
          <button
            onClick={() => setSelectedDayMissions(null)}
            className="mt-2 px-4 py-1.5 text-sm font-medium text-rose-600 border border-rose-200 rounded-full hover:bg-rose-50 transition"
          >
            Show all missions
          </button>
        </div>
      )}

      {/* ✅ Section par statut */}
      <MissionSection
        title="Pending Requests"
        icon={<Clock size={20} className="text-amber-500" />}
        color="text-amber-600"
        data={grouped.pending}
        empty="No pending requests."
      />

      <MissionSection
        title="Confirmed Appointments"
        icon={<CheckCircle size={20} className="text-blue-600" />}
        color="text-blue-600"
        data={grouped.confirmed}
        empty="No confirmed missions yet."
      />

      <MissionSection
        title="Completed Services"
        icon={<Star size={20} className="text-green-500" />}
        color="text-green-600"
        data={grouped.completed}
        empty="No completed missions yet."
      />

      <MissionSection
        title="Cancelled"
        icon={<XCircle size={20} className="text-gray-400" />}
        color="text-gray-400"
        data={grouped.cancelled}
        empty="No cancelled missions."
      />

      {/* ✅ Notification Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/* 🔸 Sous-composant section mission */
function MissionSection({ title, icon, data, color, empty }) {
  return (
    <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
        {icon} {title}
      </h2>

      {data.length ? (
        <ul className="divide-y divide-gray-100">
          {data.map((m) => (
            <li
              key={m.id}
              className="py-3 flex justify-between items-start hover:bg-gray-50 px-2 rounded-lg transition"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-800">{m.service}</p>
                <p className="text-sm text-gray-500">
                  {m.date} — {m.time_slot}
                </p>
                <p className="text-sm text-gray-500">{m.address}</p>
                {m.notes && <p className="text-xs text-gray-400 italic mt-1">“{m.notes}”</p>}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                  {m.status}
                </span>
                <button
                  className="p-2 rounded-full hover:bg-gray-100 text-rose-600"
                  title="View details"
                >
                  <Eye size={16} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm italic">{empty}</p>
      )}
    </section>
  );
}
