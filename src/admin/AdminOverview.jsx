import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Building2, FileWarning, KeyRound, Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, formatCents, formatDate, shortId } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import { getOperationsOverview } from "./adminOperationsApi";

const queueDefinitions = [
  { key: "verifications", title: "Vérifications", icon: BadgeCheck, route: "/verifications", empty: "Aucune vérification en attente." },
  { key: "service_disputes", title: "Litiges de prestation", icon: FileWarning, route: "/litiges", empty: "Aucun litige ouvert." },
  { key: "financial_incidents", title: "Incidents financiers", icon: AlertTriangle, route: "/incidents", empty: "Aucun incident financier en revue." },
  { key: "chargebacks", title: "Chargebacks / risque", icon: ShieldAlert, route: "/risque", empty: "Aucun chargeback ouvert." },
  { key: "mission_anomalies", title: "Missions en anomalie", icon: AlertTriangle, route: "/missions", empty: "Aucune anomalie de mission." },
  { key: "connect_actions", title: "Comptes Stripe à traiter", icon: Building2, route: "/utilisateurs", empty: "Aucun compte Connect ne nécessite d’action." },
];

function queueItemText(key, item) {
  if (key === "verifications") return `${item.label} · ${item.email || "sans email"}`;
  if (key === "connect_actions") return `${item.label} · ${item.creation_state} / ${item.stripe_transfers_status}`;
  if (key === "chargebacks") return `${item.reason_code || item.stripe_status} · ${formatCents(item.amount_debited_cents, item.currency)}`;
  return item.detail || item.reason || item.issue_code || item.incident_type || item.anomaly_type;
}

function queueItemRoute(key, item, fallback) {
  if (key === "verifications") return "/verifications";
  if (key === "connect_actions") return `/utilisateurs/${item.provider_id}`;
  return item.mission_id ? `/missions/${item.mission_id}` : fallback;
}

export default function AdminOverview() {
  const { access, hasPermission, factors, verifyMfa, loading: authLoading } = useAdminAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setOverview(await getOperationsOverview()); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const reauthenticate = async (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    try { await verifyMfa(code, factors[0]?.id); setMessage({ type: "success", text: "Réauthentification financière actualisée." }); event.currentTarget.reset(); }
    catch (reauthError) { setMessage({ type: "error", text: reauthError.message }); }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white shadow-lg">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-400">Centre d’opérations</p><h1 className="mt-2 text-3xl font-bold">Vue d’ensemble</h1><p className="mt-3 max-w-2xl text-sm text-slate-300">Files d’action calculées côté serveur selon vos permissions. Les données financières restent en lecture seule.</p></div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualiser</button>
      </header>

      {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {queueDefinitions.map((definition) => {
            const queue = overview.queues[definition.key];
            if (!queue?.available) return null;
            const Icon = definition.icon;
            return <section key={definition.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Icon size={19} className="text-rose-600" /><h2 className="font-bold">{definition.title}</h2></div><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{queue.count}</span></div>{queue.items.length === 0 ? <p className="mt-5 text-sm text-slate-500">{definition.empty}</p> : <div className="mt-4 divide-y divide-slate-100">{queue.items.slice(0, 5).map((item) => <Link key={item.incident_id || item.dispute_id || item.user_id || item.provider_id || `${item.mission_id}-${item.occurred_at}`} to={queueItemRoute(definition.key, item, definition.route)} className="block py-3 hover:text-rose-700"><p className="truncate text-sm font-semibold">{queueItemText(definition.key, item) || "Action requise"}</p><p className="mt-1 font-mono text-xs text-slate-400">{shortId(item.mission_id || item.provider_id || item.user_id || item.incident_id)} · {formatDate(item.occurred_at || item.opened_at || item.submitted_at || item.updated_at || item.created_at)}</p></Link>)}</div>}<Link to={definition.route} className="mt-4 inline-block text-sm font-semibold text-rose-700">Ouvrir l’espace →</Link></section>;
          })}
        </div>
      )}

      {hasPermission("finance.execute") && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><KeyRound className="mt-1 text-amber-600" /><div><h2 className="text-lg font-bold">Réauthentification financière</h2><p className="mt-1 text-sm text-slate-600">Les futures actions financières manuelles exigeront un MFA récent. Aucune de ces actions n’est disponible dans cette tranche.</p></div></div>
          {access.financial_reauthentication_required && <form onSubmit={reauthenticate} className="mt-5 flex max-w-md flex-col gap-3 sm:flex-row"><input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" placeholder="Code MFA" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-center tracking-[0.3em] outline-none focus:border-rose-500" /><button disabled={authLoading || factors.length === 0} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">{authLoading && <Loader2 size={16} className="animate-spin" />} Réauthentifier</button></form>}
          {!access.financial_reauthentication_required && <p className="mt-4 text-sm font-semibold text-emerald-700">La réauthentification financière est récente.</p>}
          {message && <p className={`mt-3 text-sm ${message.type === "error" ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
        </section>
      )}
    </div>
  );
}
