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
    iban: "",
    vat_number: "",
    company_number: "",
    address: "",
  });

  // 🔍 Charger les infos depuis Supabase
  useEffect(() => {
    const loadLegal = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select("iban, vat_number, company_number, address")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error("❌ Supabase error:", error.message);
      if (data) setForm((prev) => ({ ...prev, ...data }));
    };
    loadLegal();
  }, [user?.id]);

  // ✏️ Changement de champ
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // 💾 Sauvegarde
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = { ...form, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from("users")
      .update(updates)
      .eq("id", user.id);

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
        <h3 className="text-lg font-semibold text-gray-800">
          Legal & Billing Information
        </h3>
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
        <div className="space-y-3 text-gray-700">
          <p>
            <strong>IBAN:</strong>{" "}
            {form.iban ? (
              <span className="text-gray-800">{form.iban}</span>
            ) : (
              <span className="text-gray-400 italic">Not provided</span>
            )}
          </p>
          <p>
            <strong>VAT Number:</strong>{" "}
            {form.vat_number ? (
              <span className="text-gray-800">{form.vat_number}</span>
            ) : (
              <span className="text-gray-400 italic">Not provided</span>
            )}
          </p>
          <p>
            <strong>Company Number:</strong>{" "}
            {form.company_number ? (
              <span className="text-gray-800">{form.company_number}</span>
            ) : (
              <span className="text-gray-400 italic">Not provided</span>
            )}
          </p>
          <p>
            <strong>Registered Address:</strong>{" "}
            {form.address ? (
              <span className="text-gray-800">{form.address}</span>
            ) : (
              <span className="text-gray-400 italic">Not provided</span>
            )}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* IBAN */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              IBAN
            </label>
            <input
              name="iban"
              value={form.iban}
              onChange={handleChange}
              type="text"
              placeholder="ex: BE12 3456 7890 1234"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* VAT */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              VAT Number
            </label>
            <input
              name="vat_number"
              value={form.vat_number}
              onChange={handleChange}
              type="text"
              placeholder="ex: BE0123456789"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* Company Number */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Number
            </label>
            <input
              name="company_number"
              value={form.company_number}
              onChange={handleChange}
              type="text"
              placeholder="ex: 0123.456.789"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Registered Address
            </label>
            <input
              name="address"
              value={form.address}
              onChange={handleChange}
              type="text"
              placeholder="Street, number, postal code, city"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>
        </div>
      )}
      {/* --- Stripe Connect --- */}
      <div className="mt-8 border-t pt-4">
        <h4 className="font-semibold text-gray-800 mb-2">
          Payouts (Stripe Connect)
        </h4>

        {form.payouts_enabled ? (
          <p className="text-green-600 text-sm flex items-center gap-1">
            ✅ Connected to Stripe — payouts enabled
          </p>
        ) : (
          <button
            onClick={async () => {
              try {
                setConnecting(true); // 🟡 active le mode "loading"

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
                  // ✅ Enregistre l’account_id Stripe dans Supabase
                  await supabase
                    .from("users")
                    .update({ stripe_account_id: data.account_id })
                    .eq("id", user.id);

                  // 🚀 Redirige le pro vers Stripe
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
                setConnecting(false); // 🟢 repasse en mode normal
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
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
