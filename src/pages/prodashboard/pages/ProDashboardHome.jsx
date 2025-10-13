// 📄 src/pages/prodashboard/pages/ProDashboardHome.jsx
import { Calendar, CheckCircle, Clock, DollarSign } from "lucide-react";

export default function ProDashboardHome() {
  const upcomingMissions = [
    { id: 1, client: "Alice Dupont", date: "Oct 20", service: "Haircut" },
    { id: 2, client: "Marie Thomas", date: "Oct 22", service: "Makeup" },
  ];

  const recentEarnings = [
    { id: 1, client: "Elise Martin", amount: "€75", date: "Oct 12" },
    { id: 2, client: "Julie Meunier", amount: "€60", date: "Oct 10" },
  ];

  return (
    <section className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <Calendar className="text-rose-600 mb-2" size={24} />
          <span className="text-2xl font-bold">8</span>
          <p className="text-gray-500 text-sm">Upcoming Missions</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <Clock className="text-amber-500 mb-2" size={24} />
          <span className="text-2xl font-bold">3</span>
          <p className="text-gray-500 text-sm">Pending Requests</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <CheckCircle className="text-green-500 mb-2" size={24} />
          <span className="text-2xl font-bold">42</span>
          <p className="text-gray-500 text-sm">Completed</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <DollarSign className="text-rose-600 mb-2" size={24} />
          <span className="text-2xl font-bold">€1 240</span>
          <p className="text-gray-500 text-sm">Total Earnings</p>
        </div>
      </div>

      {/* Upcoming Missions */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          Upcoming Missions
        </h2>
        <ul className="space-y-3">
          {upcomingMissions.map((m) => (
            <li
              key={m.id}
              className="flex justify-between items-center border-b border-gray-100 pb-2"
            >
              <div>
                <p className="font-medium text-gray-800">{m.client}</p>
                <p className="text-sm text-gray-500">
                  {m.service} — {m.date}
                </p>
              </div>
              <span className="text-rose-600 font-semibold cursor-pointer hover:underline">
                View
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Recent Earnings */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">
          Recent Earnings
        </h2>
        <ul className="space-y-3">
          {recentEarnings.map((e) => (
            <li
              key={e.id}
              className="flex justify-between items-center border-b border-gray-100 pb-2"
            >
              <div>
                <p className="font-medium text-gray-800">{e.client}</p>
                <p className="text-sm text-gray-500">{e.date}</p>
              </div>
              <span className="text-rose-600 font-semibold">{e.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
