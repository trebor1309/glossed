import {
  Home,
  Calendar,
  DollarSign,
  Settings,
  MoreHorizontal,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useUser } from "@/context/UserContext";

export default function ProBottomNav() {
  const navigate = useNavigate();
  const { proBadge = 0 } = useUser(); // 🆕 dynamique

  const nav = (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg flex justify-around items-center py-2 md:hidden z-[40]">
      {/* 🔘 Bouton central flottant */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2">
        <button
          onClick={() => navigate("/prodashboard/missions")}
          className="relative rounded-full p-4 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 focus:outline-none focus:ring-2 focus:ring-rose-200 active:scale-95 transition-transform"
          aria-label="Pending Jobs"
          title="Pending Jobs"
        >
          <Calendar className="h-6 w-6 text-white" />
          {proBadge > 0 && (
            <span className="absolute -top-1 -right-1 bg-rose-600 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
              {proBadge}
            </span>
          )}
        </button>
      </div>

      {/* Liens Pro */}
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

      <NavLink
        to="/prodashboard/missions"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <Settings size={22} />
        <span className="mt-1">Jobs</span>
      </NavLink>

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
