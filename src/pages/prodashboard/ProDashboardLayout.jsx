import { useState, useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import {
  Home,
  Calendar,
  CreditCard,
  Settings,
  LogOut,
  Repeat,
} from "lucide-react";
import ProBottomNav from "./ProBottomNav";

export default function ProDashboardLayout() {
  const { logout, switchRole } = useUser();
  const [active, setActive] = useState("Dashboard");
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname.includes("missions")) setActive("Missions");
    else if (location.pathname.includes("payments")) setActive("Payments");
    else if (location.pathname.includes("settings")) setActive("Settings");
    else setActive("Dashboard");
  }, [location.pathname]);

  const menuItems = [
    { name: "Dashboard", icon: Home, path: "/prodashboard" },
    { name: "Missions", icon: Calendar, path: "/prodashboard/missions" },
    { name: "Payments", icon: CreditCard, path: "/prodashboard/payments" },
    { name: "Settings", icon: Settings, path: "/prodashboard/settings" },
  ];

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar desktop */}
        <aside className="hidden md:block h-full bg-white shadow-lg border-r border-gray-100 w-64">
          <div className="p-6 border-b border-gray-100">
            <h2
              className="text-2xl font-bold text-rose-600 mb-6 cursor-pointer"
              onClick={() => navigate("/")}
            >
              Glossed Pro
            </h2>
          </div>

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

            {/* 🔁 Book a Service (Switch to Client) */}
            <button
              onClick={switchRole}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-4"
            >
              <Repeat size={20} />
              Book a Service
            </button>

            {/* 🚪 Logout */}
            <button
              onClick={logout}
              className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-6"
            >
              <LogOut size={20} />
              Logout
            </button>
          </nav>
        </aside>

        {/* Contenu principal */}
        <div className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">{active}</h1>

            <button
              onClick={switchRole}
              className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-medium shadow hover:scale-105 transition-transform"
            >
              <Repeat size={18} />
              Book a Service
            </button>
          </header>

          <main className="p-6 pb-20 md:pb-6 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      {/* 🧭 ProBottom nav mobile */}
      <ProBottomNav />
    </>
  );
}
