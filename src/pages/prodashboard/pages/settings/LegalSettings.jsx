import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function LegalSettings() {
  const { session } = useUser();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    full_name: "",
    company_number: "",
    vat_number: "",
    no_vat: false,
    business_address: "",
    professional_email: "",
    phone_number: "",
    iban: "",
  });

  // 🧠 Charger les infos existantes
  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(
          "full_name, company_number, vat_number, no_vat, business_address, professional_email, phone_number, iban"
        )
        .eq("id", session.user.id)
        .single();

      if (!error && data) setForm((prev) => ({ ...prev, ...data }));
      setLoading(false);
    };

    fetchData();
  }, [session]);

  // ✍️ Gestion des inputs
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  // 💾 Sauvegarde Supabase
  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);

    const updates = { ...form, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", session.user.id);

    setSaving(false);

    if (error) {
      console.error("Supabase error:", error);
      setToast({ message: "❌ Error while saving your info.", type: "error" });
    } else {
      setToast({
        message: "✅ Legal info saved successfully!",
        type: "success",
      });
    }
  };

  if (loading)
    return (
      <div className="text-gray-500 text-sm">
        Loading your legal information...
      </div>
    );

  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">
        Legal & Billing Information
      </h3>

      {/* Grid principale */}
      <div className="grid md:grid-cols-2 gap-4">
        <InputField
          label="Full Name"
          name="full_name"
          value={form.full_name}
          onChange={handleChange}
          required
        />
        <InputField
          label="Company Number"
          name="company_number"
          value={form.company_number}
          onChange={handleChange}
          required
        />

        {/* VAT + case "Not subject" */}
        <div>
          <label className="block text-sm font-medium text-gray-700 flex items-center justify-between">
            <span>VAT Number</span>
            <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
              <input
                type="checkbox"
                name="no_vat"
                checked={form.no_vat}
                onChange={handleChange}
                className="accent-rose-600"
              />
              Not subject to VAT
            </label>
          </label>

          <input
            type="text"
            name="vat_number"
            value={form.vat_number || ""}
            onChange={handleChange}
            placeholder="e.g. BE0123456789"
            disabled={form.no_vat}
            className={`w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none ${
              form.no_vat ? "bg-gray-100 cursor-not-allowed" : ""
            }`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Required only if you are VAT-registered or exceed €25,000/year.
          </p>
        </div>

        <InputField
          label="Professional Email"
          name="professional_email"
          type="email"
          value={form.professional_email}
          onChange={handleChange}
          required
        />
        <InputField
          label="Phone Number"
          name="phone_number"
          value={form.phone_number}
          onChange={handleChange}
        />
        <InputField
          label="IBAN"
          name="iban"
          value={form.iban}
          onChange={handleChange}
          placeholder="e.g. BE12 3456 7890 1234"
          required
        />
      </div>

      {/* Adresse entreprise */}
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Business Address
        </label>
        <textarea
          name="business_address"
          value={form.business_address || ""}
          onChange={handleChange}
          className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
          rows={2}
          required
        />
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
