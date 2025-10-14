// 📁 src/pages/prodashboard/components/SidebarPro.jsx
import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import {
  Home,
  Calendar,
  CreditCard,
  Settings,
  LogOut,
  Repeat,
} from "lucide-react";

export default function SidebarPro() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, switchRole } = useUser();

  const menuItems = [
    { name: "Dashboard", icon: Home, path: "/prodashboard" },
    { name: "Missions", icon: Calendar, path: "/prodashboard/missions" },
    { name: "Payments", icon: CreditCard, path: "/prodashboard/payments" },
    { name: "Settings", icon: Settings, path: "/prodashboard/settings" },
  ];

  return (
    <aside
      className="hidden md:block bg-white shadow-lg border-r border-gray-100 w-64
                    sticky top-0 self-start"
    >
      {/* 🔹 Logo */}
      <div className="p-6 border-b border-gray-100">
        <h2
          className="text-2xl font-bold text-rose-600 mb-6 cursor-pointer"
          onClick={() => navigate("/")}
        >
          Glossed Pro
        </h2>
      </div>

      {/* 📋 Liens de navigation */}
      <nav className="p-4 space-y-2">
        {menuItems.map(({ name, icon: Icon, path }) => (
          <button
            key={name}
            onClick={() => navigate(path)}
            className={`flex items-center gap-3 w-full px-4 py-2.5 rounded-lg font-medium transition-colors ${
              location.pathname === path
                ? "bg-rose-50 text-rose-600"
                : "hover:bg-gray-100 text-gray-700"
            }`}
          >
            <Icon size={20} />
            {name}
          </button>
        ))}

        {/* 🔁 Switch vers client */}
        <button
          onClick={switchRole}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-4"
        >
          <Repeat size={20} />
          Book a Service
        </button>

        {/* 🚪 Déconnexion */}
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-6"
        >
          <LogOut size={20} />
          Logout
        </button>
      </nav>
    </aside>
  );
}
