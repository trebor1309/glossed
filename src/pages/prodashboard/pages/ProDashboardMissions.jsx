import { CheckCircle, XCircle, Clock, Calendar } from "lucide-react";
import { useState } from "react";

export default function ProDashboardMissions() {
  const [missions, setMissions] = useState([
    {
      id: 1,
      client: "Alice Dupont",
      service: "Makeup session",
      date: "Oct 22, 2025",
      status: "pending",
    },
    {
      id: 2,
      client: "Marie Thomas",
      service: "Haircut & Styling",
      date: "Oct 25, 2025",
      status: "upcoming",
    },
    {
      id: 3,
      client: "Emma Leroy",
      service: "Wedding Makeup",
      date: "Sep 30, 2025",
      status: "completed",
    },
  ]);

  const handleAccept = (id) => {
    setMissions((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, status: "upcoming" } : m
      )
    );
  };

  const handleDecline = (id) => {
    setMissions((prev) => prev.filter((m) => m.id !== id));
  };

  const pending = missions.filter((m) => m.status === "pending");
  const upcoming = missions.filter((m) => m.status === "upcoming");
  const completed = missions.filter((m) => m.status === "completed");

  return (
    <section className="space-y-8">
      {/* Pending */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
          <Clock size={20} className="text-amber-500" /> Pending Requests
        </h2>
        {pending.length ? (
          <ul className="space-y-4">
            {pending.map((m) => (
              <li
                key={m.id}
                className="flex justify-between items-center border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{m.client}</p>
                  <p className="text-sm text-gray-500">
                    {m.service} — {m.date}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(m.id)}
                    className="px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-sm font-medium hover:bg-green-100 transition"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDecline(m.id)}
                    className="px-3 py-1.5 rounded-lg bg-rose-50 text-rose-600 text-sm font-medium hover:bg-rose-100 transition"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">No pending requests</p>
        )}
      </div>

      {/* Upcoming */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
          <Calendar size={20} className="text-rose-600" /> Upcoming Missions
        </h2>
        {upcoming.length ? (
          <ul className="space-y-4">
            {upcoming.map((m) => (
              <li
                key={m.id}
                className="flex justify-between items-center border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{m.client}</p>
                  <p className="text-sm text-gray-500">
                    {m.service} — {m.date}
                  </p>
                </div>
                <span className="text-rose-600 font-semibold text-sm">
                  Confirmed
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">No upcoming missions</p>
        )}
      </div>

      {/* Completed */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-gray-800">
          <CheckCircle size={20} className="text-green-600" /> Completed
        </h2>
        {completed.length ? (
          <ul className="space-y-4">
            {completed.map((m) => (
              <li
                key={m.id}
                className="flex justify-between items-center border-b border-gray-100 pb-3"
              >
                <div>
                  <p className="font-medium text-gray-800">{m.client}</p>
                  <p className="text-sm text-gray-500">
                    {m.service} — {m.date}
                  </p>
                </div>
                <span className="text-green-600 font-semibold text-sm">
                  Done
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">No completed missions</p>
        )}
      </div>
    </section>
  );
}
