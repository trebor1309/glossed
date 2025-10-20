import { Home, Calendar, User, MoreHorizontal } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";

export default function BottomNav() {
  const navigate = useNavigate();

  const links = [
    { to: "/dashboard", icon: Home, label: "Home" },
    { to: "/dashboard/reservations", icon: Calendar, label: "Bookings" },
    { to: "/dashboard/account", icon: User, label: "Account" },
    { to: "/dashboard/more", icon: MoreHorizontal, label: "More" },
  ];

  const nav = (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 shadow-lg flex justify-around items-center py-2 md:hidden z-[9999]">
      {/* 🔘 Bouton [+] flottant au centre */}
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

      {links.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            `flex flex-col items-center text-xs font-medium transition-colors ${
              isActive ? "text-rose-600" : "text-gray-500"
            }`
          }
        >
          <Icon size={22} />
          <span className="mt-1">{label}</span>
        </NavLink>
      ))}
    </nav>
  );

  return nav;
}
