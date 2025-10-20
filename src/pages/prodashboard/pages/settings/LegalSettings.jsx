import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Edit2, Save } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function LegalSettings() {
  const { user, session } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    address: "",
    business_name: "",
    business_address: "",
    professional_email: "",
    iban: "",
    vat_number: "",
    company_number: "",
    no_vat: false,
    payouts_enabled: false,
  });

  // 🔍 Charger les infos depuis Supabase
  useEffect(() => {
    const loadLegal = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select(
          "first_name, last_name, address, business_name, business_address, professional_email, iban, vat_number, company_number, no_vat, payouts_enabled"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ Supabase error:", error.message);
        return;
      }

      if (data) {
        // 🩷 on évite tout `null` pour les inputs contrôlés
        const safeData = Object.fromEntries(
          Object.entries(data).map(([key, value]) => [key, value ?? ""])
        );
        setForm((prev) => ({ ...prev, ...safeData }));
      }
    };
    loadLegal();
  }, [user?.id]);

  // ✏️ Gestion des changements
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
      ...(name === "no_vat" && checked ? { vat_number: "" } : {}),
    }));
  };

  // 💾 Sauvegarde des données
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = {
      first_name: form.first_name || "",
      last_name: form.last_name || "",
      address: form.address || "",
      business_name: form.business_name || "",
      business_address: form.business_address || "",
      professional_email: form.professional_email || "",
      iban: form.iban || "",
      vat_number: form.no_vat ? null : form.vat_number || "",
      company_number: form.company_number || "",
      no_vat: form.no_vat,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(updates).eq("id", user.id);

    setSaving(false);

    if (error)
      setToast({
        message: "❌ Error saving legal information.",
        type: "error",
      });
    else {
      setEditing(false);
      setToast({
        message: "✅ Legal & billing info saved successfully!",
        type: "success",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Legal & Billing Information</h3>
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

      {/* Mode lecture / édition */}
      {!editing ? (
        <div className="space-y-6 text-gray-700">
          {/* Bloc 1 — Informations personnelles */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Personal Information</h4>
            <p>
              <strong>First Name:</strong>{" "}
              {form.first_name || <span className="text-gray-400 italic">Not provided</span>}
            </p>
            <p>
              <strong>Last Name:</strong>{" "}
              {form.last_name || <span className="text-gray-400 italic">Not provided</span>}
            </p>
            <p>
              <strong>Personal Address:</strong>{" "}
              {form.address || <span className="text-gray-400 italic">Not provided</span>}
            </p>
          </div>

          {/* Bloc 2 — Informations professionnelles */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Business Information</h4>
            <p>
              <strong>Business Name:</strong>{" "}
              {form.business_name || <span className="text-gray-400 italic">Not provided</span>}
            </p>
            <p>
              <strong>Business Address:</strong>{" "}
              {form.business_address || <span className="text-gray-400 italic">Not provided</span>}
            </p>
            <p>
              <strong>Professional Email:</strong>{" "}
              {form.professional_email || (
                <span className="text-gray-400 italic">Not provided</span>
              )}
            </p>
          </div>

          {/* Bloc 3 — Détails bancaires & légaux */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Bank & Legal Details</h4>
            <p>
              <strong>IBAN:</strong>{" "}
              {form.iban || <span className="text-gray-400 italic">Not provided</span>}
            </p>
            <p>
              <strong>VAT Number:</strong>{" "}
              {form.no_vat ? (
                <span className="text-gray-500 italic">Not subject to VAT</span>
              ) : (
                form.vat_number || <span className="text-gray-400 italic">Not provided</span>
              )}
            </p>
            <p>
              <strong>Company Number:</strong>{" "}
              {form.company_number || <span className="text-gray-400 italic">Not provided</span>}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Bloc 1 — Informations personnelles */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Personal Information</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <input
                name="first_name"
                value={form.first_name || ""}
                onChange={handleChange}
                placeholder="First name"
                className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
              />
              <input
                name="last_name"
                value={form.last_name || ""}
                onChange={handleChange}
                placeholder="Last name"
                className="border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <input
              name="address"
              value={form.address || ""}
              onChange={handleChange}
              placeholder="Personal address (street, number, postal code, city)"
              className="w-full border rounded-lg px-4 py-2 mt-3 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Bloc 2 — Informations professionnelles */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Business Information</h4>
            <input
              name="business_name"
              value={form.business_name || ""}
              onChange={handleChange}
              placeholder="Business name"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <input
              name="business_address"
              value={form.business_address || ""}
              onChange={handleChange}
              placeholder="Business address (street, number, postal code, city)"
              className="w-full border rounded-lg px-4 py-2 mt-3 focus:ring-2 focus:ring-rose-500"
            />
            <input
              name="professional_email"
              value={form.professional_email || ""}
              onChange={handleChange}
              placeholder="Professional email"
              type="email"
              className="w-full border rounded-lg px-4 py-2 mt-3 focus:ring-2 focus:ring-rose-500"
            />
          </div>

          {/* Bloc 3 — Détails bancaires & légaux */}
          <div>
            <h4 className="text-md font-semibold text-gray-800 mb-2">Bank & Legal Details</h4>
            <input
              name="iban"
              value={form.iban || ""}
              onChange={handleChange}
              placeholder="IBAN"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">VAT Number</label>
              <input
                name="vat_number"
                value={form.vat_number || ""}
                onChange={handleChange}
                placeholder="ex: BE0123456789"
                disabled={form.no_vat}
                className={`w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 ${
                  form.no_vat ? "bg-gray-100 text-gray-400 cursor-not-allowed" : ""
                }`}
              />
              <div className="flex items-center mt-2">
                <input
                  id="no_vat"
                  name="no_vat"
                  type="checkbox"
                  checked={!!form.no_vat}
                  onChange={handleChange}
                  className="h-4 w-4 text-rose-600 border-gray-300 rounded"
                />
                <label htmlFor="no_vat" className="ml-2 text-sm text-gray-700">
                  I am not subject to VAT
                </label>
              </div>
            </div>
            <input
              name="company_number"
              value={form.company_number || ""}
              onChange={handleChange}
              placeholder="Company number"
              className="w-full border rounded-lg px-4 py-2 mt-3 focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>
      )}

      {/* Stripe section (inchangée) */}
      <div className="mt-8 border-t pt-4">
        <h4 className="font-semibold text-gray-800 mb-2">Payouts (Stripe Connect)</h4>

        {form.payouts_enabled ? (
          <p className="text-green-600 text-sm flex items-center gap-1">
            ✅ Connected to Stripe — payouts enabled
          </p>
        ) : (
          <button
            onClick={async () => {
              try {
                setConnecting(true);
                const res = await fetch(
                  "https://cdcnylgokphyltkctymi.functions.supabase.co/create-stripe-account",
                  {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: `Bearer ${session?.access_token}`,
                    },
                    body: JSON.stringify({
                      user_id: user?.id,
                      email: user?.email,
                    }),
                  }
                );
                const data = await res.json();
                if (data.url) {
                  await supabase
                    .from("users")
                    .update({ stripe_account_id: data.account_id })
                    .eq("id", user.id);
                  window.location.href = data.url;
                } else {
                  setToast({
                    message: "❌ Error creating Stripe account.",
                    type: "error",
                  });
                }
              } catch (err) {
                console.error(err);
                setToast({
                  message: "❌ Connection error.",
                  type: "error",
                });
              } finally {
                setConnecting(false);
              }
            }}
            disabled={connecting}
            className={`px-4 py-2 rounded-full font-semibold transition-transform ${
              connecting
                ? "bg-gray-300 text-gray-600 cursor-not-allowed"
                : "bg-gradient-to-r from-rose-600 to-red-600 text-white hover:scale-[1.02]"
            }`}
          >
            {connecting ? "Redirecting to Stripe…" : "Connect to Stripe"}
          </button>
        )}
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
