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
import BottomNav from "./BottomNav";
import Sidebar from "./Sidebar";

// 🧠 Import du wrapper pour le formulaire de réservation
import DashboardNewWrapper from "@/pages/dashboard/pages/DashboardNewWrapper";

export default function DashboardLayout() {
  const { logout, switchRole, isPro } = useUser();
  const [active, setActive] = useState("Dashboard");
  const location = useLocation();
  const navigate = useNavigate();

  // --- Nouveaux états pour le modal ---
  const [showNewBookingModal, setShowNewBookingModal] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [shouldCloseModal, setShouldCloseModal] = useState(false);

  // --- Détection du viewport ---
  useEffect(() => {
    const checkViewport = () => setIsDesktop(window.innerWidth >= 768);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // --- Définir la page active ---
  useEffect(() => {
    if (location.pathname.includes("reservations"))
      setActive("My Reservations");
    else if (location.pathname.includes("account")) setActive("My Account");
    else if (location.pathname.includes("settings")) setActive("Settings");
    else if (location.pathname.includes("payments")) setActive("Payments");
    else setActive("Dashboard");
  }, [location.pathname]);

  const menuItems = [
    { name: "Dashboard", icon: Home, path: "/dashboard" },
    {
      name: "My Reservations",
      icon: Calendar,
      path: "/dashboard/reservations",
    },
    { name: "Payments", icon: CreditCard, path: "/dashboard/payments" },
    { name: "Account", icon: User, path: "/dashboard/account" },
    { name: "Settings", icon: Settings, path: "/dashboard/settings" },
  ];

  // --- Action du bouton "+ New Booking" ---
  const handleNewBookingClick = () => {
    if (isDesktop) {
      setShowNewBookingModal(true);
      setShouldCloseModal(false);
    } else {
      navigate("/dashboard/new");
    }
  };

  // --- Fonction appelée par le formulaire quand succès ---
  const handleBookingSuccess = () => {
    setShouldCloseModal(true);
    setTimeout(() => setShowNewBookingModal(false), 400); // petit délai pour la transition
  };

  return (
    <>
      <div className="min-h-screen flex bg-gray-50 text-gray-900">
        {/* Sidebar (desktop) */}
        <aside className="hidden md:block w-64">
          <Sidebar />
        </aside>

        {/* Contenu principal */}
        <div className="flex-1 flex flex-col">
          <header className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
            <h1 className="text-xl font-semibold text-gray-800">{active}</h1>

            <div className="flex items-center gap-3">
              {/* 🔘 Nouveau bouton “+ New Booking” (visible si client) */}
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

      {/* 🧭 Navigation mobile */}
      <BottomNav />

      {/* 🪟 Modal desktop (s'affiche toujours au-dessus de tout) */}
      {isDesktop && showNewBookingModal && (
        <div className="fixed inset-0 z-[9999]">
          <DashboardNewWrapper
            isModal={true}
            onClose={() => setShowNewBookingModal(false)}
            onSuccess={handleBookingSuccess}
          />
        </div>
      )}
    </>
  );
}
