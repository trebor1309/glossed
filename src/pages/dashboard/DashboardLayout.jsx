import { useState, useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import { useJsApiLoader } from "@react-google-maps/api";
import BottomNav from "../../components/navigation/BottomNavClient";
import Sidebar from "../../components/navigation/SidebarClient";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";

const libraries = ["places"];

export default function DashboardLayout() {
  const { switchRole, isPro } = useUser();
  const [active, setActive] = useState("Dashboard");
  const location = useLocation();
  const navigate = useNavigate();
  const [toast, setToast] = useState(null);

  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  const { isLoaded, loadError } = useJsApiLoader({
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

  useEffect(() => {
    if (location.pathname.includes("reservations")) setActive("My Reservations");
    else if (location.pathname.includes("account")) setActive("My Account");
    else if (location.pathname.includes("settings")) setActive("Settings");
    else if (location.pathname.includes("payments")) setActive("Payments");
    else setActive("Dashboard");
  }, [location.pathname]);

  const handleNewBookingClick = () => {
    if (isDesktop) setShowNewBookingModal(true);
    else navigate("/dashboard/new");
  };

  const handleBookingSuccess = () => {
    setShowNewBookingModal(false);
  };

  if (loadError)
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        ❌ Google Maps failed to load.
      </div>
    );

  if (!isLoaded)
    return (
      <div className="flex items-center justify-center h-screen text-gray-600">
        Loading Google Maps...
      </div>
    );

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar */}
        <aside className="hidden md:block w-64">
          <Sidebar />
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col">
          {/* 🧹 HEADER SUPPRIMÉ */}

          <main className="p-6 pb-20 md:pb-6 flex-1 flex justify-center">
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

      <BottomNav />

      {/* Modal: NEW BOOKING */}
      {isDesktop && showNewBookingModal && isLoaded && (
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
