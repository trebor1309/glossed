import { useState, useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { Home, Calendar, CreditCard, Settings, LogOut, Repeat } from "lucide-react";
import ProBottomNav from "./ProBottomNav";
import SidebarPro from "./SidebarPro";
console.log("⚙️ ProDashboardSettings mounted");

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
        <SidebarPro />

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

          <main className="p-6 pb-20 md:pb-6 flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </div>

      {/* 🧭 ProBottom nav mobile */}
      <ProBottomNav />
    </>
  );
}
