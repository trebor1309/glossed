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

// Petit helper pour trier
const buildDate = (item) => {
  if (!item?.date) return null;
  const d = new Date(item.date);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

export default function ProDashboardMissions() {
  const { session, setProBadge } = useUser();
  const { notifications } = useNotifications();

  const [missions, setMissions] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDayMissions, setSelectedDayMissions] = useState(null);
  const [sortBy, setSortBy] = useState("date_upcoming");

  const [toast, setToast] = useState(null);

  const [selectedView, setSelectedView] = useState(null);
  const [proposalTarget, setProposalTarget] = useState(null);
  const [selectedMission, setSelectedMission] = useState(null);
  const [selectedEvaluation, setSelectedEvaluation] = useState(null);

  // NEW badges pour nouvelles demandes (booking_notifications)
  const [newItems, setNewItems] = useState(() => new Set());

  /* ------------------------------------------------------------------
     📌 Charger toutes les missions liées au pro
  ------------------------------------------------------------------ */
  const fetchMissions = async () => {
    setLoading(true);
    try {
      const proId = session.user.id;

      // 1️⃣ BOOKINGS directs
      const { data: directBookings, error: directErr } = await supabase
        .from("bookings")
        .select("*")
        .eq("pro_id", proId)
        .order("date", { ascending: true });

      if (directErr) throw directErr;

      // 2️⃣ Notifications (zone / rayon)
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

      // 3️⃣ Missions
      const { data: proMissions, error: missionsErr } = await supabase
        .from("missions")
        .select("*")
        .eq("pro_id", proId)
        .in("status", [
          "pending",
          "proposed",
          "confirmed",
          "completed",
          "cancelled",
          "cancel_requested",
        ])
        .order("date", { ascending: true });

      if (missionsErr) throw missionsErr;

      const missionsWithNet = (proMissions || []).map((m) => ({
        ...m,
        net_amount: Math.round(m.price * 0.9 * 100) / 100, // 10% fee Glossed
      }));

      // 4️⃣ Ne pas montrer de bookings déjà confirmés ou cancel_requested
      const confirmedBookingIds = missionsWithNet
        .filter((m) => m.status === "confirmed" || m.status === "cancel_requested")
        .map((m) => m.booking_id);

      const cleanedBookings = (directBookings || []).filter(
        (b) => !confirmedBookingIds.includes(b.id)
      );

      // 5️⃣ Taguer les sources
      const taggedDirect = (cleanedBookings || []).map((b) => ({
        ...b,
        type: "booking",
      }));

      const taggedNotified = (notifiedBookings || []).map((b) => ({
        ...b,
        type: "booking",
      }));

      const taggedMissions = (missionsWithNet || []).map((m) => ({
        ...m,
        type: "mission",
      }));

      const finalList = [...taggedDirect, ...taggedNotified, ...taggedMissions];

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
     🔁 Initialisation + écoute des events globaux
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (!session?.user?.id) return;

    fetchMissions();

    const handler = (event) => {
      const detail = event?.detail || {};
      const { table, action, payload } = detail;

      // 📩 Nouvelle demande via booking_notifications → badge NEW
      if (
        table === "booking_notifications" &&
        action === "INSERT" &&
        payload?.new?.pro_id === session.user.id
      ) {
        const bookingId = payload.new.booking_id;
        if (bookingId) {
          setNewItems((prev) => {
            const next = new Set(prev);
            next.add(`booking_${bookingId}`);
            return next;
          });
        }
      }

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
     🧮 Tri + Regroupement par statut
  ------------------------------------------------------------------ */
  const sortMissions = (list) => {
    const arr = [...list];

    return arr.sort((a, b) => {
      if (sortBy === "created_newest") {
        const da = new Date(a.created_at || a.inserted_at || a.date || 0);
        const db = new Date(b.created_at || b.inserted_at || b.date || 0);
        return db.getTime() - da.getTime();
      }

      const da = buildDate(a) || new Date(0);
      const db = buildDate(b) || new Date(0);
      return da.getTime() - db.getTime();
    });
  };

  const sourceList = selectedDayMissions ? selectedDayMissions.dayMissions : missions;

  const grouped = {
    pending: sortMissions(sourceList.filter((m) => m.status === "pending")),
    proposed: sortMissions(sourceList.filter((m) => m.status === "proposed")),
    confirmed: sortMissions(
      sourceList.filter((m) => m.status === "confirmed" || m.status === "cancel_requested")
    ),
    completed: sortMissions(sourceList.filter((m) => m.status === "completed")),
    cancelled: sortMissions(sourceList.filter((m) => m.status === "cancelled")),
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48 text-gray-600">Loading...</div>;
  }

  /* ------------------------------------------------------------------
     🎨 Rendu
  ------------------------------------------------------------------ */
  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-8 overflow-x-hidden">
      {/* Header + Sort */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 text-center sm:text-left">My Missions</h1>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-200 rounded-full px-3 py-1.5 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="date_upcoming">Date – upcoming first</option>
            <option value="created_newest">Most recent requests</option>
          </select>
        </div>
      </div>

      {/* Calendrier */}
      <CalendarView
        bookings={missions}
        onSelectDay={(date, dayMissions) => setSelectedDayMissions({ date, dayMissions })}
      />

      {/* Info sur le jour sélectionné */}
      {selectedDayMissions && (
        <div className="text-center text-gray-600 mb-2">
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
        onView={(b) => {
          setSelectedView(b);
          setNewItems((prev) => {
            const next = new Set(prev);
            next.delete(`booking_${b.id}`);
            return next;
          });
        }}
        newItems={newItems}
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
   🔹 MissionSection
------------------------------------------------------------------ */
function MissionSection({ title, icon, data, color, empty, onView, setSelectedMission, newItems }) {
  return (
    <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
        {icon} {title}
      </h2>

      {data.length ? (
        <ul className="divide-y divide-gray-100">
          {data.map((m) => {
            const isNew = newItems?.has(`booking_${m.id}`) && m.status === "pending";
            const isCancelRequested = m.status === "cancel_requested";

            return (
              <li
                key={`${m.type || "item"}-${m.id}`}
                className="py-3 flex justify-between items-start hover:bg-gray-50 px-2 rounded-lg transition relative"
              >
                {/* Badge NEW */}
                {isNew && (
                  <span className="absolute top-2 right-2 bg-rose-100 text-rose-600 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    NEW
                  </span>
                )}

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
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                      {m.status}
                    </span>

                    {isCancelRequested && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 bg-orange-50 border border-orange-100 px-2 py-0.5 rounded-full">
                        cancellation requested
                      </span>
                    )}
                  </div>

                  {/* Pending → bouton "View" */}
                  {m.status === "pending" && onView ? (
                    <button
                      onClick={() => onView(m)}
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
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm italic">{empty}</p>
      )}
    </section>
  );
}
