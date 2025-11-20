// src/components/navigation/BottomNavPro.jsx
import { Home, Calendar, DollarSign, Settings, MoreHorizontal, MessageSquare } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useNotifications } from "@/context/NotificationContext";
import NotificationBadge from "@/components/navigation/NotificationBadge";

export default function ProBottomNav() {
  const navigate = useNavigate();
  const { notifications, newMessages } = useNotifications();

  const missionsBadge = (notifications.proBookings || 0) + (notifications.proCancellations || 0);

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg flex justify-around items-center py-2 md:hidden z-[40]">
      {/* 🔘 Missions bouton central */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2">
        <button
          onClick={() => navigate("/prodashboard/missions")}
          className="relative rounded-full p-4 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 focus:outline-none focus:ring-2 focus:ring-rose-200 active:scale-95 transition-transform"
          aria-label="My Missions"
          title="My Missions"
        >
          <Calendar className="h-6 w-6 text-white" />
          {missionsBadge > 0 && <NotificationBadge count={missionsBadge} />}
        </button>
      </div>

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
        to="/prodashboard/messages"
        className={({ isActive }) =>
          `flex flex-col items-center text-xs font-medium transition-colors ${
            isActive ? "text-rose-600" : "text-gray-500"
          }`
        }
      >
        <div className="relative">
          <MessageSquare size={22} />
          {newMessages > 0 && <NotificationBadge count={newMessages} />}
        </div>
        <span className="mt-1">Messages</span>
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
}
