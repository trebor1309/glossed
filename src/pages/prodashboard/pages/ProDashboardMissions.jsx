// src/pages/prodashboard/pages/ProDashboardMissions.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { CheckCircle, Clock, XCircle, Star, Eye } from "lucide-react";
import CalendarView from "@/components/CalendarView";
import Toast from "@/components/ui/Toast";
import ProProposalModal from "@/components/modals/ProProposalModal";
import ProMissionDetailsModal from "@/components/modals/ProMissionDetailsModal";
import ProEvaluationModal from "@/components/modals/ProEvaluationModal";

/* ---------------------------------------------------------
   🧠 Utils
--------------------------------------------------------- */
const formatTime = (t) => (typeof t === "string" && t.includes(":") ? t.slice(0, 5) : t);

/* ---------------------------------------------------------
   🌸 Composant principal
--------------------------------------------------------- */
export default function ProDashboardMissions() {
  const { session, setProBadge } = useUser();
  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayMissions, setSelectedDayMissions] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);

  /* ---------------------------------------------------------
     1️⃣ Charger les bookings + missions liés à ce pro
  --------------------------------------------------------- */
  useEffect(() => {
    if (!session?.user?.id) return;

    const fetchMissions = async () => {
      setLoading(true);
      try {
        const proId = session.user.id;

        // 1️⃣ Bookings directement assignés au pro
        const { data: directBookings, error: directErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("pro_id", proId)
          .order("date", { ascending: true });
        if (directErr) throw directErr;

        // 2️⃣ Bookings reçus via notifications
        const { data: notifData, error: notifErr } = await supabase
          .from("booking_notifications")
          .select("booking_id")
          .eq("pro_id", proId);
        if (notifErr) throw notifErr;

        let notifiedBookings = [];
        if (notifData?.length) {
          const bookingIds = notifData.map((n) => n.booking_id);
          const { data, error } = await supabase
            .from("bookings")
            .select("*")
            .in("id", bookingIds)
            .eq("status", "pending")
            .order("date", { ascending: true });
          if (error) throw error;
          notifiedBookings = data || [];
        }

        // 3️⃣ Missions créées par le pro
        const { data: proMissions, error: missionsErr } = await supabase
          .from("missions")
          .select("*")
          .eq("pro_id", proId)
          .order("date", { ascending: true });
        if (missionsErr) throw missionsErr;

        // 4️⃣ Fusionner le tout
        const merged = [...directBookings, ...notifiedBookings, ...proMissions];
        setMissions(merged);
      } catch (err) {
        console.error("❌ fetchMissions error:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchMissions();
  }, [session?.user?.id]);

  /* ---------------------------------------------------------
     2️⃣ Écoute temps réel pour nouvelles demandes
  --------------------------------------------------------- */
  useEffect(() => {
    if (!session?.user?.id) return;

    const channel = supabase
      .channel("booking-notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_notifications",
          filter: `pro_id=eq.${session.user.id}`,
        },
        async (payload) => {
          const { booking_id } = payload.new;
          const { data: booking } = await supabase
            .from("bookings")
            .select("*")
            .eq("id", booking_id)
            .single();

          if (booking) {
            console.log("📩 New booking received via Realtime:", booking);
            setMissions((prev) => [booking, ...prev]);
            setProBadge((n) => (n || 0) + 1);
            setToast({ message: "📩 New booking request in your area!", type: "success" });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, setProBadge]);

  /* ---------------------------------------------------------
     3️⃣ Refuser une demande
  --------------------------------------------------------- */
  const handleRefuse = async (booking) => {
    try {
      await supabase
        .from("booking_notifications")
        .delete()
        .eq("booking_id", booking.id)
        .eq("pro_id", session.user.id);

      setMissions((prev) => prev.filter((m) => m.id !== booking.id));
      setToast({ message: "❌ Request removed from your list", type: "info" });
    } catch (err) {
      setToast({ message: `❌ ${err.message}`, type: "error" });
    }
  };

  /* ---------------------------------------------------------
     4️⃣ Regroupement par statut
  --------------------------------------------------------- */
  const displayMissions = selectedDayMissions ? selectedDayMissions.dayMissions : missions;

  const grouped = {
    pending: displayMissions.filter((m) => m.status === "pending"),
    proposed: displayMissions.filter((m) => m.status === "proposed"),
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

  /* ---------------------------------------------------------
     5️⃣ Rendu principal
  --------------------------------------------------------- */
  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-10 overflow-x-hidden">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">My Missions</h1>

      <CalendarView
        bookings={missions}
        onSelectDay={(date, dayMissions) => setSelectedDayMissions({ date, dayMissions })}
      />

      {selectedBooking && (
        <ProProposalModal
          booking={selectedBooking}
          session={session}
          onClose={() => setSelectedBooking(null)}
          onSuccess={(createdMission) => {
            setMissions((prev) => [
              createdMission,
              ...prev.filter((m) => m.id !== selectedBooking.id),
            ]);
            setSelectedBooking(null);
            setToast({ message: "Proposal sent!", type: "success" });
          }}
        />
      )}

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

      <MissionSection
        title="Pending Requests"
        icon={<Clock size={20} className="text-amber-500" />}
        color="text-amber-600"
        data={grouped.pending}
        empty="No pending requests."
        onOpenProposal={(b) => setSelectedBooking(b)}
        onRefuse={handleRefuse}
      />

      <MissionSection
        title="Proposals Sent"
        icon={<Clock size={20} className="text-rose-500" />}
        color="text-rose-600"
        data={grouped.proposed}
        empty="No proposals sent yet."
        setSelectedMission={setSelectedMission}
      />

      <MissionSection
        title="Confirmed Appointments"
        icon={<CheckCircle size={20} className="text-blue-600" />}
        color="text-blue-600"
        data={grouped.confirmed}
        empty="No confirmed missions yet."
        setSelectedMission={setSelectedMission}
      />

      <MissionSection
        title="Completed Services"
        icon={<Star size={20} className="text-green-500" />}
        color="text-green-600"
        data={grouped.completed}
        empty="No completed missions yet."
        setSelectedMission={setSelectedMission}
      />

      <MissionSection
        title="Cancelled"
        icon={<XCircle size={20} className="text-gray-400" />}
        color="text-gray-400"
        data={grouped.cancelled}
        empty="No cancelled missions."
        setSelectedMission={setSelectedMission}
      />

      {selectedMission && (
        <ProMissionDetailsModal
          booking={selectedMission}
          onClose={() => setSelectedMission(null)}
          onChat={(b) => console.log("💬 Open chat with client:", b.client_id)}
          onEvaluate={(b) => setSelectedEvaluation(b)}
        />
      )}

      {selectedEvaluation && (
        <ProEvaluationModal
          booking={selectedEvaluation}
          onClose={() => setSelectedEvaluation(null)}
          onSuccess={() => {
            setSelectedEvaluation(null);
            setToast({
              message: "⭐ Review submitted successfully!",
              type: "success",
            });
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/* ---------------------------------------------------------
   🔸 Sous-composant : MissionSection
--------------------------------------------------------- */
function MissionSection({
  title,
  icon,
  data,
  color,
  empty,
  onOpenProposal,
  onRefuse,
  setSelectedMission,
}) {
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
                  {m.date} — {m.time_slot || formatTime(m.time) || ""}
                </p>
                {typeof m.price !== "undefined" && (
                  <p className="text-sm text-gray-700 font-medium">
                    € {Number(m.price).toFixed(2)}
                  </p>
                )}
                {m.address && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Address:</span> {m.address}
                  </p>
                )}
                {m.notes && <p className="text-xs text-gray-400 italic mt-1">“{m.notes}”</p>}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                  {m.status}
                </span>

                {m.status === "pending" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onOpenProposal && onOpenProposal(m)}
                      className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-full hover:bg-rose-700 transition"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => onRefuse && onRefuse(m)}
                      className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-full hover:bg-gray-300 transition"
                    >
                      Refuse
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setSelectedMission && setSelectedMission(m)}
                    className="p-2 rounded-full hover:bg-gray-100 text-rose-600"
                    title="View details"
                  >
                    <Eye size={16} />
                  </button>
                )}
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
