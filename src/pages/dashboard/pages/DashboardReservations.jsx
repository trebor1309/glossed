import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Clock, Bell, CheckCircle, Star, XCircle, Trash2, Edit3, Eye } from "lucide-react";
import OffersModal from "@/components/modals/OffersModal";
import { AnimatePresence } from "framer-motion";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";
import CalendarView from "@/components/CalendarView";
import Toast from "@/components/ui/Toast";

export default function DashboardReservations() {
  const { session } = useUser();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDayBookings, setSelectedDayBookings] = useState(null);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [showOffersModal, setShowOffersModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [toast, setToast] = useState(null);

  const openOffersModal = (booking) => {
    setSelectedBooking(booking);
    setShowOffersModal(true);
  };

  const openEditModal = (booking) => {
    setSelectedBooking(booking);
    setShowEditModal(true);
  };

  // 🔹 Charger les réservations du client
  useEffect(() => {
    if (!session?.user) return;

    const fetchBookings = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("bookings")
        .select("*")
        .eq("client_id", session.user.id)
        .order("date", { ascending: true });

      if (!error) setBookings(data);
      setLoading(false);
    };

    fetchBookings();
  }, [session]);

  const handleDelete = async (id) => {
    if (!confirm("Are you sure you want to delete this reservation?")) return;

    const { error } = await supabase.from("bookings").delete().eq("id", id);

    if (error) {
      setToast({
        message: "Failed to delete booking. Please try again.",
        type: "error",
      });
      return;
    }

    setBookings((prev) => prev.filter((b) => b.id !== id));
    setToast({
      message: "Booking deleted successfully!",
      type: "success",
    });
  };

  const displayBookings = selectedDayBookings ? selectedDayBookings.dayBookings : bookings;

  const grouped = {
    pending: displayBookings.filter((b) => b.status === "pending"),
    offers: displayBookings.filter((b) => b.status === "offers"),
    confirmed: displayBookings.filter((b) => b.status === "confirmed"),
    completed: displayBookings.filter((b) => b.status === "completed"),
    cancelled: displayBookings.filter((b) => b.status === "cancelled"),
  };

  if (loading)
    return (
      <div className="flex justify-center items-center h-48 text-gray-600">
        Loading your reservations...
      </div>
    );

  return (
    // ✅ même structure que DashboardAccount / DashboardSettings
    <section className="mt-10 max-w-4xl mx-auto p-4 space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 text-center mb-4">My Reservations</h1>

      <CalendarView
        bookings={bookings}
        onSelectDay={(date, dayBookings) => {
          setSelectedDayBookings({ date, dayBookings });
        }}
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

      <ReservationSection
        title="Pending Requests"
        icon={<Clock size={20} className="text-amber-500" />}
        color="text-amber-600"
        data={grouped.pending}
        actions={{ edit: true, delete: true }}
        empty="You have no pending requests."
        onDelete={handleDelete}
        onEdit={openEditModal}
      />

      <ReservationSection
        title="Offers Received"
        icon={<Bell size={20} className="text-red-500" />}
        color="text-red-600"
        data={grouped.offers}
        actions={{ view: true }}
        empty="No offers to review yet."
        onView={openOffersModal}
      />

      <ReservationSection
        title="Confirmed Appointments"
        icon={<CheckCircle size={20} className="text-blue-600" />}
        color="text-blue-600"
        data={grouped.confirmed}
        actions={{ cancel: true }}
        empty="You have no confirmed appointments yet."
      />

      <ReservationSection
        title="Completed Services"
        icon={<Star size={20} className="text-green-500" />}
        color="text-green-600"
        data={grouped.completed}
        actions={{ rate: true }}
        empty="No completed services yet."
      />

      <ReservationSection
        title="Cancelled"
        icon={<XCircle size={20} className="text-gray-400" />}
        color="text-gray-400"
        data={grouped.cancelled}
        empty="No cancelled reservations."
      />

      {/* ✅ Modals gérés ici */}
      <AnimatePresence>
        {showOffersModal && selectedBooking && (
          <OffersModal
            booking={selectedBooking}
            onClose={() => setShowOffersModal(false)}
            onAccept={(id, offer) => {
              setBookings((prev) =>
                prev.map((b) =>
                  b.id === id ? { ...b, status: "confirmed", accepted_offer: offer } : b
                )
              );
              setToast({
                message: "Offer accepted successfully!",
                type: "success",
              });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEditModal && selectedBooking && (
          <DashboardNew
            isModal={true}
            editBooking={selectedBooking}
            onClose={() => setShowEditModal(false)}
            onSuccess={async () => {
              const { data } = await supabase
                .from("bookings")
                .select("*")
                .eq("client_id", session.user.id)
                .order("date", { ascending: true });

              setBookings(data || []);
              setToast({
                message: "Booking updated successfully!",
                type: "success",
              });
            }}
          />
        )}
      </AnimatePresence>

      {/* ✅ Notification Glossed */}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/* 🔸 Sous-composant */
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
              key={b.id}
              className="py-3 flex justify-between items-start hover:bg-gray-50 px-2 rounded-lg transition"
            >
              <div className="flex-1">
                <p className="font-medium text-gray-800">{b.service}</p>
                <p className="text-sm text-gray-500">
                  {b.date} — {b.time_slot}
                </p>
                <p className="text-sm text-gray-500">{b.address}</p>
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
                      title="View offers"
                    >
                      <Eye size={16} />
                    </button>
                  )}
                  {actions.edit && (
                    <button
                      onClick={() => onEdit?.(b)}
                      className="p-2 rounded-full hover:bg-gray-100"
                      title="Edit"
                    >
                      <Edit3 size={16} />
                    </button>
                  )}
                  {actions.delete && (
                    <button
                      onClick={() => onDelete?.(b.id)}
                      className="p-2 rounded-full hover:bg-gray-100 text-rose-500"
                      title="Delete"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                  {actions.cancel && (
                    <button
                      className="p-2 rounded-full hover:bg-gray-100 text-amber-600"
                      title="Request cancellation"
                    >
                      <XCircle size={16} />
                    </button>
                  )}
                  {actions.rate && (
                    <button
                      className="p-2 rounded-full hover:bg-gray-100 text-green-600"
                      title="Leave review"
                    >
                      <Star size={16} />
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
