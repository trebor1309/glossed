import { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import dayjs from "dayjs";

const statusColors = {
  pending: "bg-amber-500",
  offers: "bg-red-500",
  confirmed: "bg-blue-500",
  completed: "bg-green-500",
  cancelled: "bg-gray-400",
};

export default function CalendarView({ bookings, onSelectDay }) {
  const [month, setMonth] = useState(dayjs());
  const todayRef = useRef(null);

  useEffect(() => {
    // 🔸 Scroll automatique vers aujourd’hui (facultatif sur mobile)
    const el = todayRef.current;
    if (el && window.innerWidth < 640) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  const daysInMonth = useMemo(() => {
    const start = month.startOf("month").startOf("week");
    const end = month.endOf("month").endOf("week");
    const days = [];
    let current = start;
    while (current.isBefore(end)) {
      days.push(current);
      current = current.add(1, "day");
    }
    return days;
  }, [month]);

  const bookingsByDate = useMemo(() => {
    const map = {};
    bookings.forEach((b) => {
      const key = dayjs(b.date).format("YYYY-MM-DD");
      if (!map[key]) map[key] = [];
      map[key].push(b);
    });
    return map;
  }, [bookings]);

  return (
    <div className="bg-white rounded-xl shadow-sm p-3 border border-gray-100 mb-4">
      {/* --- Navigation + Titre --- */}
      <div className="flex justify-between items-center mb-3">
        <button
          onClick={() => setMonth((m) => m.subtract(1, "month"))}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <ChevronLeft size={18} />
        </button>

        <h2 className="text-base sm:text-lg font-semibold text-gray-800">
          {month.format("MMMM YYYY")}
        </h2>

        <button
          onClick={() => setMonth((m) => m.add(1, "month"))}
          className="p-2 hover:bg-gray-100 rounded-full"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* --- Vue unifiée (mobile + desktop) --- */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="font-semibold text-gray-500 py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {daysInMonth.map((day) => {
          const key = day.format("YYYY-MM-DD");
          const dayBookings = bookingsByDate[key] || [];
          const isCurrentMonth = day.month() === month.month();
          const isToday = day.isSame(dayjs(), "day");

          return (
            <button
              key={key}
              onClick={() => onSelectDay?.(key, dayBookings)}
              ref={isToday ? todayRef : null}
              className={`h-10 sm:h-12 md:h-14 rounded-lg flex flex-col items-center justify-center relative border transition
                ${
                  isToday
                    ? "border-rose-400 bg-rose-50 text-rose-700"
                    : "border-transparent"
                }
                ${
                  isCurrentMonth
                    ? "text-gray-800 hover:bg-gray-50"
                    : "text-gray-300"
                }`}
            >
              <span className="text-xs sm:text-sm font-medium">
                {day.format("D")}
              </span>
              <div className="flex gap-[3px] mt-1">
                {Object.entries(statusColors).map(([status, color]) =>
                  dayBookings.some((b) => b.status === status) ? (
                    <span
                      key={status}
                      className={`w-1.5 h-1.5 rounded-full ${color}`}
                    ></span>
                  ) : null
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* --- Légende --- */}
      <div className="flex justify-center flex-wrap gap-3 mt-3 text-[10px] text-gray-500">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${color}`}></span>
            {status}
          </div>
        ))}
      </div>
    </div>
  );
}
