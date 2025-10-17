import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Edit2, Save } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function PreferencesSettings() {
  const { user } = useUser();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    language: "en",
    theme: "light",
    notifications_email: true,
    notifications_push: true,
    currency: "EUR",
  });

  // 🔍 Charger les préférences
  useEffect(() => {
    const loadPrefs = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("users")
        .select("language, theme, notifications_email, notifications_push, currency")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error("❌ Supabase error:", error.message);
      if (data) setForm((prev) => ({ ...prev, ...data }));
    };
    loadPrefs();
  }, [user?.id]);

  // 💾 Sauvegarde
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const updates = { ...form, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("users").update(updates).eq("id", user.id);
    setSaving(false);

    if (error)
      setToast({ message: "❌ Error saving preferences.", type: "error" });
    else {
      setToast({ message: "✅ Preferences saved successfully!", type: "success" });
      setEditing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // 🧭 Interface
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Preferences</h3>
        <button
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition
            ${
              editing
                ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
        >
          {editing ? <Save size={16} /> : <Edit2 size={16} />}
          {editing ? (saving ? "Saving..." : "Save") : "Modify"}
        </button>
      </div>

      {/* Modes lecture / édition */}
      {!editing ? (
        <div className="space-y-3 text-gray-700">
          <p><strong>Language:</strong> {form.language?.toUpperCase()}</p>
          <p><strong>Theme:</strong> {form.theme}</p>
          <p>
            <strong>Email notifications:</strong>{" "}
            {form.notifications_email ? "Enabled" : "Disabled"}
          </p>
          <p>
            <strong>Push notifications:</strong>{" "}
            {form.notifications_push ? "Enabled" : "Disabled"}
          </p>
          <p><strong>Currency:</strong> {form.currency}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Langue */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Language
            </label>
            <select
              name="language"
              value={form.language}
              onChange={handleChange}
              className="w-full md:w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
            </select>
          </div>

          {/* Thème */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Theme
            </label>
            <select
              name="theme"
              value={form.theme}
              onChange={handleChange}
              className="w-full md:w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>

          {/* Notifications */}
          <div className="flex flex-col sm:flex-row gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="notifications_email"
                checked={form.notifications_email}
                onChange={handleChange}
                className="accent-rose-600"
              />
              Email Notifications
            </label>

            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                name="notifications_push"
                checked={form.notifications_push}
                onChange={handleChange}
                className="accent-rose-600"
              />
              Push Notifications
            </label>
          </div>

          {/* Devise */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              name="currency"
              value={form.currency}
              onChange={handleChange}
              className="w-full md:w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="EUR">Euro (€)</option>
              <option value="USD">US Dollar ($)</option>
              <option value="GBP">Pound (£)</option>
            </select>
          </div>
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
