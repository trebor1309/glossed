// 📄 src/pages/dashboard/pages/DashboardSettings.jsx
import { useState } from "react";
import { Bell, Moon, Globe, Eye, Trash2, User, Mail, Smartphone } from "lucide-react";

export default function DashboardSettings() {
  const [darkMode, setDarkMode] = useState(false);
  const [language, setLanguage] = useState("en");
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    newsletter: true,
  });
  const [profileVisible, setProfileVisible] = useState(true);

  const toggle = (key) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 text-center space-y-6">
      {/* 👤 Profil */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-rose-600" />
          Profile Information
        </h3>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-rose-600 to-red-600 flex items-center justify-center text-white text-2xl font-bold">
            R
          </div>
          <div>
            <p className="font-medium text-gray-800">Robert Heinen</p>
            <p className="text-gray-500 text-sm">robert@example.com</p>
          </div>
        </div>

        <button className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:text-rose-600 hover:border-rose-400 transition-all">
          Edit Profile
        </button>
      </div>

      {/* 🌍 Langue */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
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
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
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
        </ul>
      </div>

      {/* 🕶️ Confidentialité */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Eye className="w-5 h-5 text-rose-600" />
          Privacy
        </h3>

        <div className="flex items-center justify-between mb-4">
          <span>Show my profile to professionals</span>
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

      {/* 🌙 Apparence */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
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
