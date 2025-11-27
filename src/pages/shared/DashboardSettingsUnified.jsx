// 📄 src/pages/shared/DashboardSettingsUnified.jsx
import { useEffect, useState } from "react";
import {
  Bell,
  Moon,
  Globe,
  Eye,
  Trash2,
  User,
  Mail,
  Smartphone,
  Briefcase,
  Calendar,
} from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

const LANGS = [
  { value: "en", label: "English" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "nl", label: "Nederlands" },
];

const THEMES = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function DashboardSettingsUnified() {
  const { user, isPro } = useUser();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // 🔧 Préférences d'app (stockées dans public.users)
  const [prefs, setPrefs] = useState({
    preferred_language: "en",
    theme: "light",
    notifications_email: true,
    notifications_push: true,
    notif_newsletter: true,
    notif_job_alerts: true,
    notif_booking_updates: true,
    notif_new_messages: true,
  });

  // 🔒 Visibilité du profil (champ par champ)
  const [privacy, setPrivacy] = useState({
    show_city: true,
    show_country: true,
    show_business_address: true,
    show_working_radius: true,
    show_portfolio: true,
  });

  // ---------- Load depuis Supabase ----------
  useEffect(() => {
    const loadSettings = async () => {
      if (!user?.id) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(
          `
          preferred_language,
          theme,
          notifications_email,
          notifications_push,
          notif_newsletter,
          notif_job_alerts,
          notif_booking_updates,
          notif_new_messages,
          show_city,
          show_country,
          show_business_address,
          show_working_radius,
          show_portfolio
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ load settings error:", error.message);
        setToast({
          type: "error",
          message: "❌ Unable to load your settings.",
        });
        setLoading(false);
        return;
      }

      const safe = data || {};

      setPrefs((prev) => ({
        ...prev,
        preferred_language: safe.preferred_language || "en",
        theme: safe.theme || "light",
        notifications_email:
          safe.notifications_email === null || safe.notifications_email === undefined
            ? true
            : !!safe.notifications_email,
        notifications_push:
          safe.notifications_push === null || safe.notifications_push === undefined
            ? true
            : !!safe.notifications_push,
        notif_newsletter:
          safe.notif_newsletter === null || safe.notif_newsletter === undefined
            ? true
            : !!safe.notif_newsletter,
        notif_job_alerts:
          safe.notif_job_alerts === null || safe.notif_job_alerts === undefined
            ? true
            : !!safe.notif_job_alerts,
        notif_booking_updates:
          safe.notif_booking_updates === null || safe.notif_booking_updates === undefined
            ? true
            : !!safe.notif_booking_updates,
        notif_new_messages:
          safe.notif_new_messages === null || safe.notif_new_messages === undefined
            ? true
            : !!safe.notif_new_messages,
      }));

      setPrivacy((prev) => ({
        ...prev,
        show_city:
          safe.show_city === null || safe.show_city === undefined ? true : !!safe.show_city,
        show_country:
          safe.show_country === null || safe.show_country === undefined
            ? true
            : !!safe.show_country,
        show_business_address:
          safe.show_business_address === null || safe.show_business_address === undefined
            ? true
            : !!safe.show_business_address,
        show_working_radius:
          safe.show_working_radius === null || safe.show_working_radius === undefined
            ? true
            : !!safe.show_working_radius,
        show_portfolio:
          safe.show_portfolio === null || safe.show_portfolio === undefined
            ? true
            : !!safe.show_portfolio,
      }));

      setLoading(false);
    };

    loadSettings();
  }, [user?.id]);

  // ---------- Handlers ----------
  const handlePrefChange = (e) => {
    const { name, type, checked, value } = e.target;
    setPrefs((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handlePrivacyChange = (e) => {
    const { name, checked } = e.target;
    setPrivacy((prev) => ({
      ...prev,
      [name]: checked,
    }));
  };

  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = {
      preferred_language: prefs.preferred_language || "en",
      theme: prefs.theme || "light",
      notifications_email: !!prefs.notifications_email,
      notifications_push: !!prefs.notifications_push,
      notif_newsletter: !!prefs.notif_newsletter,
      notif_job_alerts: !!prefs.notif_job_alerts,
      notif_booking_updates: !!prefs.notif_booking_updates,
      notif_new_messages: !!prefs.notif_new_messages,
      show_city: !!privacy.show_city,
      show_country: !!privacy.show_country,
      show_business_address: !!privacy.show_business_address,
      show_working_radius: !!privacy.show_working_radius,
      show_portfolio: !!privacy.show_portfolio,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(updates).eq("id", user.id);

    setSaving(false);

    if (error) {
      console.error("❌ save settings error:", error.message);
      setToast({ type: "error", message: "❌ Error saving your settings." });
    } else {
      setToast({ type: "success", message: "✅ Settings updated successfully!" });
    }
  };

  const handleDeleteAccount = () => {
    // On ne supprime rien ici pour l’instant -> juste un message
    setToast({
      type: "info",
      message:
        "Account deletion will be handled via support for now. Please contact us if you need to close your account.",
    });
  };

  const firstLetter = user?.first_name?.[0]?.toUpperCase() || "?";

  if (loading) {
    return (
      <section className="mt-10 max-w-4xl mx-auto p-4">
        <div className="bg-white rounded-2xl shadow p-6 border border-gray-100 text-sm text-gray-600">
          Loading your settings…
        </div>
      </section>
    );
  }

  return (
    <section className="mt-10 max-w-5xl mx-auto p-4 space-y-8">
      {/* 👤 Header / aperçu du profil */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 flex flex-col sm:flex-row items-center sm:items-start gap-4">
        <div className="w-16 h-16 rounded-full bg-gradient-to-r from-rose-600 to-red-600 flex items-center justify-center text-white text-2xl font-bold">
          {firstLetter}
        </div>
        <div className="flex-1 text-center sm:text-left">
          <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2 justify-center sm:justify-start">
            <User className="w-5 h-5 text-rose-600" />
            Account & App Settings
          </h3>
          <p className="text-gray-700 mt-1">
            {user?.first_name} {user?.last_name || ""}
          </p>
          <p className="text-gray-500 text-sm">{user?.email}</p>
          {isPro && user?.business_name && (
            <p className="text-gray-500 text-sm italic">{user.business_name}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">
            These settings control your Glossed experience (language, theme, notifications and what
            clients/pros can see about you).
          </p>
        </div>
      </div>

      {/* 🧩 Grille : préférences & notifications / visibilité */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 🌍 Langue & thème */}
        <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Globe className="w-5 h-5 text-rose-600" />
            App Preferences
          </h3>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select
              name="preferred_language"
              value={prefs.preferred_language || "en"}
              onChange={handlePrefChange}
              className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-700 focus:ring-2 focus:ring-rose-200 outline-none"
            >
              {LANGS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-2">
              <Moon className="w-4 h-4 text-rose-600" />
              Theme
            </label>
            <select
              name="theme"
              value={prefs.theme || "light"}
              onChange={handlePrefChange}
              className="w-full border border-gray-200 rounded-lg px-4 py-2 text-gray-700 focus:ring-2 focus:ring-rose-200 outline-none"
            >
              {THEMES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              This may require a page refresh depending on your device.
            </p>
          </div>
        </div>

        {/* 🔔 Notifications */}
        <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 space-y-4">
          <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Bell className="w-5 h-5 text-rose-600" />
            Notifications
          </h3>

          <ul className="space-y-3 text-gray-700 text-sm">
            <li className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-rose-600" />
                <span>Allow email notifications</span>
              </div>
              <input
                type="checkbox"
                name="notifications_email"
                checked={!!prefs.notifications_email}
                onChange={handlePrefChange}
                className="accent-rose-600 w-4 h-4"
              />
            </li>

            <li className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-rose-600" />
                <span>Allow in-app / push notifications</span>
              </div>
              <input
                type="checkbox"
                name="notifications_push"
                checked={!!prefs.notifications_push}
                onChange={handlePrefChange}
                className="accent-rose-600 w-4 h-4"
              />
            </li>

            <li className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-rose-600" />
                <span>Newsletter & updates</span>
              </div>
              <input
                type="checkbox"
                name="notif_newsletter"
                checked={!!prefs.notif_newsletter}
                onChange={handlePrefChange}
                className="accent-rose-600 w-4 h-4"
              />
            </li>

            {/* Options spécifiques pro */}
            {isPro && (
              <>
                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-rose-600" />
                    <span>New job / booking alerts</span>
                  </div>
                  <input
                    type="checkbox"
                    name="notif_job_alerts"
                    checked={!!prefs.notif_job_alerts}
                    onChange={handlePrefChange}
                    className="accent-rose-600 w-4 h-4"
                  />
                </li>

                <li className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-rose-600 hidden" />
                    <span>Booking status updates</span>
                  </div>
                  <input
                    type="checkbox"
                    name="notif_booking_updates"
                    checked={!!prefs.notif_booking_updates}
                    onChange={handlePrefChange}
                    className="accent-rose-600 w-4 h-4"
                  />
                </li>
              </>
            )}

            <li className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquareIcon className="w-4 h-4 text-rose-600" />
                <span>New messages</span>
              </div>
              <input
                type="checkbox"
                name="notif_new_messages"
                checked={!!prefs.notif_new_messages}
                onChange={handlePrefChange}
                className="accent-rose-600 w-4 h-4"
              />
            </li>
          </ul>
        </div>
      </div>

      {/* 🕶️ Visibilité du profil */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100 space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
          <Eye className="w-5 h-5 text-rose-600" />
          Profile visibility
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Your profile (name, avatar and ratings) is always visible so Glossed can work correctly.
          Here you can choose which extra information is shown to other users.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <label className="flex items-center justify-between gap-3">
            <span>Show my city</span>
            <input
              type="checkbox"
              name="show_city"
              checked={!!privacy.show_city}
              onChange={handlePrivacyChange}
              className="accent-rose-600 w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between gap-3">
            <span>Show my country</span>
            <input
              type="checkbox"
              name="show_country"
              checked={!!privacy.show_country}
              onChange={handlePrivacyChange}
              className="accent-rose-600 w-4 h-4"
            />
          </label>

          {isPro && (
            <>
              <label className="flex items-center justify-between gap-3">
                <span>Show my business address</span>
                <input
                  type="checkbox"
                  name="show_business_address"
                  checked={!!privacy.show_business_address}
                  onChange={handlePrivacyChange}
                  className="accent-rose-600 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span>Show my working area / radius</span>
                <input
                  type="checkbox"
                  name="show_working_radius"
                  checked={!!privacy.show_working_radius}
                  onChange={handlePrivacyChange}
                  className="accent-rose-600 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between gap-3">
                <span>Show my portfolio images</span>
                <input
                  type="checkbox"
                  name="show_portfolio"
                  checked={!!privacy.show_portfolio}
                  onChange={handlePrivacyChange}
                  className="accent-rose-600 w-4 h-4"
                />
              </label>
            </>
          )}
        </div>
      </div>

      {/* 🚨 Danger Zone */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-rose-100 space-y-3">
        <h3 className="text-lg font-semibold text-red-600 flex items-center gap-2">
          <Trash2 className="w-5 h-5" />
          Account & data
        </h3>
        <p className="text-xs text-gray-500">
          For legal reasons (payments, invoices, disputes), some data must be kept even after an
          account is closed. We never show closed profiles publicly.
        </p>
        <button
          type="button"
          onClick={handleDeleteAccount}
          className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border border-red-300 text-red-600 hover:bg-red-50 transition"
        >
          <Trash2 className="w-4 h-4" />
          Request account deletion
        </button>
      </div>

      {/* Bouton global Save */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className={`px-6 py-2.5 rounded-full font-semibold text-white shadow-sm transition
            ${
              saving
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-rose-600 to-red-600 hover:scale-[1.02]"
            }`}
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

/** Petit icon message pour éviter un import de plus */
function MessageSquareIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      {...props}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
