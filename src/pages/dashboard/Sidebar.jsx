// 📁 src/pages/dashboard/Sidebar.jsx
import {
  Home,
  CalendarDays,
  User,
  Settings,
  LogOut,
  Repeat,
  Plus,
} from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { useUser } from "../../context/UserContext";

export default function Sidebar() {
  const navigate = useNavigate();
  const { logout, switchRole, isPro } = useUser();

  const links = [
    { to: "/dashboard", label: "Dashboard", icon: Home },
    {
      to: "/dashboard/reservations",
      label: "My Reservations",
      icon: CalendarDays,
    },
    { to: "/dashboard/account", label: "Account", icon: User },
    { to: "/dashboard/settings", label: "Settings", icon: Settings },
  ];

  return (
    <nav
      className="flex flex-col p-6 bg-white border-r border-gray-100 shadow-sm
                sticky top-0 self-start"
    >
      {/* 🔹 Logo */}
      <h2
        className="text-2xl font-bold text-rose-600 mb-6 cursor-pointer"
        onClick={() => navigate("/")}
      >
        Glossed
      </h2>

      {/* 🔴 New Booking – CTA principal */}
      <button
        onClick={() => navigate("/dashboard/new")}
        className="flex items-center justify-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300 mb-6"
      >
        <Plus size={18} />
        <span>New Booking</span>
      </button>

      {/* 📋 Liens principaux */}
      <div className="space-y-1">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg font-medium transition-all duration-200 ${
                isActive
                  ? "bg-rose-50 text-rose-600 shadow-sm"
                  : "text-gray-700 hover:bg-gray-100"
              }`
            }
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>

      <div className="flex-1" />

      {/* 🔁 Switch to Pro */}
      {!isPro && (
        <button
          onClick={switchRole}
          className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-700 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-4"
        >
          <Repeat size={20} />
          Switch to Pro
        </button>
      )}

      {/* 🚪 Logout */}
      <button
        onClick={logout}
        className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-rose-600 font-medium transition-colors mt-2"
      >
        <LogOut size={20} />
        Logout
      </button>
    </nav>
  );
}
