import { useState } from "react";
import { useUser } from "../../../context/UserContext";
import { useNavigate } from "react-router-dom";
import {
  Settings,
  HelpCircle,
  FileText,
  Info,
  Briefcase,
  Newspaper,
  Facebook,
  Instagram,
  LogOut,
  Repeat,
} from "lucide-react";
import ProSignupModal from "../../../components/modals/ProSignupModal";

export default function DashboardMore() {
  const navigate = useNavigate();
  const { user, logout, switchRole } = useUser();
  const [showProSignup, setShowProSignup] = useState(false);

  const sections = [
    {
      title: "App & Support",
      items: [
        { label: "Settings", icon: Settings, to: "/dashboard/settings" },
        { label: "Help Center", icon: HelpCircle, to: "/help-center" },
        { label: "Contact", icon: Info, to: "/contact" },
        { label: "FAQ", icon: FileText, to: "/faq" },
      ],
    },
    {
      title: "Legal",
      items: [
        { label: "Legal Notice", icon: FileText, to: "/legal" },
        { label: "Privacy Policy", icon: FileText, to: "/privacy" },
        { label: "Terms of Service", icon: FileText, to: "/terms" },
      ],
    },
    {
      title: "About Glossed",
      items: [
        { label: "About Us", icon: Info, to: "/about-us" },
        { label: "Careers", icon: Briefcase, to: "/careers" },
        { label: "Press", icon: Newspaper, to: "/press" },
      ],
    },
  ];

  const handleSwitchToPro = () => {
    if (user?.roles?.includes("pro")) {
      // déjà pro → bascule direct
      switchRole();
    } else {
      // pas encore pro → ouvre la modale d’inscription
      setShowProSignup(true);
    }
  };

  return (
    <section className="space-y-6">
      {sections.map((section) => (
        <div
          key={section.title}
          className="bg-white rounded-2xl shadow-md p-6 border border-gray-100"
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-4">
            {section.title}
          </h3>
          <ul className="space-y-3">
            {section.items.map(({ label, icon: Icon, to }) => (
              <li key={label}>
                <button
                  onClick={() => navigate(to)}
                  className="flex items-center gap-3 w-full text-left text-gray-700 hover:text-rose-600 transition-colors"
                >
                  <Icon className="w-5 h-5 text-rose-600" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* 🌹 Switch to Pro */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 text-center">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center justify-center gap-2">
          <Repeat className="w-5 h-5 text-rose-600" />
          Become a Pro
        </h3>
        <p className="text-gray-600 text-sm mb-4 max-w-sm mx-auto">
          Join Glossed as a beauty professional and start receiving client
          bookings.
        </p>
        <button
          onClick={handleSwitchToPro}
          className="px-5 py-2.5 bg-gradient-to-r from-gray-200 to-gray-100 text-gray-700 rounded-full text-sm font-medium shadow hover:shadow-md hover:scale-105 transition-transform"
        >
          Switch to Pro
        </button>
      </div>

      {/* 📱 Réseaux sociaux */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Follow us</h3>
        <div className="flex gap-4">
          <a
            href="#"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-rose-500 hover:to-red-500 hover:text-white transition-all duration-300"
          >
            <Facebook className="w-5 h-5" />
          </a>
          <a
            href="#"
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gradient-to-r hover:from-rose-500 hover:to-red-500 hover:text-white transition-all duration-300"
          >
            <Instagram className="w-5 h-5" />
          </a>
        </div>
      </div>

      {/* 🚪 Déconnexion */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 text-center">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 flex items-center justify-center gap-2">
          <LogOut className="w-5 h-5 text-rose-600" />
          Logout
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          You can log out of your account anytime.
        </p>
        <button
          onClick={logout}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full text-sm font-medium shadow hover:shadow-md hover:scale-105 transition-transform"
        >
          Log out
        </button>
      </div>

      {/* ✨ Modale d’inscription Pro (si besoin) */}
      {showProSignup && (
        <ProSignupModal
          onClose={() => setShowProSignup(false)}
          onClientSignup={() => setShowProSignup(false)}
        />
      )}
    </section>
  );
}
