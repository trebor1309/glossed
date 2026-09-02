import { useCallback, useEffect, useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import {
  AdminPanel,
  ErrorPanel,
  LoadingPanel,
  StateBadge,
  formatCents,
  formatDate,
} from "./AdminDataUi";
import { createAdminConfigurationVersion, getAdminConfiguration } from "./adminOperationsApi";
import { isRecentMfaError } from "./adminPresentation";

const DAYS = [
  [1, "Lundi"],
  [2, "Mardi"],
  [3, "Mercredi"],
  [4, "Jeudi"],
  [5, "Vendredi"],
  [6, "Samedi"],
  [7, "Dimanche"],
];
const initialForms = {
  liquidity_limit: { currency: "eur", warning_euros: "1000", blocking_euros: "2000", notes: "" },
  checkout_policy: {
    currency: "eur",
    open_days: "30",
    deadline_hours: "24",
    ttl_minutes: "30",
    margin_hours: "1",
    liquidity_limit_version: "",
    stripe_payment_method_configuration_reference: "",
    notes: "",
  },
  payout_policy: {
    currency: "eur",
    schedule_timezone: "Europe/Brussels",
    standard_payout_isodays: [1, 4],
    standard_payout_local_time: "09:00",
    minimum_euros: "0",
    instant_quote_minutes: "5",
    stripe_instant_cost_percent: "1",
    effective_from: "",
    notes: "",
  },
  jurisdiction_policy_structure: { jurisdiction_code: "", policy_type: "eligibility", notes: "" },
};
const humanFlag = (code) =>
  ({
    checkout_v2: "Checkout marketplace v2",
    completion_release_v2: "Fin de prestation, libération et transfert v2",
    financial_remediation_v2: "Annulations, litiges et remboursements v2",
    provider_payouts_v2: "Soldes et payouts prestataires v2",
  })[code] || "Fonction financière non documentée";
const humanControl = (code) =>
  ({ new_checkout_creation: "Création de nouveaux Checkouts" })[code] ||
  String(code || "Contrôle sans libellé");
const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2";
const toCents = (value) => Math.round(Number(value) * 100);
const toSeconds = (value, factor) => Math.round(Number(value) * factor);

function VersionTable({ title, description, items, fields }) {
  return (
    <AdminPanel title={title} description={description}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune version enregistrée.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2">Référence</th>
                {fields.map(([key, label]) => (
                  <th key={key} className="px-3 py-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={`${item.version}-${item.currency || item.jurisdiction_code || "global"}`}
                  className="border-b last:border-0"
                >
                  <td className="px-3 py-3">
                    {item.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
                        Version active
                      </span>
                    ) : item.is_latest ? (
                      <span className="rounded-full bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700">
                        Dernière version créée
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Historique</span>
                    )}
                  </td>
                  {fields.map(([key, , render]) => (
                    <td key={key} className="px-3 py-3">
                      {render
                        ? render(item[key], item)
                        : key.includes("at") || key.includes("from")
                          ? formatDate(item[key])
                          : String(item[key] ?? "—")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPanel>
  );
}

function Field({ label, children }) {
  return (
    <label className="text-sm font-semibold">
      {label}
      {children}
    </label>
  );
}

function ConfigurationFields({ type, form, setForm, liquidityVersions }) {
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  if (type === "liquidity_limit")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Seuil d’alerte (EUR)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.warning_euros}
            onChange={(e) => update("warning_euros", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Seuil critique (EUR)">
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.blocking_euros}
            onChange={(e) => update("blocking_euros", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
      </div>
    );
  if (type === "checkout_policy")
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ouverture avant la prestation (jours)">
          <input
            type="number"
            min="1"
            value={form.open_days}
            onChange={(e) => update("open_days", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Délai accordé pour payer (heures)">
          <input
            type="number"
            min="0.5"
            step="0.5"
            value={form.deadline_hours}
            onChange={(e) => update("deadline_hours", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Durée de la session Checkout (minutes)">
          <input
            type="number"
            min="30"
            max="1440"
            value={form.ttl_minutes}
            onChange={(e) => update("ttl_minutes", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Marge d’expiration avant prestation (heures)">
          <input
            type="number"
            min="0"
            step="0.5"
            value={form.margin_hours}
            onChange={(e) => update("margin_hours", e.target.value)}
            className={inputClass}
            required
          />
        </Field>
        <Field label="Version du seuil de liquidité">
          <select
            value={form.liquidity_limit_version}
            onChange={(e) => update("liquidity_limit_version", e.target.value)}
            className={inputClass}
            required
          >
            <option value="">Sélectionner…</option>
            {liquidityVersions
              .filter((item) => item.currency === "eur")
              .map((item) => (
                <option key={`${item.version}-${item.currency}`} value={item.version}>
                  {item.version} · {item.currency.toUpperCase()}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Configuration Stripe des moyens de paiement">
          <input
            value={form.stripe_payment_method_configuration_reference}
            onChange={(e) =>
              update("stripe_payment_method_configuration_reference", e.target.value)
            }
            className={inputClass}
            required
            maxLength={100}
          />
        </Field>
      </div>
    );
  if (type === "payout_policy")
    return (
      <div className="space-y-4">
        <fieldset>
          <legend className="text-sm font-semibold">Jours des versements standards</legend>
          <div className="mt-2 flex flex-wrap gap-3">
            {DAYS.map(([day, label]) => (
              <label
                key={day}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={form.standard_payout_isodays.includes(day)}
                  onChange={(e) =>
                    update(
                      "standard_payout_isodays",
                      e.target.checked
                        ? [...form.standard_payout_isodays, day].sort()
                        : form.standard_payout_isodays.filter((value) => value !== day)
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Heure locale">
            <input
              type="time"
              value={form.standard_payout_local_time}
              onChange={(e) => update("standard_payout_local_time", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Fuseau horaire">
            <input
              value={form.schedule_timezone}
              onChange={(e) => update("schedule_timezone", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Activation">
            <input
              type="datetime-local"
              value={form.effective_from}
              onChange={(e) => update("effective_from", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Seuil minimum Glossed (EUR)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.minimum_euros}
              onChange={(e) => update("minimum_euros", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Validité d’un devis instantané (min)">
            <input
              type="number"
              min="1"
              max="15"
              value={form.instant_quote_minutes}
              onChange={(e) => update("instant_quote_minutes", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
          <Field label="Coût Stripe Instant Payout (%)">
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.stripe_instant_cost_percent}
              onChange={(e) => update("stripe_instant_cost_percent", e.target.value)}
              className={inputClass}
              required
            />
          </Field>
        </div>
      </div>
    );
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Juridiction (code ISO)">
        <input
          value={form.jurisdiction_code}
          onChange={(e) => update("jurisdiction_code", e.target.value.toUpperCase())}
          className={inputClass}
          pattern="[A-Z]{2}(-[A-Z0-9]{1,3})?"
          required
        />
      </Field>
      <Field label="Domaine de politique">
        <select
          value={form.policy_type}
          onChange={(e) => update("policy_type", e.target.value)}
          className={inputClass}
        >
          <option value="eligibility">Éligibilité</option>
          <option value="cancellation">Annulation</option>
          <option value="consumer_rights">Droits consommateurs</option>
          <option value="reporting">Reporting</option>
          <option value="compliance">Conformité</option>
        </select>
      </Field>
      <p className="sm:col-span-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
        Seule une structure vide en brouillon est créée. Aucune règle nationale n’est ajoutée.
      </p>
    </div>
  );
}

function buildPayload(type, form) {
  if (type === "liquidity_limit")
    return {
      metric_code: "checkout_liquidity_exposure",
      currency: "eur",
      comparison_operator: "above",
      warning_threshold_cents: toCents(form.warning_euros),
      blocking_threshold_cents: toCents(form.blocking_euros),
      notes: form.notes,
    };
  if (type === "checkout_policy")
    return {
      currency: "eur",
      payment_window_open_before_start_seconds: toSeconds(form.open_days, 86400),
      payment_deadline_seconds: toSeconds(form.deadline_hours, 3600),
      checkout_ttl_seconds: toSeconds(form.ttl_minutes, 60),
      checkout_expiry_margin_before_start_seconds: toSeconds(form.margin_hours, 3600),
      liquidity_limit_version: form.liquidity_limit_version,
      stripe_payment_method_configuration_reference:
        form.stripe_payment_method_configuration_reference,
      notes: form.notes,
    };
  if (type === "payout_policy")
    return {
      currency: "eur",
      schedule_timezone: form.schedule_timezone,
      standard_payout_isodays: form.standard_payout_isodays,
      standard_payout_local_time: `${form.standard_payout_local_time}:00`,
      minimum_payout_amount_cents: toCents(form.minimum_euros),
      instant_quote_ttl_seconds: toSeconds(form.instant_quote_minutes, 60),
      stripe_instant_cost_rate_bps: Math.round(Number(form.stripe_instant_cost_percent) * 100),
      effective_from: new Date(form.effective_from).toISOString(),
      notes: form.notes,
    };
  return {
    jurisdiction_code: form.jurisdiction_code,
    policy_type: form.policy_type,
    lifecycle_state: "draft",
    notes: form.notes,
  };
}

export default function AdminConfigurationPage() {
  const { hasPermission } = useAdminAuth();
  const [data, setData] = useState(null),
    [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const [type, setType] = useState("liquidity_limit"),
    [version, setVersion] = useState(""),
    [reason, setReason] = useState(""),
    [form, setForm] = useState(initialForms.liquidity_limit),
    [needsMfa, setNeedsMfa] = useState(false);
  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getAdminConfiguration());
    } catch (e) {
      setError(e.message);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const payload = useMemo(() => {
    try {
      return buildPayload(type, form);
    } catch {
      return null;
    }
  }, [type, form]);
  const changeType = (next) => {
    setType(next);
    setForm({ ...initialForms[next] });
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!payload) throw new Error("Les paramètres sont incomplets.");
      await createAdminConfigurationVersion(type, version.trim(), payload, reason.trim());
      setVersion("");
      setReason("");
      setForm({ ...initialForms[type] });
      await load();
    } catch (e) {
      if (isRecentMfaError(e)) {
        setNeedsMfa(true);
        setError(null);
      } else setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  if (!data && !error) return <LoadingPanel />;
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Settings2 className="text-rose-600" />
          Configuration et conformité
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Versions immuables, état réellement appliqué et historique. Aucune règle nationale n’est
          créée sans validation.
        </p>
      </header>
      {error && <ErrorPanel error={error} retry={load} />}
      <AdminPanel title="Contrôles et feature flags">
        <div className="grid gap-3 md:grid-cols-2">
          {[...(data?.feature_flags || [])].map((item) => (
            <div key={item.flag_code} className="rounded-xl border p-4">
              <div className="flex justify-between gap-3">
                <strong>{humanFlag(item.flag_code)}</strong>
                <StateBadge
                  value={item.enabled ? "active" : "disabled"}
                  label={item.enabled ? "Activé" : "Désactivé"}
                />
              </div>
              <details className="mt-3 text-xs text-slate-500">
                <summary>Détails techniques</summary>
                <code>{item.flag_code}</code>
              </details>
            </div>
          ))}
          {[...(data?.runtime_controls || [])].map((item) => (
            <div key={`${item.control_code}-${item.currency}`} className="rounded-xl border p-4">
              <div className="flex justify-between gap-3">
                <strong>{humanControl(item.control_code)}</strong>
                <StateBadge value={item.state} />
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {item.reason || "Aucune action particulière indiquée."}
              </p>
              <details className="mt-3 text-xs text-slate-500">
                <summary>Détails techniques</summary>
                <code>
                  {item.control_code} · {item.currency || "toutes devises"}
                </code>
              </details>
            </div>
          ))}
        </div>
      </AdminPanel>
      <VersionTable
        title="Seuils de liquidité"
        description="La dernière version créée n’est pas automatiquement active : Checkout référence une version précise."
        items={data?.liquidity_limits || []}
        fields={[
          ["version", "Version"],
          ["warning_threshold_cents", "Alerte", (v, i) => formatCents(v, i.currency.toUpperCase())],
          [
            "blocking_threshold_cents",
            "Critique",
            (v, i) => formatCents(v, i.currency.toUpperCase()),
          ],
          ["created_by_email", "Auteur", (v) => v || "Auteur historique non enregistré"],
          ["created_at", "Créée"],
        ]}
      />
      <VersionTable
        title="Fenêtres Checkout"
        description="Chaque sélection référence explicitement sa version ; la création seule ne l’active pas."
        items={data?.checkout_policies || []}
        fields={[
          ["version", "Version"],
          [
            "payment_window_open_before_start_seconds",
            "Ouverture",
            (v) => `${Math.round(v / 86400)} jours avant`,
          ],
          ["payment_deadline_seconds", "Délai", (v) => `${Math.round(v / 3600)} h`],
          ["applied_operation_count", "Opérations"],
          ["created_by_email", "Auteur", (v) => v || "Auteur historique non enregistré"],
          ["created_at", "Créée"],
        ]}
      />
      <VersionTable
        title="Calendriers payouts"
        items={data?.payout_policies || []}
        fields={[
          ["version", "Version"],
          [
            "standard_payout_isodays",
            "Calendrier",
            (v, i) =>
              `${v.map((d) => DAYS.find(([n]) => n === d)?.[1]).join(" et ")} à ${String(i.standard_payout_local_time).slice(0, 5)}`,
          ],
          [
            "minimum_payout_amount_cents",
            "Seuil",
            (v, i) => formatCents(v, i.currency.toUpperCase()),
          ],
          ["effective_from", "Activation"],
          ["created_by_email", "Auteur", (v) => v || "Auteur historique non enregistré"],
        ]}
      />
      <VersionTable
        title="Politiques d’éligibilité existantes"
        items={data?.eligibility_policies || []}
        fields={[
          ["version", "Version"],
          ["jurisdiction_code", "Juridiction"],
          ["effective_from", "Activation"],
          ["created_by_email", "Auteur", (v) => v || "Auteur historique non enregistré"],
        ]}
      />
      <VersionTable
        title="Structures juridictionnelles"
        items={data?.jurisdiction_policies || []}
        fields={[
          ["version", "Version"],
          ["jurisdiction_code", "Juridiction"],
          ["policy_type", "Domaine"],
          ["lifecycle_state", "État", (v) => <StateBadge value={v} />],
          ["created_by_email", "Auteur", (v) => v || "Auteur historique non enregistré"],
          ["created_at", "Créée"],
        ]}
      />
      <VersionTable
        title="Sécurité administrative"
        items={data?.admin_security_policies || []}
        fields={[
          ["version", "Version"],
          [
            "financial_reauthentication_max_age_seconds",
            "Fenêtre MFA financière",
            (v) => `${Math.round(v / 60)} min`,
          ],
          ["effective_from", "Activation"],
        ]}
      />
      {hasPermission("configuration.manage") && (
        <AdminPanel
          title="Créer une version"
          description="La création est protégée par MFA récent et n’active aucun feature flag."
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type">
                <select
                  value={type}
                  onChange={(e) => changeType(e.target.value)}
                  className={inputClass}
                >
                  <option value="liquidity_limit">Seuil de liquidité</option>
                  <option value="checkout_policy">Fenêtre Checkout</option>
                  <option value="payout_policy">Calendrier payout</option>
                  <option value="jurisdiction_policy_structure">Structure juridictionnelle</option>
                </select>
              </Field>
              <Field label="Identifiant de version">
                <input
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className={inputClass}
                  required
                  pattern="[a-z][a-z0-9_.-]{2,99}"
                />
              </Field>
            </div>
            <ConfigurationFields
              type={type}
              form={form}
              setForm={setForm}
              liquidityVersions={data?.liquidity_limits || []}
            />
            <Field label="Notes de la version">
              <textarea
                value={form.notes}
                onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))}
                rows={2}
                className={inputClass}
              />
            </Field>
            <Field label="Justification administrative">
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                minLength={10}
                maxLength={4000}
                rows={3}
                className={inputClass}
                required
              />
            </Field>
            <details className="rounded-xl border bg-slate-50 p-3 text-xs">
              <summary className="cursor-pointer font-semibold">Aperçu JSON avancé</summary>
              <pre className="mt-3 overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </details>
            {needsMfa && (
              <AdminMfaReauthentication required onVerified={() => setNeedsMfa(false)} />
            )}
            <button
              type="submit"
              disabled={busy || version.length < 3 || reason.trim().length < 10 || !payload}
              className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Créer la version immuable
            </button>
          </form>
        </AdminPanel>
      )}
    </div>
  );
}
