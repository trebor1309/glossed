// 📄 src/pages/prodashboard/pages/settings/BusinessInfo.jsx
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save, Edit2, CheckSquare, Info } from "lucide-react";
import Toast from "@/components/ui/Toast";

const SERVICE_TYPES = [
  "Hair Stylist",
  "Barber",
  "Makeup Artist",
  "Manicure",
  "Skincare",
  "Kids Makeup",
  "Tattoo Artist",
  "Piercing Specialist",
  "Massage Therapist",
];

export default function BusinessInfo() {
  const { user } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    business_name: "",
    business_type: [],
    description: "",
  });

  // 🔄 Charger les infos business depuis Supabase
  useEffect(() => {
    const fetchInfo = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select("business_name, business_type, description")
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ BusinessInfo load error:", error.message);
        return;
      }

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

  // ✅ Sauvegarde Supabase
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = {
      business_name: form.business_name.trim(),
      business_type: form.business_type,
      description: form.description.trim(),
      updated_at: new Date().toISOString(),
    };

    const { error, data } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id)
      .select()
      .maybeSingle();

    setSaving(false);

    if (error) {
      console.error("❌ BusinessInfo save error:", error.message);
      setToast({ message: "❌ Error saving business info.", type: "error" });
    } else {
      // on met à jour le state local avec ce que Supabase a vraiment sauvegardé
      setForm((prev) => ({
        ...prev,
        business_name: data?.business_name || prev.business_name,
        business_type: Array.isArray(data?.business_type)
          ? data.business_type
          : prev.business_type,
        description: data?.description || prev.description,
      }));

      setToast({
        message: "✅ Business information updated successfully!",
        type: "success",
      });
      setEditing(false);
    }
  };

  const toggleType = (type) => {
    setForm((prev) => {
      const exists = prev.business_type.includes(type);
      return {
        ...prev,
        business_type: exists
          ? prev.business_type.filter((t) => t !== type)
          : [...prev.business_type, type],
      };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Business Information</h3>
          <p className="text-sm text-gray-500 mt-1">
            This information helps clients understand what you offer and lets us match you
            with the right requests.
          </p>
        </div>

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

      {/* MODE LECTURE */}
      {!editing ? (
        <div className="space-y-6 text-gray-700">
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-1">Business Name</h4>
            <p>{form.business_name || <span className="text-gray-400 italic">—</span>}</p>
          </div>

          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-1">Services</h4>
            {form.business_type.length ? (
              <p>{form.business_type.join(", ")}</p>
            ) : (
              <p className="text-gray-400 italic">No services selected yet.</p>
            )}
          </div>

          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-1">Description</h4>
            <p>{form.description || <span className="text-gray-400 italic">No description yet.</span>}</p>
          </div>

          <div className="flex items-start gap-2 text-xs text-gray-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            <Info size={14} className="mt-0.5 text-rose-500" />
            <p>
              You can add photos of your work and upload verification documents in the{" "}
              <span className="font-medium">Visual & Verification</span> tab.
            </p>
          </div>
        </div>
      ) : (
        /* MODE ÉDITION */
        <div className="space-y-6">
          {/* Nom commercial */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Business Name
            </label>
            <input
              type="text"
              value={form.business_name}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, business_name: e.target.value }))
              }
              placeholder="Ex: Glossed Beauty Studio"
              className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* Types de services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Services you offer
              </label>
              <span className="text-xs text-gray-400">
                Select all that apply (used for matching & search)
              </span>
            </div>

            <div className="flex flex-wrap gap-3">
              {SERVICE_TYPES.map((type) => {
                const selected = form.business_type.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggleType(type)}
                    className={`flex items-center gap-2 border rounded-full px-3 py-1.5 text-sm cursor-pointer select-none transition
                      ${
                        selected
                          ? "bg-rose-100 border-rose-500 text-rose-700 shadow-sm"
                          : "border-gray-300 hover:border-rose-400 hover:bg-gray-50 text-gray-700"
                      }`}
                  >
                    <CheckSquare
                      size={16}
                      className={selected ? "opacity-100" : "opacity-40"}
                    />
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              rows={4}
              placeholder="Describe your services, style, experience, languages, etc."
              className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              This text may be visible to clients on your public profile.
            </p>
          </div>
        </div>
      )}

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
