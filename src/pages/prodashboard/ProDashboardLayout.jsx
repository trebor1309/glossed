import { useState, useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import ProBottomNav from "../../components/navigation/BottomNavPro";
import SidebarPro from "../../components/navigation/SidebarPro";

export default function ProDashboardLayout() {
  const { switchRole } = useUser();
  const [active, setActive] = useState("Dashboard");
  const location = useLocation();

  useEffect(() => {
    if (location.pathname.includes("missions")) setActive("Missions");
    else if (location.pathname.includes("payments")) setActive("Payments");
    else if (location.pathname.includes("settings")) setActive("Settings");
    else setActive("Dashboard");
  }, [location.pathname]);

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar desktop */}
        <aside className="hidden md:block w-64">
          <SidebarPro />
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* 🧹 NAVBAR SUPPRIMÉE ICI */}

          <main className="p-6 pb-20 md:pb-6 flex-1 overflow-y-auto flex justify-center">
            <div
              className={`
                w-full 
                ${location.pathname.includes("messages") ? "max-w-5xl" : "max-w-6xl"}
              `}
            >
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Bottom nav mobile */}
      <ProBottomNav />
    </>
  );
}
