import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function BusinessSettings() {
  const { session } = useUser();
  const [form, setForm] = useState({
    business_name: "",
    description: "",
    category: "",
    subcategory: "",
    website: "",
    accepting_new_clients: true,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // 🧠 Charger les infos du pro (avec logs)
  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      console.log("📡 FetchData triggered | session:", session);
      if (!session?.user?.id) {
        console.log("⚠️ No session.user.id found, skipping fetch");
        return;
      }

      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select(
          "business_name, description, category, subcategory, website, accepting_new_clients"
        )
        .eq("id", session.user.id)
        .single();

      if (error) console.error("❌ Supabase error:", error);
      else console.log("✅ Supabase data received:", data);

      if (isMounted && !error && data) {
        setForm((prev) => ({ ...prev, ...data }));
      }
      if (isMounted) setLoading(false);
    };

    fetchData();
    const timer = setTimeout(fetchData, 300); // deuxième tentative

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [session, session?.user?.id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSave = async () => {
    if (!session?.user?.id) return;
    setSaving(true);

    const updates = { ...form, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.user.id);

    setSaving(false);
    if (error) {
      console.error(error);
      setToast({
        message: "❌ Error while saving business info.",
        type: "error",
      });
    } else {
      setToast({
        message: "✅ Business information saved successfully!",
        type: "success",
      });
    }
  };

  if (loading)
    return (
      <div className="text-gray-500 text-sm">
        Loading your business info...
      </div>
    );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">Business Info</h3>

      <div className="grid md:grid-cols-2 gap-4">
        <InputField
          label="Business Name"
          name="business_name"
          value={form.business_name}
          onChange={handleChange}
          required
        />
        <InputField
          label="Website (optional)"
          name="website"
          value={form.website}
          onChange={handleChange}
          placeholder="https://your-site.com"
        />
      </div>

      <InputField
        label="Category"
        name="category"
        value={form.category}
        onChange={handleChange}
      />

      <InputField
        label="Subcategory"
        name="subcategory"
        value={form.subcategory}
        onChange={handleChange}
      />

      <div>
        <label className="block text-sm font-medium text-gray-700">
          Description
        </label>
        <textarea
          name="description"
          value={form.description}
          onChange={handleChange}
          rows={3}
          className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          name="accepting_new_clients"
          checked={form.accepting_new_clients}
          onChange={handleChange}
          className="w-5 h-5 accent-rose-600"
        />
        <span className="text-gray-700 text-sm font-medium">
          Accepting new clients
        </span>
      </div>

      <div className="text-right">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform flex items-center gap-2 ml-auto disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Changes"}
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
