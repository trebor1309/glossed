import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Save } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const EMPTY_DECLARATION = {
  residence_country_code: "",
  tax_residence_country_codes: "",
  service_country_code: "",
  provider_status_code: "",
  trader_classification: "",
  business_registration_number: "",
  vat_number: "",
};

const normalizeCountryCode = (value) => value.trim().toUpperCase();

export default function ProviderEligibilityDeclaration({
  businessRegistrationNumber = "",
  vatNumber = "",
  onReadyChange,
}) {
  const [form, setForm] = useState(EMPTY_DECLARATION);
  const [latest, setLatest] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const operationIdRef = useRef(null);

  const loadLatest = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: loadError } = await supabase.rpc(
      "get_my_latest_provider_eligibility_declaration"
    );
    if (loadError) {
      setError("Unable to load your provider declaration.");
      onReadyChange?.(false);
    } else {
      const declaration = data?.[0] ?? null;
      setLatest(declaration);
      setEditing(!declaration);
      onReadyChange?.(Boolean(declaration));
    }
    setLoading(false);
  }, [onReadyChange]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  const beginRevision = () => {
    setForm(
      latest
        ? {
            residence_country_code: latest.residence_country_code ?? "",
            tax_residence_country_codes: (latest.tax_residence_country_codes ?? []).join(", "),
            service_country_code: latest.service_country_code ?? "",
            provider_status_code: latest.provider_status_code ?? "",
            trader_classification: latest.trader_classification ?? "",
            business_registration_number: latest.business_registration_number ?? "",
            vat_number: latest.vat_number ?? "",
          }
        : {
            ...EMPTY_DECLARATION,
            business_registration_number: businessRegistrationNumber,
            vat_number: vatNumber,
          }
    );
    operationIdRef.current = null;
    setError("");
    setEditing(true);
  };

  useEffect(() => {
    if (!loading && !latest && editing) {
      setForm((current) => ({
        ...current,
        business_registration_number:
          current.business_registration_number || businessRegistrationNumber,
        vat_number: current.vat_number || vatNumber,
      }));
    }
  }, [businessRegistrationNumber, editing, latest, loading, vatNumber]);

  const update = (field, value) => {
    operationIdRef.current = null;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    const residenceCountry = normalizeCountryCode(form.residence_country_code);
    const serviceCountry = normalizeCountryCode(form.service_country_code);
    const taxResidences = form.tax_residence_country_codes
      .split(",")
      .map(normalizeCountryCode)
      .filter(Boolean);
    const providerStatus = form.provider_status_code.trim().toLowerCase();
    const traderClassification = form.trader_classification.trim();

    if (!/^[A-Z]{2}$/.test(residenceCountry) || !/^[A-Z]{2}$/.test(serviceCountry)) {
      setError("Residence and service countries must use their two-letter country codes.");
      return;
    }
    if (taxResidences.some((code) => !/^[A-Z]{2}$/.test(code))) {
      setError("Tax residence countries must use two-letter country codes.");
      return;
    }
    if (!/^[a-z][a-z0-9_.-]{1,99}$/.test(providerStatus)) {
      setError("Enter a provider status code using letters, numbers, dots, dashes or underscores.");
      return;
    }
    if (!traderClassification) {
      setError("Describe the trader or non-trader classification that applies to you.");
      return;
    }

    operationIdRef.current ||= crypto.randomUUID();
    setSaving(true);
    const { data, error: saveError } = await supabase.rpc(
      "submit_provider_eligibility_declaration",
      {
        p_residence_country_code: residenceCountry,
        p_tax_residence_country_codes: taxResidences,
        p_service_country_code: serviceCountry,
        p_provider_status_code: providerStatus,
        p_trader_classification: traderClassification,
        p_business_registration_number: form.business_registration_number.trim() || null,
        p_vat_number: form.vat_number.trim() || null,
        p_declaration_data: { source: "provider_legal_billing" },
        p_deduplication_key: `provider-eligibility-declaration:${operationIdRef.current}`,
      }
    );
    setSaving(false);

    if (saveError || !data) {
      setError(saveError?.message || "Unable to save your provider declaration.");
      return;
    }

    setLatest(data);
    setEditing(false);
    operationIdRef.current = null;
    onReadyChange?.(true);
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Loading provider declaration…</p>;
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="font-semibold text-gray-800">Provider eligibility declaration</h4>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Tell Glossed which legal or professional status applies to you where you live and
            provide services. This is your declaration, not an eligibility decision. Saving it does
            not approve your eligibility; Glossed assesses eligibility separately under the
            applicable jurisdiction policy.
          </p>
        </div>
        {latest && !editing && (
          <button
            type="button"
            onClick={beginRevision}
            className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
          >
            Update declaration
          </button>
        )}
      </div>

      {latest && !editing ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
          <span>
            Declaration revision {latest.revision} saved on{" "}
            {new Date(latest.created_at).toLocaleDateString()}. Your current eligibility decision
            remains separate.
          </span>
        </div>
      ) : (
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <DeclarationField
              label="Country of residence (2-letter code)"
              value={form.residence_country_code}
              onChange={(value) => update("residence_country_code", value)}
              maxLength={2}
              required
            />
            <DeclarationField
              label="Country where services are provided (2-letter code)"
              value={form.service_country_code}
              onChange={(value) => update("service_country_code", value)}
              maxLength={2}
              required
            />
            <DeclarationField
              label="Tax residence country codes (comma-separated, if applicable)"
              value={form.tax_residence_country_codes}
              onChange={(value) => update("tax_residence_country_codes", value)}
            />
            <DeclarationField
              label="Applicable provider status code"
              value={form.provider_status_code}
              onChange={(value) => update("provider_status_code", value)}
              required
            />
            <DeclarationField
              label="Trader / non-trader classification"
              value={form.trader_classification}
              onChange={(value) => update("trader_classification", value)}
              required
            />
            <DeclarationField
              label="Business registration number (if applicable)"
              value={form.business_registration_number}
              onChange={(value) => update("business_registration_number", value)}
            />
            <DeclarationField
              label="VAT number (if applicable)"
              value={form.vat_number}
              onChange={(value) => update("vat_number", value)}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              <AlertCircle className="mt-0.5 shrink-0" size={17} />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              <Save size={16} />
              {saving ? "Saving…" : "Save declaration"}
            </button>
            {latest && (
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setError("");
                  operationIdRef.current = null;
                }}
                className="rounded-full bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function DeclarationField({ label, value, onChange, required = false, maxLength }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={maxLength}
        className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900"
      />
    </label>
  );
}
