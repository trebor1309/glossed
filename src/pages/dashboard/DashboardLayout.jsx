import { useState, useEffect } from "react";
import { useLocation, Outlet } from "react-router-dom";
import { useJsApiLoader } from "@react-google-maps/api";
import BottomNav from "../../components/navigation/BottomNavClient";
import Sidebar from "../../components/navigation/SidebarClient";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";

const libraries = ["places"];

export default function DashboardLayout() {
  const location = useLocation();
  const [toast, setToast] = useState(null);

  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const isMessagesPage = location.pathname.includes("/messages");

  const { loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  useEffect(() => {
    const checkViewport = () => setIsDesktop(window.innerWidth >= 768);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  useEffect(() => {
    const handleOpenModal = () => setShowNewBookingModal(true);
    window.addEventListener("open-new-booking-modal", handleOpenModal);
    return () => window.removeEventListener("open-new-booking-modal", handleOpenModal);
  }, []);

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 md:block">
          <Sidebar />
        </aside>

        {/* Main content */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 🧹 HEADER SUPPRIMÉ */}

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

      <BottomNav />

      {loadError && (
        <div
          role="status"
          className="fixed bottom-20 left-1/2 z-[9998] -translate-x-1/2 rounded-full bg-amber-50 px-4 py-2 text-xs text-amber-800 shadow md:bottom-6"
        >
          Address suggestions are temporarily unavailable. Saved locations still work.
        </div>
      )}

      {/* Modal: NEW BOOKING */}
      {isDesktop && showNewBookingModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <DashboardNew
            isModal={true}
            onClose={() => setShowNewBookingModal(false)}
            onSuccess={() => {
              setShowNewBookingModal(false);
              setToast({
                message: "✅ Booking created successfully!",
                type: "success",
              });
            }}
          />
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed z-[10000]
               bottom-20 right-6
               md:bottom-6 md:right-6
               left-1/2 -translate-x-1/2
               md:translate-x-0
               w-[90%] md:w-auto
               bg-white border border-gray-200 shadow-lg
               rounded-xl px-4 py-3 text-gray-800"
        >
          {toast.message}
          <button className="ml-3 text-rose-600 font-semibold" onClick={() => setToast(null)}>
            ×
          </button>
        </div>
      )}
    </>
  );
}
