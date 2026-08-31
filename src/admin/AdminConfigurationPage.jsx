import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { AdminPanel, ErrorPanel, LoadingPanel, StateBadge, formatDate } from "./AdminDataUi";
import { createAdminConfigurationVersion, getAdminConfiguration } from "./adminOperationsApi";
import { isRecentMfaError } from "./adminPresentation";

const templates = {
  liquidity_limit: { metric_code: "checkout_liquidity_exposure", currency: "eur", comparison_operator: "above", warning_threshold_cents: 0, blocking_threshold_cents: 0, notes: "" },
  checkout_policy: { currency: "eur", payment_window_open_before_start_seconds: 0, payment_deadline_seconds: 0, checkout_ttl_seconds: 0, checkout_expiry_margin_before_start_seconds: 0, liquidity_limit_version: "", stripe_payment_method_configuration_reference: "", notes: "" },
  payout_policy: { currency: "eur", schedule_timezone: "Europe/Brussels", standard_payout_isodays: [1, 4], standard_payout_local_time: "09:00:00", minimum_payout_amount_cents: 0, instant_quote_ttl_seconds: 300, stripe_instant_cost_rate_bps: 0, effective_from: "", notes: "" },
  jurisdiction_policy_structure: { jurisdiction_code: "", policy_type: "eligibility", lifecycle_state: "draft", notes: "" },
};

function VersionTable({ title, items, fields }) {
  return <AdminPanel title={title}>{items.length === 0 ? <p className="text-sm text-slate-500">Aucune version enregistrée.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b">{fields.map(([key,label]) => <th key={key} className="px-3 py-2">{label}</th>)}</tr></thead><tbody>{items.map((item) => <tr key={`${item.version || item.flag_code}-${item.currency || "global"}`} className="border-b last:border-0">{fields.map(([key]) => <td key={key} className="px-3 py-3">{key.includes("state") || key === "enabled" ? <StateBadge value={String(item[key])} /> : key.includes("at") || key.includes("from") ? formatDate(item[key]) : Array.isArray(item[key]) ? item[key].join(", ") : String(item[key] ?? "—")}</td>)}</tr>)}</tbody></table></div>}</AdminPanel>;
}

export default function AdminConfigurationPage() {
  const { hasPermission } = useAdminAuth();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const [type, setType] = useState("liquidity_limit"); const [version, setVersion] = useState(""); const [reason, setReason] = useState("");
  const [payload, setPayload] = useState(JSON.stringify(templates.liquidity_limit, null, 2)); const [needsMfa, setNeedsMfa] = useState(false);
  const load = useCallback(async () => { setError(null); try { setData(await getAdminConfiguration()); } catch (e) { setError(e.message); } }, []);
  useEffect(() => { load(); }, [load]);
  const changeType = (next) => { setType(next); setPayload(JSON.stringify(templates[next], null, 2)); };
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(null); try { await createAdminConfigurationVersion(type, version.trim(), JSON.parse(payload), reason.trim()); setVersion(""); setReason(""); await load(); } catch (e) { if (isRecentMfaError(e)) { setNeedsMfa(true); setError(null); } else setError(e.message); } finally { setBusy(false); } };
  if (!data && !error) return <LoadingPanel />;
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><Settings2 className="text-rose-600" />Configuration et conformité</h1><p className="mt-2 text-sm text-slate-600">Versions immuables et paramètres appliqués aux opérations. La structure juridictionnelle reste vide de toute règle nationale non validée.</p></header>
    {error && <ErrorPanel error={error} retry={load} />}
    <VersionTable title="Contrôles et feature flags" items={[...(data?.feature_flags || []), ...(data?.runtime_controls || [])]} fields={[["flag_code","Flag"],["control_code","Contrôle"],["currency","Devise"],["enabled","Activé"],["state","État"]]} />
    <VersionTable title="Seuils de liquidité" items={data?.liquidity_limits || []} fields={[["version","Version"],["currency","Devise"],["warning_threshold_cents","Alerte (centimes)"],["blocking_threshold_cents","Critique (centimes)"],["created_at","Créée"]]} />
    <VersionTable title="Fenêtres Checkout" items={data?.checkout_policies || []} fields={[["version","Version"],["currency","Devise"],["payment_window_open_before_start_seconds","Ouverture avant début (s)"],["payment_deadline_seconds","Délai paiement (s)"],["applied_operation_count","Opérations"]]} />
    <VersionTable title="Calendriers payouts" items={data?.payout_policies || []} fields={[["version","Version"],["currency","Devise"],["standard_payout_isodays","Jours ISO"],["standard_payout_local_time","Heure"],["minimum_payout_amount_cents","Seuil (centimes)"],["applied_operation_count","Opérations"]]} />
    <VersionTable title="Structures juridictionnelles" items={data?.jurisdiction_policies || []} fields={[["version","Version"],["jurisdiction_code","Juridiction"],["policy_type","Type"],["lifecycle_state","État"],["created_at","Créée"]]} />
    {hasPermission("configuration.manage") && <AdminPanel title="Créer une version" description="Cette action n’active aucun moteur ni feature flag."><form onSubmit={submit} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Type<select value={type} onChange={(event) => changeType(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2"><option value="liquidity_limit">Seuil de liquidité</option><option value="checkout_policy">Fenêtre Checkout</option><option value="payout_policy">Calendrier payout</option><option value="jurisdiction_policy_structure">Structure juridictionnelle</option></select></label><label className="text-sm font-semibold">Identifiant de version<input value={version} onChange={(event) => setVersion(event.target.value)} className="mt-1 w-full rounded-xl border px-3 py-2" required pattern="[a-z][a-z0-9_.-]{2,99}" /></label></div><label className="block text-sm font-semibold">Paramètres JSON<textarea value={payload} onChange={(event) => setPayload(event.target.value)} rows={10} className="mt-1 w-full rounded-xl border px-3 py-2 font-mono text-xs" /></label><label className="block text-sm font-semibold">Justification<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={4000} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2" /></label>{needsMfa && <AdminMfaReauthentication required onVerified={() => setNeedsMfa(false)} />}<button type="submit" disabled={busy || version.length < 3 || reason.trim().length < 10} className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">Créer la version immuable</button></form></AdminPanel>}
  </div>;
}
