import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function BusinessSettings() {
  const { session } = useUser();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    business_name: "",
    business_type: "",
    description: "",
  });

  // 🧠 Charger les données existantes
  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select("business_name, business_type, description")
        .eq("id", session.user.id)
        .single();

      if (!error && data) setForm((prev) => ({ ...prev, ...data }));
      setLoading(false);
    };

    fetchData();
  }, [session]);

  // ✍️ Gestion des champs
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // 💾 Sauvegarde dans Supabase
  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);

    const updates = {
      ...form,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.user.id);

    setSaving(false);

    if (error) {
      console.error("Supabase error:", error);
      setToast({ message: "❌ Error while saving info.", type: "error" });
    } else {
      setToast({
        message: "✅ Business info saved successfully!",
        type: "success",
      });
    }
  };

  if (loading)
    return (
      <p className="text-gray-500 text-sm">Loading your business info...</p>
    );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">
        Business Information
      </h3>

      {/* Formulaire */}
      <div className="space-y-4">
        {/* Business Name */}
        <InputField
          label="Business Name"
          name="business_name"
          value={form.business_name}
          onChange={handleChange}
          placeholder="e.g. Beauty by Marie"
          required
        />
        <p className="text-xs text-gray-500">
          This name will appear publicly on your profile.
        </p>

        {/* Business Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Business Type
          </label>
          <select
            name="business_type"
            value={form.business_type}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
          >
            <option value="">Select your main activity</option>
            <option value="hair">Hair & Styling</option>
            <option value="makeup">Makeup Artist</option>
            <option value="nails">Nails & Beauty</option>
            <option value="aesthetics">Aesthetics</option>
            <option value="massage">Massage / Wellness</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Short Description
          </label>
          <textarea
            name="description"
            value={form.description || ""}
            onChange={handleChange}
            rows={3}
            placeholder="Describe your services in a few lines..."
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
          <p className="text-xs text-gray-500 mt-1">
            Clients will see this description on your public profile.
          </p>
        </div>
      </div>

      {/* Bouton Save */}
      <div className="text-right">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform flex items-center gap-2 ml-auto disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Info"}
        </button>
      </div>

      {/* Toast feedback */}
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

// Sous-composant champ
function InputField({ label, name, value, onChange, type = "text", ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type={type}
        name={name}
        value={value || ""}
        onChange={onChange}
        className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
        {...props}
      />
    </div>
  );
}
