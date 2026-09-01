import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, BadgeCheck, Building2, FileWarning, KeyRound, RefreshCw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, formatCents, formatDate, shortId } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { getConnectActionQueue, getOperationsOverview } from "./adminOperationsApi";
import { connectAccountPresentation } from "./adminPresentation";

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
  if (key === "connect_actions") return item.label;
  if (key === "chargebacks") return `${item.reason_code || item.stripe_status} · ${formatCents(item.amount_debited_cents, item.currency)}`;
  return item.detail || item.reason || item.issue_code || item.incident_type || item.anomaly_type;
}

function queueItemRoute(key, item, fallback) {
  if (key === "verifications") return "/verifications";
  if (key === "connect_actions") return `/utilisateurs/${item.provider_id}`;
  return item.mission_id ? `/missions/${item.mission_id}` : fallback;
}

export default function AdminOverview() {
  const { hasPermission } = useAdminAuth();
  const canReadUsers = hasPermission("users.read");
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [operations, connectActions] = await Promise.all([
        getOperationsOverview(),
        canReadUsers ? getConnectActionQueue() : Promise.resolve(null),
      ]);
      if (connectActions && operations?.queues) operations.queues.connect_actions = connectActions;
      setOverview(operations);
    }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [canReadUsers]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white shadow-lg">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-400">Centre d’opérations</p><h1 className="mt-2 text-3xl font-bold">Vue d’ensemble</h1><p className="mt-3 max-w-2xl text-sm text-slate-300">Files d’action calculées côté serveur selon vos permissions. Les opérations sensibles utilisent les workflows sécurisés, avec prévisualisation et audit.</p></div>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-800 disabled:opacity-50"><RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualiser</button>
      </header>

      {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {queueDefinitions.map((definition) => {
            const queue = overview.queues[definition.key];
            if (!queue?.available) return null;
            const Icon = definition.icon;
            return <section key={definition.key} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><Icon size={19} className="text-rose-600" /><h2 className="font-bold">{definition.title}</h2></div><span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold text-white">{queue.count}</span></div>{queue.items.length === 0 ? <p className="mt-5 text-sm text-slate-500">{definition.empty}</p> : <div className="mt-4 divide-y divide-slate-100">{queue.items.slice(0, 5).map((item) => {
              const connectState = definition.key === "connect_actions" ? connectAccountPresentation(item) : null;
              return <Link key={item.incident_id || item.dispute_id || item.user_id || item.provider_id || `${item.mission_id}-${item.occurred_at}`} to={queueItemRoute(definition.key, item, definition.route)} className="block py-3 hover:text-rose-700"><p className="truncate text-sm font-semibold">{connectState ? `${item.label} — ${connectState.label}` : queueItemText(definition.key, item) || "Action requise"}</p>{connectState && <p className="mt-1 text-xs text-slate-600">{connectState.reason}</p>}<p className="mt-1 font-mono text-xs text-slate-400">{shortId(item.mission_id || item.provider_id || item.user_id || item.incident_id)} · {formatDate(item.occurred_at || item.opened_at || item.submitted_at || item.updated_at || item.created_at)}</p>{connectState && <p className="mt-2 text-xs font-semibold text-rose-700">Ouvrir le compte à traiter →</p>}</Link>;
            })}</div>}<Link to={definition.route} className="mt-4 inline-block text-sm font-semibold text-rose-700">Ouvrir l’espace →</Link></section>;
          })}
        </div>
      )}

      {hasPermission("finance.execute") && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><KeyRound className="mt-1 text-amber-600" /><div><h2 className="text-lg font-bold">Sécurité des actions sensibles</h2><p className="mt-1 text-sm text-slate-600">Les actions financières et administratives sensibles exigent une réauthentification MFA récente en plus des permissions serveur.</p></div></div>
          <div className="mt-5"><AdminMfaReauthentication showStatus /></div>
        </section>
      )}
    </div>
  );
}
