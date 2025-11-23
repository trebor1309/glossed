import { useNavigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { useNotifications } from "@/context/NotificationContext";
import {
  Home,
  Calendar,
  CreditCard,
  User,
  Settings,
  MessageSquare,
  Repeat,
  LogOut,
} from "lucide-react";
import NotificationBadge from "@/components/navigation/NotificationBadge";

export default function SidebarPro() {
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, switchRole } = useUser();
  const { notifications, newMessages } = useNotifications();

  const missionsBadge = (notifications.proBookings || 0) + (notifications.proCancellations || 0);

  const menuItems = [
    { name: "Home", icon: Home, path: "/prodashboard" },
    {
      name: "Missions",
      icon: Calendar,
      path: "/prodashboard/missions",
      hasBadge: missionsBadge > 0,
      badgeCount: missionsBadge,
    },
    {
      name: "Messages",
      icon: MessageSquare,
      path: "/prodashboard/messages",
      hasBadge: newMessages > 0,
      badgeCount: newMessages,
    },

    { name: "Account", icon: User, path: "/prodashboard/account" },
    { name: "Settings", icon: Settings, path: "/prodashboard/settings" },
    { name: "Payments", icon: CreditCard, path: "/prodashboard/payments" },
  ];

  return (
    <aside className="hidden md:block bg-white shadow-md border-r border-gray-100 w-64 sticky top-0 self-start">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <h2
          className="text-2xl font-bold text-rose-600 mb-6 cursor-pointer"
          onClick={() => navigate("/")}
        >
          Glossed Pro
        </h2>
      </div>

      {/* Links */}
      <nav className="p-4 space-y-2">
        {menuItems.map(({ name, icon: Icon, path, hasBadge, badgeCount }) => {
          const isActive = location.pathname === path;

          return (
            <button
              key={name}
              onClick={() => navigate(path)}
              className={`relative flex items-center gap-3 w-full px-4 py-2.5 rounded-lg font-medium transition-all duration-150 ${
                isActive
                  ? "bg-rose-50 text-rose-600 shadow-sm"
                  : "text-gray-700 hover:bg-gray-100 hover:text-rose-600"
              }`}
            >
              <div className="relative">
                <Icon size={20} />

                {hasBadge && badgeCount > 0 && <NotificationBadge count={badgeCount} />}
              </div>

              <span>{name}</span>
            </button>
          );
        })}
      </nav>

      {/* Bottom zone */}
      <div className="mt-auto p-4 space-y-3">
        {/* Switch to client (Book a Service) */}
        <button
          onClick={switchRole}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 hover:text-rose-600 font-medium transition"
        >
          <Repeat size={20} />
          Book a Service
        </button>

        {/* Logout */}
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-rose-600 font-medium transition"
        >
          <LogOut size={20} />
          Logout
        </button>
      </div>
    </aside>
  );
}
