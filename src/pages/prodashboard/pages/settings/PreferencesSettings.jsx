import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save, Bell, Globe, Clock, Euro, Car } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function PreferencesSettings() {
  const { session } = useUser();
  const [prefs, setPrefs] = useState({
    preferred_language: "en",
    notifications_enabled: true,
    available_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    available_from: "09:00",
    available_to: "18:00",
    base_rate: 50,
    default_currency: "EUR",
    mobile_service: true,
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const fetchPrefs = async () => {
      if (!session?.user) return;
      const { data, error } = await supabase
        .from("users")
        .select(
          "preferred_language, notifications_enabled, available_days, available_from, available_to, base_rate, default_currency, mobile_service"
        )
        .eq("id", session.user.id)
        .single();

      if (!error && data) setPrefs({ ...prefs, ...data });
    };
    fetchPrefs();
  }, [session]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setPrefs((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const toggleDay = (day) => {
    setPrefs((prev) => ({
      ...prev,
      available_days: prev.available_days.includes(day)
        ? prev.available_days.filter((d) => d !== day)
        : [...prev.available_days, day],
    }));
  };

  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);

    const { error } = await supabase
      .from("users")
      .update(prefs)
      .eq("id", session.user.id);

    setSaving(false);
    if (error)
      setToast({ message: "❌ Error saving preferences", type: "error" });
    else setToast({ message: "✅ Preferences saved!", type: "success" });
  };

  const days = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  return (
    <div className="space-y-10">
      <h3 className="text-lg font-semibold text-gray-800">
        Preferences & Availability
      </h3>

      {/* 🌍 Language */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <Globe size={16} className="text-rose-600" />
          Preferred Language
        </label>
        <select
          name="preferred_language"
          value={prefs.preferred_language}
          onChange={handleChange}
          className="w-full md:w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
        >
          <option value="en">English</option>
          <option value="fr">Français</option>
          <option value="de">Deutsch</option>
          <option value="nl">Nederlands</option>
        </select>
      </div>

      {/* 🔔 Notifications */}
      <div className="flex items-center justify-between border-t pt-4">
        <label className="flex items-center gap-3 cursor-pointer">
          <Bell size={18} className="text-rose-600" />
          <span className="font-medium text-gray-700">Email Notifications</span>
        </label>
        <input
          type="checkbox"
          name="notifications_enabled"
          checked={prefs.notifications_enabled}
          onChange={handleChange}
          className="w-5 h-5 accent-rose-600"
        />
      </div>

      {/* 🕓 Availability */}
      <div className="border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <Clock size={16} className="text-rose-600" /> Weekly Availability
        </label>
        <div className="flex flex-wrap gap-2">
          {days.map((day) => (
            <button
              key={day}
              onClick={() => toggleDay(day)}
              className={`px-3 py-1 text-sm rounded-full border ${
                prefs.available_days.includes(day)
                  ? "bg-rose-600 text-white border-rose-600"
                  : "bg-white text-gray-700 border-gray-300"
              }`}
            >
              {day.slice(0, 3).toUpperCase()}
            </button>
          ))}
        </div>

        <div className="flex gap-4 mt-3">
          <div>
            <label className="block text-xs text-gray-500">From</label>
            <input
              type="time"
              name="available_from"
              value={prefs.available_from}
              onChange={handleChange}
              className="border rounded-lg px-3 py-1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500">To</label>
            <input
              type="time"
              name="available_to"
              value={prefs.available_to}
              onChange={handleChange}
              className="border rounded-lg px-3 py-1"
            />
          </div>
        </div>
      </div>

      {/* 🚗 Service Location */}
      <div className="border-t pt-4 space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
          <Car size={16} className="text-rose-600" /> Service Location Options
        </label>

        {/* Mobile */}
        <div className="flex items-center justify-between">
          <span className="text-gray-700">
            Travel to clients (mobile service)
          </span>
          <input
            type="checkbox"
            name="mobile_service"
            checked={prefs.mobile_service}
            onChange={handleChange}
            className="w-5 h-5 accent-rose-600"
          />
        </div>

        {/* Private */}
        <div className="flex items-center justify-between">
          <span className="text-gray-700">
            Receive clients privately (at home)
          </span>
          <input
            type="checkbox"
            name="private_service"
            checked={prefs.private_service || false}
            onChange={handleChange}
            className="w-5 h-5 accent-rose-600"
          />
        </div>

        {/* Studio */}
        <div className="flex items-center justify-between">
          <span className="text-gray-700">
            Receive in a professional studio
          </span>
          <input
            type="checkbox"
            name="studio_service"
            checked={prefs.studio_service || false}
            onChange={handleChange}
            className="w-5 h-5 accent-rose-600"
          />
        </div>
      </div>

      {/* 💵 Pricing */}
      <div className="border-t pt-4">
        <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
          <Euro size={16} className="text-rose-600" /> Base Rate
        </label>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            name="base_rate"
            value={prefs.base_rate}
            onChange={handleChange}
            className="border rounded-lg px-3 py-2 w-28"
          />
          <select
            name="default_currency"
            value={prefs.default_currency}
            onChange={handleChange}
            className="border rounded-lg px-3 py-2"
          >
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>
          <span className="text-gray-500 text-sm">per hour (indicative)</span>
        </div>
      </div>

      {/* 💾 Save */}
      <div className="text-right border-t pt-4">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform flex items-center gap-2 ml-auto disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Preferences"}
        </button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
