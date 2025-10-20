import { Home, Calendar, DollarSign, Settings, MoreHorizontal } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useUser } from "@/context/UserContext";

export default function ProBottomNav() {
  const navigate = useNavigate();
  const { proBadge = 0 } = useUser(); // 🆕 dynamique

  const nav = (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg flex justify-around items-center py-2 md:hidden z-[40]">
      {/* 🔘 Bouton central flottant (missions) */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2">
        <button
          onClick={() => navigate("/prodashboard/missions")}
          className="relative rounded-full p-4 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 focus:outline-none focus:ring-2 focus:ring-rose-200 active:scale-95 transition-transform"
          aria-label="My Missions"
          title="My Missions"
        >
          <Calendar className="h-6 w-6 text-white" />

          {/* ✅ Petit point rouge avec halo blanc */}
          {proBadge > 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-600 rounded-full ring-2 ring-white animate-pulse"></span>
          )}
        </button>
      </div>

      {/* 🏠 Home */}
      <NavLink
        to="/prodashboard"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <Home size={22} />
        <span className="mt-1">Home</span>
      </NavLink>

      {/* 💰 Payments */}
      <NavLink
        to="/prodashboard/payments"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <DollarSign size={22} />
        <span className="mt-1">Payments</span>
      </NavLink>

      {/* ⚙️ Profile/Settings */}
      <NavLink
        to="/prodashboard/settings"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <Settings size={22} />
        <span className="mt-1">Profile</span>
      </NavLink>

      {/* ⋯ More */}
      <NavLink
        to="/prodashboard/more"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <MoreHorizontal size={22} />
        <span className="mt-1">More</span>
      </NavLink>
    </nav>
  );

  return createPortal(nav, document.body);
}
