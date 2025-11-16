// 📄 src/pages/prodashboard/pages/ProDashboardMissions.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNotifications } from "@/context/NotificationContext";
import { CheckCircle, Clock, XCircle, Star, Eye } from "lucide-react";

import CalendarView from "@/components/CalendarView";
import Toast from "@/components/ui/Toast";

import ProProposalModal from "@/components/modals/ProProposalModal";
import ProMissionDetailsModal from "@/components/modals/ProMissionDetailsModal";
import ProEvaluationModal from "@/components/modals/ProEvaluationModal";
import ProBookingDetailsModal from "@/components/modals/ProBookingDetailsModal";

const formatTime = (t) => (typeof t === "string" && t.includes(":") ? t.slice(0, 5) : "");

export default function ProDashboardMissions() {
  const { session, setProBadge } = useUser();
  const { notifications } = useNotifications();

  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayMissions, setSelectedDayMissions] = useState(null);
  const [toast, setToast] = useState(null);

  const [selectedView, setSelectedView] = useState(null);
  const [proposalTarget, setProposalTarget] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);

  /* ------------------------------------------------------------------
     📌 Fonction principale : charger toutes les missions liées au pro
  ------------------------------------------------------------------ */
  const fetchMissions = async () => {
    setLoading(true);
    try {
      const proId = session.user.id;

      // BOOKINGS directs reçus
      const { data: directBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("pro_id", proId)
        .order("date", { ascending: true });

      // Notifications reçues
      const { data: notifData } = await supabase
        .from("booking_notifications")
        .select("booking_id")
        .eq("pro_id", proId);

      let notifiedBookings = [];
      if (notifData?.length) {
        const bookingIds = notifData.map((n) => n.booking_id);
        const { data } = await supabase
          .from("bookings")
          .select("*")
          .in("id", bookingIds)
          .eq("status", "pending")
          .order("date", { ascending: true });
        notifiedBookings = data || [];
      }

      // Missions
      const { data: proMissions } = await supabase
        .from("missions")
        .select("*")
        .eq("pro_id", proId)
        .order("date", { ascending: true });

      const missionsWithNet = (proMissions || []).map((m) => ({
        ...m,
        net_amount: Math.round(m.price * 0.9 * 100) / 100,
      }));

      // Nettoyer doublons : bookings déjà confirmés
      const confirmedBookingIds = missionsWithNet
        .filter((m) => m.status === "confirmed")
        .map((m) => m.booking_id);

      const cleanedBookings = directBookings.filter((b) => !confirmedBookingIds.includes(b.id));

      // Fusion finalisée
      const finalList = [...cleanedBookings, ...notifiedBookings, ...missionsWithNet];

      setMissions(finalList);
      setProBadge(notifications.proBookings || 0);
    } catch (err) {
      console.error("❌ fetchMissions error:", err);
      setToast({ message: `❌ ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------------------------
     🔁 Initialisation + Réaction aux events globaux
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (!session?.user?.id) return;
    fetchMissions();

    // Écoute globale du NotificationContext
    const handler = () => {
      fetchMissions();
    };

    window.addEventListener("supabase-update", handler);

    return () => {
      window.removeEventListener("supabase-update", handler);
    };
  }, [session?.user?.id]);

  /* ------------------------------------------------------------------
     ❌ Supprimer une demande
  ------------------------------------------------------------------ */
  const handleDelete = async (booking) => {
    try {
      await supabase
        .from("booking_notifications")
        .delete()
        .eq("booking_id", booking.id)
        .eq("pro_id", session.user.id);

      setToast({ message: "❌ Request deleted", type: "info" });
      fetchMissions();
    } catch (err) {
      setToast({ message: `❌ ${err.message}`, type: "error" });
    }
  };

  /* ------------------------------------------------------------------
     🧮 Regroupement propre
  ------------------------------------------------------------------ */
  const displayMissions = selectedDayMissions ? selectedDayMissions.dayMissions : missions;

  const grouped = {
    pending: displayMissions.filter((m) => m.status === "pending"),
    proposed: displayMissions.filter((m) => m.status === "proposed"),
    confirmed: displayMissions.filter((m) => m.status === "confirmed"),
    completed: displayMissions.filter((m) => m.status === "completed"),
    cancelled: displayMissions.filter((m) => m.status === "cancelled"),
  };

  if (loading)
    return <div className="flex justify-center items-center h-48 text-gray-600">Loading...</div>;

  /* ------------------------------------------------------------------
     🎨 Rendu
  ------------------------------------------------------------------ */
  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-10 overflow-x-hidden">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">My Missions</h1>

      <CalendarView
        bookings={missions}
        onSelectDay={(date, dayMissions) => setSelectedDayMissions({ date, dayMissions })}
      />

      {/* VIEW modal */}
      {selectedView && (
        <ProBookingDetailsModal
          booking={selectedView}
          onClose={() => setSelectedView(null)}
          onMakeProposal={(b) => {
            setSelectedView(null);
            setProposalTarget(b);
          }}
          onDelete={handleDelete}
        />
      )}

      {/* PROPOSAL modal */}
      {proposalTarget && (
        <ProProposalModal
          booking={proposalTarget}
          session={session}
          onClose={() => setProposalTarget(null)}
          onSuccess={() => {
            setProposalTarget(null);
            setToast({ message: "Proposal sent!", type: "success" });
            fetchMissions();
          }}
        />
      )}

      {/* MISSION DETAILS modal */}
      {selectedMission && (
        <ProMissionDetailsModal
          booking={selectedMission}
          onClose={() => setSelectedMission(null)}
          onEvaluate={(b) => setSelectedEvaluation(b)}
        />
      )}

      {/* EVALUATE modal */}
      {selectedEvaluation && (
        <ProEvaluationModal
          booking={selectedEvaluation}
          onClose={() => setSelectedEvaluation(null)}
          onSuccess={() => {
            setSelectedEvaluation(null);
            setToast({ message: "⭐ Review submitted!", type: "success" });
          }}
        />
      )}

      {/* SECTIONS */}
      <MissionSection
        title="Pending Requests"
        icon={<Clock size={20} className="text-amber-500" />}
        color="text-amber-600"
        data={grouped.pending}
        empty="No pending requests."
        onView={(b) => setSelectedView(b)}
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

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/* ------------------------------------------------------------------
   🔹 MissionSection (inchangé mais optimisé)
------------------------------------------------------------------ */
function MissionSection({ title, icon, data, color, empty, onView, setSelectedMission }) {
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
                {m.address && (
                  <p className="text-sm text-gray-500">
                    <span className="font-medium">Address:</span> {m.address}
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                  {m.status}
                </span>

                {m.status === "pending" ? (
                  <button
                    onClick={() => onView?.(m)}
                    className="px-3 py-1.5 text-sm bg-rose-600 text-white rounded-full hover:bg-rose-700 transition"
                  >
                    View
                  </button>
                ) : (
                  <button
                    onClick={() => setSelectedMission?.(m)}
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
