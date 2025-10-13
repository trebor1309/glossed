import { useUser } from "../../../context/UserContext";
import { useNavigate } from "react-router-dom";
import {
  HelpCircle,
  Mail,
  FileText,
  Shield,
  Settings,
  DollarSign,
  LogOut,
  Repeat,
} from "lucide-react";

export default function ProDashboardMore() {
  const { logout, switchRole } = useUser();
  const navigate = useNavigate();

  const links = [
    { name: "Help Center", icon: HelpCircle, path: "/help-center" },
    { name: "Contact Support", icon: Mail, path: "/contact" },
    { name: "Legal", icon: FileText, path: "/legal" },
    { name: "Privacy Policy", icon: Shield, path: "/privacy" },
  ];

  return (
    <section className="space-y-6">
      {/* 🌸 Quick access */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">
          Quick Access
        </h2>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => navigate("/prodashboard/payments")}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-r from-rose-50 to-red-50 border border-gray-100 hover:scale-[1.02] transition"
          >
            <DollarSign className="text-rose-600 mb-1" size={22} />
            <span className="text-sm font-medium text-gray-700">Payments</span>
          </button>
          <button
            onClick={() => navigate("/prodashboard/settings")}
            className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-r from-rose-50 to-red-50 border border-gray-100 hover:scale-[1.02] transition"
          >
            <Settings className="text-rose-600 mb-1" size={22} />
            <span className="text-sm font-medium text-gray-700">Settings</span>
          </button>
        </div>
      </div>

      {/* 🔗 Useful Links */}
      <div className="bg-white p-4 rounded-2xl shadow border border-gray-100 divide-y divide-gray-100">
        {links.map(({ name, icon: Icon, path }) => (
          <button
            key={name}
            onClick={() => navigate(path)}
            className="flex items-center justify-between w-full py-3 px-2 text-left hover:bg-gray-50 transition rounded-lg"
          >
            <div className="flex items-center gap-3">
              <Icon size={20} className="text-rose-600" />
              <span className="font-medium text-gray-800">{name}</span>
            </div>
            <span className="text-gray-400 text-sm">›</span>
          </button>
        ))}
      </div>

      {/* 💆 Switch to Client */}
      <div className="bg-white p-6 rounded-2xl shadow border border-gray-100 text-center">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center justify-center gap-2">
          <Repeat className="w-5 h-5 text-rose-600" />
          Book as a Client
        </h3>
        <p className="text-gray-600 text-sm mb-4 max-w-sm mx-auto">
          Switch to your personal account to book a beauty service for yourself.
        </p>
        <button
          onClick={switchRole}
          className="px-5 py-2.5 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 rounded-full text-sm font-medium shadow hover:shadow-md hover:scale-105 transition-transform"
        >
          Switch to Client
        </button>
      </div>

      {/* 🚪 Logout */}
      <div className="bg-white p-5 rounded-2xl shadow border border-gray-100 text-center">
        <button
          onClick={logout}
          className="flex items-center gap-2 mx-auto bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-2.5 rounded-full font-semibold hover:scale-105 transition-transform"
        >
          <LogOut size={18} />
          Logout
        </button>
        <p className="text-xs text-gray-400 mt-2">See you soon 💅</p>
      </div>
    </section>
  );
}
