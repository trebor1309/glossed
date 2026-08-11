import { useLocation, Outlet } from "react-router-dom";
import ProBottomNav from "../../components/navigation/BottomNavPro";
import SidebarPro from "../../components/navigation/SidebarPro";

export default function ProDashboardLayout() {
  const location = useLocation();
  const isMessagesPage = location.pathname.includes("/messages");

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar desktop */}
        <aside className="hidden w-64 shrink-0 md:block">
          <SidebarPro />
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 🧹 NAVBAR SUPPRIMÉE ICI */}

          <main
            className={`${
              isMessagesPage ? "p-0 pb-20 md:p-6" : "p-6 pb-20 md:pb-6"
            } flex min-w-0 flex-1 justify-center overflow-x-hidden`}
          >
            <div
              className={`
                w-full min-w-0 max-w-full
                ${isMessagesPage ? "md:max-w-5xl" : "max-w-6xl"}
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
