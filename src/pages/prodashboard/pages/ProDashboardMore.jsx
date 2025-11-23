import { useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import {
  User,
  Calendar,
  CreditCard,
  MessageSquare,
  Settings,
  HelpCircle,
  FileText,
  Info,
  Repeat,
  LogOut,
} from "lucide-react";

export default function ProDashboardMore() {
  const navigate = useNavigate();
  const { logout, switchRole } = useUser();

  const sections = [
    {
      title: "My Business",
      items: [
        { label: "Missions", icon: Calendar, to: "/prodashboard/missions" },
        { label: "Payments", icon: CreditCard, to: "/prodashboard/payments" },
        { label: "Messages", icon: MessageSquare, to: "/prodashboard/messages" },
      ],
    },
    {
      title: "My Account",
      items: [
        { label: "Account", icon: User, to: "/prodashboard/account" },
        { label: "Settings", icon: Settings, to: "/prodashboard/settings" },
      ],
    },
    {
      title: "Support",
      items: [
        { label: "Help Center", icon: HelpCircle, to: "/help-center" },
        { label: "Contact Support", icon: Info, to: "/contact" },
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
  ];

  return (
    <section className="space-y-6 pb-16">
      {sections.map(({ title, items }) => (
        <div key={title} className="bg-white rounded-2xl shadow p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">{title}</h3>
          <ul className="space-y-3">
            {items.map(({ label, icon: Icon, to }) => (
              <li key={label}>
                <button
                  onClick={() => navigate(to)}
                  className="flex items-center gap-3 w-full text-left text-gray-700 hover:text-rose-600 transition"
                >
                  <Icon size={20} className="text-rose-600" />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {/* Switch to Client */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 text-center">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2 text-gray-800 mb-2">
          <Repeat className="text-rose-600" /> Book as Client
        </h3>
        <p className="text-gray-600 text-sm mb-4">Switch to your personal account.</p>
        <button
          onClick={switchRole}
          className="px-5 py-2.5 bg-gradient-to-r from-gray-100 to-gray-50 text-gray-700 rounded-full font-medium shadow hover:scale-105 transition"
        >
          Switch
        </button>
      </div>

      {/* Logout */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 text-center">
        <h3 className="text-lg font-semibold flex items-center justify-center gap-2 text-gray-800 mb-2">
          <LogOut className="text-rose-600" /> Logout
        </h3>
        <button
          onClick={logout}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-medium shadow hover:scale-105 transition"
        >
          Logout
        </button>
      </div>
    </section>
  );
}
