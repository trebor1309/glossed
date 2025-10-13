import { useState } from "react";
import { DollarSign, Calendar, TrendingUp } from "lucide-react";

export default function ProDashboardPayments() {
  const [payments] = useState([
    { id: 1, client: "Alice Dupont", service: "Makeup Session", amount: 75, date: "Oct 22, 2025" },
    { id: 2, client: "Marie Thomas", service: "Haircut & Styling", amount: 60, date: "Oct 18, 2025" },
    { id: 3, client: "Emma Leroy", service: "Wedding Makeup", amount: 120, date: "Oct 14, 2025" },
    { id: 4, client: "Julie Meunier", service: "Nails & Care", amount: 50, date: "Oct 10, 2025" },
  ]);

  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const monthlyGoal = 1500;
  const progress = Math.min((total / monthlyGoal) * 100, 100);

  return (
    <section className="space-y-8">
      {/* 💰 Overview */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <DollarSign className="text-rose-600 mb-2" size={24} />
          <span className="text-2xl font-bold">€{total}</span>
          <p className="text-gray-500 text-sm">Total earned this month</p>
        </div>
        <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 flex flex-col items-center">
          <Calendar className="text-amber-500 mb-2" size={24} />
          <span className="text-2xl font-bold">{payments.length}</span>
          <p className="text-gray-500 text-sm">Payments received</p>
        </div>
        <div className="hidden md:flex bg-white p-5 rounded-2xl shadow border border-gray-100 flex-col items-center">
          <TrendingUp className="text-green-500 mb-2" size={24} />
          <span className="text-2xl font-bold">{progress.toFixed(0)}%</span>
          <p className="text-gray-500 text-sm">of monthly goal (€{monthlyGoal})</p>
        </div>
      </div>

      {/* 📈 Progress bar */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <p className="font-semibold mb-2 text-gray-800">Monthly Progress</p>
        <div className="w-full bg-gray-100 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-rose-600 to-red-600 h-3 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          €{total} / €{monthlyGoal}
        </p>
      </div>

      {/* 🧾 Payment history */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Recent Payments</h2>
        <ul className="divide-y divide-gray-100">
          {payments.map((p) => (
            <li key={p.id} className="py-3 flex justify-between items-center">
              <div>
                <p className="font-medium text-gray-800">{p.client}</p>
                <p className="text-sm text-gray-500">
                  {p.service} — {p.date}
                </p>
              </div>
              <span className="font-semibold text-rose-600">€{p.amount}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
