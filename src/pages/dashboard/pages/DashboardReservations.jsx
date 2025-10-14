import { useEffect, useState } from "react";
import { getAllBookings } from "@/lib/storage";
import { CheckCircle, Clock } from "lucide-react";

export default function DashboardReservations() {
  const [bookings, setBookings] = useState([]);

  useEffect(() => {
    // Charger les réservations stockées localement
    const data = getAllBookings();
    setBookings(data);
    // 🆕 Écoute les mises à jour faites par les pros
    const handleUpdate = (e) => {
      const updated = e.detail;
      setBookings((prev) =>
        prev.map((b) => (b.id === updated.id ? updated : b))
      );
    };
    window.addEventListener("glossed:booking-updated", handleUpdate);

    return () =>
      window.removeEventListener("glossed:booking-updated", handleUpdate);
  }, []);

  const pending = bookings.filter((b) => b.status === "pending");
  const confirmed = bookings.filter((b) => b.status === "confirmed");

  return (
    <div className="mt-10 max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
        My Reservations
      </h1>

      {/* Pending */}
      <section className="bg-white rounded-2xl shadow p-6 mb-8 border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
          <Clock size={20} className="text-amber-500" /> Pending Confirmation
        </h2>
        {pending.length ? (
          <ul className="space-y-4">
            {pending.map((b) => (
              <li
                key={b.id}
                className="flex justify-between items-start border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{b.service}</p>
                  <p className="text-sm text-gray-500">
                    {b.date} — {b.timeSlot}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.address.street}, {b.address.city}
                  </p>
                  {b.notes && (
                    <p className="text-xs text-gray-400 italic mt-1">
                      “{b.notes}”
                    </p>
                  )}
                </div>
                <span className="text-amber-600 text-sm font-semibold">
                  Pending
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">
            You have no pending reservations.
          </p>
        )}
      </section>

      {/* Confirmed */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
          <CheckCircle size={20} className="text-green-600" /> Confirmed
          Reservations
        </h2>
        {confirmed.length ? (
          <ul className="space-y-4">
            {confirmed.map((b) => (
              <li
                key={b.id}
                className="flex justify-between items-start border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{b.service}</p>
                  <p className="text-sm text-gray-500">
                    {b.date} — {b.timeSlot}
                  </p>
                  <p className="text-sm text-gray-500">
                    {b.address.street}, {b.address.city}
                  </p>
                </div>
                <span className="text-green-600 text-sm font-semibold">
                  Confirmed
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">
            You have no confirmed reservations yet.
          </p>
        )}
      </section>
    </div>
  );
}
