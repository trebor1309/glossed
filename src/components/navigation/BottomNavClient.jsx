// src/components/navigation/BottomNavClient.jsx
import { Home, Calendar, User, MoreHorizontal, MessageSquare } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useNotifications } from "@/context/NotificationContext";
import NotificationBadge from "@/components/navigation/NotificationBadge";

export default function BottomNavClient() {
  const navigate = useNavigate();
  const { notifications, newMessages } = useNotifications();

  const links = [
    { to: "/dashboard", icon: Home, label: "Home" },
    {
      to: "/dashboard/reservations",
      icon: Calendar,
      label: "Bookings",
      badge: notifications.clientOffers,
    },
    {
      to: "/dashboard/messages",
      icon: MessageSquare,
      label: "Messages",
      badge: newMessages, // ← NEW
    },

    { to: "/dashboard/more", icon: MoreHorizontal, label: "More" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg flex justify-around items-center py-2 md:hidden z-[9999]">
      {/* 🔘 Bouton [+] flottant */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2">
        <button
          onClick={() => navigate("/dashboard/new")}
          className="rounded-full p-4 shadow-lg bg-gradient-to-r from-rose-600 to-red-600 focus:outline-none focus:ring-2 focus:ring-rose-200 active:scale-95 transition-transform"
          aria-label="New"
          title="New"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {links.map(({ to, icon: Icon, label, badge }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `relative flex flex-col items-center text-xs font-medium transition-colors ${
              isActive ? "text-rose-600" : "text-gray-500"
            }`
          }
        >
          <div className="relative">
            <Icon size={22} />
            {badge > 0 && <NotificationBadge count={badge} />}
          </div>
          <span className="mt-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
