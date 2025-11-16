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

// Petit helper pour trier par date
const buildDate = (item) => {
  if (!item?.date) return null;
  const d = new Date(item.date);
  return Number.isNaN(d.getTime()) ? null : d;
};

export default function DashboardReservations() {
  const { session } = useUser();
  const { notifications } = useNotifications();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDayBookings, setSelectedDayBookings] = useState(null);
  const [sortBy, setSortBy] = useState("date_upcoming"); // "date_upcoming" | "created_newest"

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  const [toast, setToast] = useState(null);

  // NEW badges sur nouvelles offres (missions status="proposed")
  const [newItems, setNewItems] = useState(() => new Set());

  /* ----------------------------------------------------------------------
     📌 fetchBookings()
     Fusionne bookings + missions proprement
  ---------------------------------------------------------------------- */
  const fetchBookings = async () => {
    try {
      setLoading(true);
      const clientId = session.user.id;

      // 1️⃣ Bookings bruts
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

      // 3️⃣ Nettoyage : si mission confirmée → enlever le booking d’origine
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
     🔁 Initialisation + realtime via NotificationContext
  ---------------------------------------------------------------------- */
  useEffect(() => {
    if (!session?.user?.id) return;

    fetchBookings();

    const handler = (event) => {
      const { table, action, payload } = event.detail || {};

      // 🎯 Nouvelle offre du pro = NEW
      if (
        table === "missions" &&
        action === "INSERT" &&
        payload?.new?.client_id === session.user.id &&
        payload?.new?.status === "proposed"
      ) {
        setNewItems((prev) => {
          const next = new Set(prev);
          next.add(`mission_${payload.new.id}`);
          return next;
        });
      }

      if (
        table === "missions" &&
        action === "UPDATE" &&
        payload?.new?.client_id === session.user.id &&
        payload?.new?.status === "proposed"
      ) {
        setNewItems((prev) => {
          const next = new Set(prev);
          next.add(`mission_${payload.new.id}`);
          return next;
        });
      }

      fetchBookings();
    };

    window.addEventListener("supabase-update", handler);

    return () => {
      window.removeEventListener("supabase-update", handler);
    };
  }, [session?.user?.id]);

  /* ----------------------------------------------------------------------
     🗑️ Delete booking
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
     🔍 Tri
  ---------------------------------------------------------------------- */
  const sortList = (list) => {
    const arr = [...list];

    if (sortBy === "created_newest") {
      return arr.sort((a, b) => {
        const da = new Date(a.created_at || a.inserted_at || a.date || 0);
        const db = new Date(b.created_at || b.inserted_at || b.date || 0);
        return db - da;
      });
    }

    // default: "date_upcoming"
    return arr.sort((a, b) => {
      const da = buildDate(a) || new Date(0);
      const db = buildDate(b) || new Date(0);
      return da - db;
    });
  };

  /* ----------------------------------------------------------------------
     🎨 Groupement par statut
  ---------------------------------------------------------------------- */
  const display = selectedDayBookings ? selectedDayBookings.dayBookings : bookings;

  const grouped = {
    pending: sortList(display.filter((b) => b.status === "pending")),
    offers: sortList(display.filter((b) => ["offers", "proposed"].includes(b.status))),
    confirmed: sortList(display.filter((b) => b.status === "confirmed")),
    completed: sortList(display.filter((b) => b.status === "completed")),
    cancelled: sortList(display.filter((b) => b.status === "cancelled")),
  };

  // Pending propres
  grouped.pending = grouped.pending.filter(
    (b) => !grouped.confirmed.some((c) => c.booking_id === b.id)
  );

  /* ----------------------------------------------------------------------
     🌀 Loading
  ---------------------------------------------------------------------- */
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
      {/* HEADER + SORT */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-800 text-center sm:text-left">
          My Reservations
        </h1>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Sort by</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="border border-gray-200 rounded-full px-3 py-1.5 text-sm text-gray-700 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-rose-200"
          >
            <option value="date_upcoming">Date – upcoming first</option>
            <option value="created_newest">Most recent first</option>
          </select>
        </div>
      </div>

      {/* CALENDAR */}
      <CalendarView
        bookings={bookings}
        onSelectDay={(date, dayBookings) => setSelectedDayBookings({ date, dayBookings })}
      />

      {/* SELECTED DAY banner */}
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

      {/* SECTIONS */}
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
        newItems={newItems}
        onView={(b) => {
          setSelectedBooking(b);
          setShowOffersModal(true);
          // remove NEW tag once viewed
          setNewItems((prev) => {
            const next = new Set(prev);
            next.delete(`mission_${b.id}`);
            return next;
          });
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

      {/* MODALS */}
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
   🔸 ReservationSection (client)
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
  newItems,
}) {
  return (
    <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
        {icon} {title}
      </h2>

      {data.length ? (
        <ul className="divide-y divide-gray-100">
          {data.map((b) => {
            const isNew =
              newItems?.has(`mission_${b.id}`) && ["proposed", "offers"].includes(b.status);

            return (
              <li
                key={`${b.type}-${b.id}`}
                className="py-3 flex justify-between items-start hover:bg-gray-50 px-2 rounded-lg transition relative"
              >
                {/* NEW badge */}
                {isNew && (
                  <span className="absolute top-2 right-2 bg-rose-100 text-rose-600 text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide">
                    NEW
                  </span>
                )}

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
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-500 text-sm italic">{empty}</p>
      )}
    </section>
  );
}
