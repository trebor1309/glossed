// 📄 src/pages/shared/DashboardSettingsUnified.jsx
import { useState } from "react";
import { Bell, Moon, Globe, Eye, Trash2, User, Mail, Smartphone, Briefcase } from "lucide-react";
import { useUser } from "@/context/UserContext";

export default function DashboardSettingsUnified() {
  const { user, isPro } = useUser();

  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState("en");
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    newsletter: true,
    jobAlerts: true, // only for pro
  });
  const [profileVisible, setProfileVisible] = useState(true);

  const toggle = (key) => setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));

  const firstLetter = user?.first_name?.[0]?.toUpperCase() || "?";

  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 text-center space-y-6">
      {/* 👤 Profile */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 justify-center">
          <User className="w-5 h-5 text-rose-600" />
          Profile Information
        </h3>

        <div className="flex items-center justify-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-rose-600 to-red-600 flex items-center justify-center text-white text-2xl font-bold">
            {firstLetter}
          </div>
          <div className="text-left">
            <p className="font-medium text-gray-800">
              {user?.first_name} {user?.last_name || ""}
            </p>
            <p className="text-gray-500 text-sm">{user?.email}</p>
            {isPro && user?.business_name && (
              <p className="text-gray-500 text-sm italic">{user.business_name}</p>
            )}
          </div>
        </div>

        <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:text-rose-600 hover:border-rose-400 transition-all">
          Edit Profile
        </button>
      </div>

      {/* 🌍 Language */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 justify-center">
          <Globe className="w-5 h-5 text-rose-600" />
          Language
        </h3>

        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-700 focus:ring-2 focus:ring-rose-200 outline-none"
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
        </select>
      </div>

      {/* 🔔 Notifications */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 justify-center">
          <Bell className="w-5 h-5 text-rose-600" />
          Notifications
        </h3>

        <ul className="space-y-3 text-gray-700">
          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-rose-600" />
              <span>Email Alerts</span>
            </div>
            <input
              type="checkbox"
              checked={notifications.email}
              onChange={() => toggle("email")}
              className="accent-rose-600 w-4 h-4"
            />
          </li>

          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-rose-600" />
              <span>SMS Notifications</span>
            </div>
            <input
              type="checkbox"
              checked={notifications.sms}
              onChange={() => toggle("sms")}
              className="accent-rose-600 w-4 h-4"
            />
          </li>

          <li className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-rose-600" />
              <span>Newsletter</span>
            </div>
            <input
              type="checkbox"
              checked={notifications.newsletter}
              onChange={() => toggle("newsletter")}
              className="accent-rose-600 w-4 h-4"
            />
          </li>

          {/* ✅ Option spécifique aux pros */}
          {isPro && (
            <li className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-rose-600" />
                <span>New job alerts</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.jobAlerts}
                onChange={() => toggle("jobAlerts")}
                className="accent-rose-600 w-4 h-4"
              />
            </li>
          )}
        </ul>
      </div>

      {/* 🕶️ Privacy */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 justify-center">
          <Eye className="w-5 h-5 text-rose-600" />
          Privacy
        </h3>

        <div className="flex items-center justify-between mb-4">
          <span>{isPro ? "Show my profile to clients" : "Show my profile to professionals"}</span>
          <input
            type="checkbox"
            checked={profileVisible}
            onChange={() => setProfileVisible(!profileVisible)}
            className="accent-rose-600 w-4 h-4"
          />
        </div>

        <button className="text-sm text-rose-600 flex items-center gap-2 mt-2 hover:underline">
          <Trash2 className="w-4 h-4" />
          Delete my account
        </button>
      </div>

      {/* 🌙 Appearance */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2 justify-center">
          <Moon className="w-5 h-5 text-rose-600" />
          Appearance
        </h3>

        <div className="flex items-center justify-between">
          <span>Dark mode</span>
          <input
            type="checkbox"
            checked={darkMode}
            onChange={() => setDarkMode(!darkMode)}
            className="accent-rose-600 w-4 h-4"
          />
        </div>
      </div>
    </section>
  );
}
