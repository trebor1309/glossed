// 📄 src/pages/prodashboard/pages/settings/LegalBilling.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Save, Edit2, ShieldCheck, AlertCircle, Link as LinkIcon } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function LegalBilling() {
  const { user, session, fetchUserProfile } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    company_number: "",
    vat_number: "",
    no_vat: false,
    professional_email: "",
    iban: "",

    stripe_account_ready: false,
    stripe_payouts_enabled: false,
    stripe_account_id: null,
  });

  /* -------------------------------------------------------------------
     📌 CHARGER INFOS LÉGALES + STRIPE
  ------------------------------------------------------------------- */
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          company_number,
          vat_number,
          no_vat,
          professional_email,
          iban,
          stripe_account_ready,
          stripe_payouts_enabled,
          stripe_account_id
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) return console.error("❌ Legal load error:", error.message);

      if (data) {
        setForm({
          company_number: data.company_number || "",
          vat_number: data.vat_number || "",
          no_vat: data.no_vat || false,
          professional_email: data.professional_email || "",
          iban: data.iban || "",

          stripe_account_ready: !!data.stripe_account_ready,
          stripe_payouts_enabled: !!data.stripe_payouts_enabled,
          stripe_account_id: data.stripe_account_id || null,
        });
      }
    })();
  }, [user?.id]);

  /* -------------------------------------------------------------------
     💾 SAUVEGARDE INFOS LÉGALES
  ------------------------------------------------------------------- */
  const handleSave = async () => {
    if (!user?.id) return;

    setSaving(true);

    const payload = {
      company_number: form.company_number.trim(),
      vat_number: form.no_vat ? null : form.vat_number.trim(),
      no_vat: form.no_vat,
      professional_email: form.professional_email.trim(),
      iban: form.iban.trim(),
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(payload).eq("id", user.id);

    setSaving(false);

    if (error) {
      setToast({ type: "error", message: "Error saving legal settings." });
    } else {
      setToast({ type: "success", message: "Legal information updated!" });
      setEditing(false);
      await fetchUserProfile(session.user);
    }
  };

  /* -------------------------------------------------------------------
     🔗 STRIPE — CONNECT
  ------------------------------------------------------------------- */
  const handleStripeConnect = () => {
    window.location.href = "/prodashboard/stripe/refresh";
  };

  /* -------------------------------------------------------------------
     ❌ STRIPE — DISCONNECT
  ------------------------------------------------------------------- */
  const handleStripeDisconnect = async () => {
    const { error } = await supabase
      .from("users")
      .update({
        stripe_account_id: null,
        stripe_account_ready: false,
        stripe_payouts_enabled: false,
      })
      .eq("id", user.id);

    if (error) {
      setToast({ type: "error", message: error.message });
    } else {
      setToast({ type: "success", message: "Stripe account disconnected." });
      setForm((f) => ({
        ...f,
        stripe_account_ready: false,
        stripe_payouts_enabled: false,
        stripe_account_id: null,
      }));

      await fetchUserProfile(session.user);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Legal & Billing</h3>
          <p className="text-sm text-gray-500 mt-1">
            Required information for invoices, payouts and legal compliance.
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

      {/* READ MODE */}
      {!editing ? (
        <div className="space-y-6 text-gray-700">
          <Item label="Company number" value={form.company_number} />
          <Item label="VAT number" value={form.no_vat ? "Not subject to VAT" : form.vat_number} />
          <Item label="Professional email" value={form.professional_email || user.email} />
          <Item label="IBAN" value={form.iban} />

          {/* Stripe Status */}
          <div className="p-4 bg-gray-50 border rounded-xl">
            <h4 className="font-semibold mb-2">Stripe Status</h4>

            {form.stripe_account_ready ? (
              <p className="text-green-600 flex items-center gap-2">
                <ShieldCheck size={16} /> Connected & verified
              </p>
            ) : (
              <p className="text-amber-600 flex items-center gap-2">
                <AlertCircle size={16} /> Not connected
              </p>
            )}

            <div className="flex gap-3 mt-3">
              <button
                onClick={handleStripeConnect}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm transition"
              >
                <LinkIcon size={15} />
                {form.stripe_account_ready ? "Reconnect Stripe" : "Connect Stripe"}
              </button>

              {form.stripe_account_ready && (
                <button
                  onClick={handleStripeDisconnect}
                  className="px-4 py-2 rounded-full bg-gray-200 hover:bg-gray-300 text-sm text-gray-600"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* EDIT MODE */
        <div className="space-y-6">
          {/* Company number */}
          <Field
            label="Company number"
            value={form.company_number}
            onChange={(v) => setForm((p) => ({ ...p, company_number: v }))}
          />

          {/* VAT option */}
          <div>
            <label className="font-medium text-sm text-gray-700">VAT number</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.no_vat}
                onChange={() => setForm((p) => ({ ...p, no_vat: !p.no_vat }))}
              />
              <span className="text-sm text-gray-600">I am not subject to VAT</span>
            </div>

            {!form.no_vat && (
              <input
                type="text"
                className="w-full mt-2 px-4 py-2 border rounded-lg"
                placeholder="BE0123456789"
                value={form.vat_number}
                onChange={(e) => setForm((prev) => ({ ...prev, vat_number: e.target.value }))}
              />
            )}
          </div>

          {/* Professional email */}
          <Field
            label="Professional email"
            value={form.professional_email}
            onChange={(v) => setForm((p) => ({ ...p, professional_email: v }))}
            placeholder={user.email}
          />

          {/* IBAN */}
          <Field
            label="IBAN"
            value={form.iban}
            onChange={(v) => setForm((p) => ({ ...p, iban: v }))}
            placeholder="BE12 3456 7890 1234"
          />
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

/* Small components */
function Item({ label, value }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-800">{label}</h4>
      <p className="text-gray-600">{value || <span className="text-gray-400">—</span>}</p>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="font-medium text-sm text-gray-700">{label}</label>
      <input
        type="text"
        className="w-full mt-1 px-4 py-2 border rounded-lg"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
