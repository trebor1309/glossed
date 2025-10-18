import { useState, useEffect } from "react";
import { useLocation, useNavigate, Outlet } from "react-router-dom";
import { useUser } from "../../context/UserContext";
import {
  Home,
  User,
  Calendar,
  CreditCard,
  Settings,
  Repeat,
  Plus,
} from "lucide-react";
import { useJsApiLoader } from "@react-google-maps/api";
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";

const libraries = ["places"];

export default function DashboardLayout() {
  const { switchRole, isPro } = useUser();
  const [active, setActive] = useState("Dashboard");
  const location = useLocation();
  const navigate = useNavigate();

  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  // Charge Google Maps une seule fois pour tout le dashboard
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
    if (location.pathname.includes("reservations"))
      setActive("My Reservations");
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
          <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">{active}</h1>

            <div className="flex items-center gap-3">
              {!isPro && (
                <button
                  onClick={handleNewBookingClick}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-medium shadow hover:scale-[1.03] transition"
                >
                  <Plus size={18} />
                  New Booking
                </button>
              )}

              {!isPro && (
                <button
                  onClick={switchRole}
                  className="hidden md:inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 text-sm font-medium shadow hover:bg-gray-200 transition"
                >
                  <Repeat size={18} />
                  Switch to Pro
                </button>
              )}
            </div>
          </header>

          <main className="p-6 pb-20 md:pb-6 flex-1">
            <Outlet />
          </main>
        </div>
      </div>

      <BottomNav />

      {/* Modal for desktop */}
      {isDesktop && showNewBookingModal && (
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center">
          <DashboardNew
            isModal={true}
            onClose={() => setShowNewBookingModal(false)}
            onSuccess={handleBookingSuccess}
          />
        </div>
      )}
    </>
  );
}
