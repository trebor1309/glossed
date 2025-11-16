// 📄 src/pages/dashboard/pages/DashboardReservations.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNotifications } from "@/context/NotificationContext";

import { Clock, Bell, CheckCircle, Star, XCircle, Trash2, Edit3, Eye } from "lucide-react";

import ClientOffersModal from "@/components/modals/ClientOffersModal";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";
import CalendarView from "@/components/CalendarView";
import Toast from "@/components/ui/Toast";
import { AnimatePresence } from "framer-motion";

export default function DashboardReservations() {
  const { session } = useUser();
  const { notifications } = useNotifications();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayBookings, setSelectedDayBookings] = useState(null);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [toast, setToast] = useState(null);

  /* ----------------------------------------------------------------------
     📌 Fonction principale : fetchBookings()
     Fusionne bookings + missions correctement
  ---------------------------------------------------------------------- */
  const fetchBookings = async () => {
    try {
      setLoading(true);
      const clientId = session.user.id;

      // 1️⃣ Bookings
      const { data: bookingsData } = await supabase
        .from("bookings")
        .select("*")
        .eq("client_id", clientId)
        .order("date", { ascending: true });

      // 2️⃣ Missions (offers / confirmed / completed)
      const { data: missionsData } = await supabase
        .from("missions")
        .select("*")
        .eq("client_id", clientId)
        .in("status", ["proposed", "offers", "confirmed", "completed", "cancelled"])
        .order("date", { ascending: true });

      // 🧮 Clean = booking → mission si confirmed
      const confirmedBookingIds = (missionsData || [])
        .filter((m) => m.status === "confirmed")
        .map((m) => m.booking_id);

      const cleanedBookings = (bookingsData || []).filter(
        (b) => !confirmedBookingIds.includes(b.id)
      );

      const bookingsTagged = cleanedBookings.map((b) => ({
        ...b,
        type: "booking",
      }));

      const missionsTagged = (missionsData || []).map((m) => ({
        ...m,
        type: "mission",
      }));

      const merged = [...bookingsTagged, ...missionsTagged];

      setBookings(merged);
    } catch (err) {
      console.error("❌ fetchBookings error:", err);
    } finally {
      setLoading(false);
    }
  };

  /* ----------------------------------------------------------------------
     🔁 Initialisation + realtime via OUVERTURE GLOBALE
     (NotificationContext déclenche supabase-update)
  ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!session?.user?.id) return;

    fetchBookings();

    const handler = () => {
      fetchBookings();
    };

    window.addEventListener("supabase-update", handler);

    return () => {
      window.removeEventListener("supabase-update", handler);
    };
  }, [session?.user?.id]);

  /* ----------------------------------------------------------------------
     🗑️ Supprimer un booking
  ---------------------------------------------------------------------- */
  const handleDelete = async (id) => {
    if (!confirm("Are you sure?")) return;

    const { error } = await supabase.from("bookings").delete().eq("id", id);
    if (error) {
      setToast({ message: "Failed to delete.", type: "error" });
      return;
    }

    fetchBookings();
    setToast({ message: "Booking deleted!", type: "success" });
  };

  /* ----------------------------------------------------------------------
     🎨 Groupement par statut
  ---------------------------------------------------------------------- */
  const displayBookings = selectedDayBookings ? selectedDayBookings.dayBookings : bookings;

  const grouped = {
    pending: displayBookings.filter((b) => b.status === "pending"),
    offers: displayBookings.filter((b) => ["offers", "proposed"].includes(b.status)),
    confirmed: displayBookings.filter((b) => b.status === "confirmed"),
    completed: displayBookings.filter((b) => b.status === "completed"),
    cancelled: displayBookings.filter((b) => b.status === "cancelled"),
  };

  // Nettoyage : ne pas afficher des pending déjà convertis
  grouped.pending = grouped.pending.filter(
    (b) => !grouped.confirmed.some((c) => c.booking_id === b.id)
  );

  if (loading)
    return (
      <div className="flex justify-center items-center h-48 text-gray-600">
        Loading your reservations...
      </div>
    );

  /* ----------------------------------------------------------------------
     🎨 Rendu
  ---------------------------------------------------------------------- */
  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">My Reservations</h1>

      <CalendarView
        bookings={bookings}
        onSelectDay={(date, dayBookings) => setSelectedDayBookings({ date, dayBookings })}
      />

      {selectedDayBookings && (
        <div className="text-center text-gray-600 mb-4">
          <p className="text-sm">
            Showing reservations for{" "}
            <span className="font-semibold text-gray-800">{selectedDayBookings.date}</span> (
            {selectedDayBookings.dayBookings.length} items)
          </p>
          <button
            onClick={() => setSelectedDayBookings(null)}
            className="mt-2 px-4 py-1.5 text-sm font-medium text-rose-600 border border-rose-200 rounded-full hover:bg-rose-50 transition"
          >
            Show all reservations
          </button>
        </div>
      )}

      {/* ----- Sections ----- */}
      <ReservationSection
        title="Pending Requests"
        icon={<Clock size={20} className="text-amber-500" />}
        color="text-amber-600"
        data={grouped.pending}
        actions={{ edit: true, delete: true }}
        empty="You have no pending requests."
        onDelete={handleDelete}
        onEdit={(b) => {
          setSelectedBooking(b);
          setShowEditModal(true);
        }}
      />

      <ReservationSection
        title="Offers Received"
        icon={<Bell size={20} className="text-red-500" />}
        color="text-red-600"
        data={grouped.offers}
        actions={{ view: true }}
        empty="No offers to review yet."
        onView={(b) => {
          setSelectedBooking(b);
          setShowOffersModal(true);
        }}
      />

      <ReservationSection
        title="Confirmed Appointments"
        icon={<CheckCircle size={20} className="text-blue-600" />}
        color="text-blue-600"
        data={grouped.confirmed}
        empty="You have no confirmed appointments."
      />

      <ReservationSection
        title="Completed Services"
        icon={<Star size={20} className="text-green-500" />}
        color="text-green-600"
        data={grouped.completed}
        empty="No completed services."
      />

      <ReservationSection
        title="Cancelled"
        icon={<XCircle size={20} className="text-gray-400" />}
        color="text-gray-400"
        data={grouped.cancelled}
        empty="No cancelled reservations."
      />

      {/* ----- Modals ----- */}
      <AnimatePresence>
        {showOffersModal && selectedBooking && (
          <ClientOffersModal
            booking={selectedBooking}
            onClose={() => setShowOffersModal(false)}
            onPay={() => {
              setShowOffersModal(false);
              fetchBookings();
              setToast({
                message: "Payment confirmed!",
                type: "success",
              });
            }}
          />
        )}
      </AnimatePresence>

      {showEditModal && selectedBooking && (
        <DashboardNew
          isModal={true}
          editBooking={selectedBooking}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchBookings();
            setToast({
              message: "Booking updated!",
              type: "success",
            });
          }}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/* ----------------------------------------------------------------------
   🔸 ReservationSection
---------------------------------------------------------------------- */
function ReservationSection({
  title,
  icon,
  data,
  color,
  empty,
  actions = {},
  onDelete,
  onView,
  onEdit,
}) {
  return (
    <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
        {icon} {title}
      </h2>

      {data.length ? (
        <ul className="divide-y divide-gray-100">
          {data.map((b) => (
            <li
              key={`${b.type}-${b.id}`}
              className="py-3 flex justify-between items-start hover:bg-gray-50 px-2 rounded-lg transition"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-800">{b.service}</p>
                <p className="text-sm text-gray-500">
                  {b.date} — {b.time_slot || b.time || ""}
                </p>
                <p className="text-sm text-gray-500">{b.address || "(No address)"}</p>
                {b.notes && <p className="text-xs text-gray-400 italic mt-1">“{b.notes}”</p>}
              </div>

              <div className="flex flex-col items-end gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${color}`}>
                  {b.status}
                </span>

                <div className="flex gap-2">
                  {actions.view && (
                    <button
                      onClick={() => onView?.(b)}
                      className="p-2 rounded-full hover:bg-gray-100 text-rose-600"
                    >
                      <Eye size={16} />
                    </button>
                  )}

                  {actions.edit && (
                    <button
                      onClick={() => onEdit?.(b)}
                      className="p-2 rounded-full hover:bg-gray-100"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}

                  {actions.delete && (
                    <button
                      onClick={() => onDelete?.(b.id)}
                      className="p-2 rounded-full hover:bg-gray-100 text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
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
