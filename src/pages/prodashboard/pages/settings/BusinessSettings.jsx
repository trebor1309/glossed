// src/pages/dashboard/pages/settings/BusinessSettings.jsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save, Edit2, CheckSquare } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function BusinessSettings() {
  const { user } = useUser();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    business_name: "",
    business_type: [], // array instead of string
    description: "",
  });

  // Charger données Supabase
  useEffect(() => {
    const fetchInfo = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("users")
        .select("business_name, business_type, description")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error(error);
      if (data) {
        setForm({
          business_name: data.business_name || "",
          business_type: Array.isArray(data.business_type)
            ? data.business_type
            : data.business_type
              ? [data.business_type]
              : [],
          description: data.description || "",
        });
      }
    };
    fetchInfo();
  }, [user?.id]);

  // Sauvegarde Supabase
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = {
      business_name: form.business_name,
      business_type: form.business_type,
      description: form.description,
      updated_at: new Date().toISOString(),
    };

    const { error, data } = await supabase.from("users").update(updates).eq("id", user.id).select();
    console.log("🔍 UPDATE RESULT:", { error, data });
    setSaving(false);

    if (error) setToast({ message: "❌ Error saving data.", type: "error" });
    else {
      setToast({
        message: "✅ Information updated successfully!",
        type: "success",
      });
      setEditing(false);
    }
  };

  const handleTypeToggle = (type) => {
    setForm((prev) => {
      const selected = prev.business_type.includes(type)
        ? prev.business_type.filter((t) => t !== type)
        : [...prev.business_type, type];
      return { ...prev, business_type: selected };
    });
  };

  const types = [
    "Hair Stylist",
    "Makeup Artist",
    "Nail Technician",
    "Wellness",
    "Aesthetician",
    "Barber",
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Business Information</h3>
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

      {!editing ? (
        // --- MODE LECTURE ---
        <div className="space-y-4 text-gray-700">
          <p>
            <strong>Business Name:</strong> {form.business_name || "—"}
          </p>
          <p>
            <strong>Business Type:</strong>{" "}
            {form.business_type.length ? form.business_type.join(", ") : "—"}
          </p>
          <p>
            <strong>Description:</strong> {form.description || "—"}
          </p>
        </div>
      ) : (
        // --- MODE ÉDITION ---
        <div className="space-y-4">
          <InputField
            label="Business Name"
            name="business_name"
            value={form.business_name}
            onChange={(e) => setForm((prev) => ({ ...prev, business_name: e.target.value }))}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
            <div className="flex flex-wrap gap-3">
              {types.map((t) => (
                <label
                  key={t}
                  className={`flex items-center gap-2 border rounded-full px-3 py-1 cursor-pointer select-none ${
                    form.business_type.includes(t)
                      ? "bg-rose-100 border-rose-500 text-rose-700"
                      : "border-gray-300 hover:border-rose-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="hidden"
                    checked={form.business_type.includes(t)}
                    onChange={() => handleTypeToggle(t)}
                  />
                  <CheckSquare size={16} />
                  {t}
                </label>
              ))}
            </div>
          </div>

          <InputArea
            label="Description"
            name="description"
            value={form.description}
            onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
            rows={3}
            placeholder="Describe your services..."
          />
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function InputField({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        {...props}
        className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
      />
    </div>
  );
}

function InputArea({ label, ...props }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <textarea
        {...props}
        className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
      />
    </div>
  );
}
