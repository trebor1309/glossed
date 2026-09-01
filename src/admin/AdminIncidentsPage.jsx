import { useCallback, useEffect, useState } from "react";
import { AlertOctagon, AlertTriangle, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { getAdminIncidentCounts, listAdminFinancialIncidents } from "./adminOperationsApi";
import { adminLabel } from "./adminPresentation";
import { useAdminI18n } from "./AdminI18nContext";

export default function AdminIncidentsPage() {
  const { t } = useAdminI18n();
  const [queue, setQueue] = useState("open");
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [result, nextCounts] = await Promise.all([listAdminFinancialIncidents(queue), getAdminIncidentCounts()]); setData(result); setCounts(nextCounts); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><AlertTriangle className="text-rose-600" /> {t("incidents.title")}</h1><p className="mt-2 text-sm text-slate-600">Déficits, remédiations ou transferts en revue, payouts échoués et contrôles financiers bloqués.</p>{counts.blocking > 0 && <p className="mt-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 p-4 font-semibold text-red-800"><AlertOctagon size={20} /> {counts.blocking} incident{counts.blocking === 1 ? "" : "s"} bloque{counts.blocking === 1 ? "" : "nt"} la création de nouveaux Checkouts.</p>}<div className="mt-4 flex flex-wrap gap-2">{[["open", "incidents.open"], ["all", "common.all"]].map(([value,label]) => <button key={value} type="button" onClick={() => setQueue(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${queue === value ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{t(label)} ({counts[value] ?? "—"})</button>)}<button type="button" onClick={load} aria-label={t("common.refresh")} className="rounded-lg border px-3"><RefreshCw size={17} /></button></div></header>
    {loading && <LoadingPanel />}{error && <ErrorPanel error={error} retry={load} />}
    {data && !loading && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} incident{data.total === 1 ? "" : "s"} · {counts.critical || 0} critique{counts.critical === 1 ? "" : "s"} · {counts.blocking || 0} bloquant{counts.blocking === 1 ? "" : "s"}</div>{data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{t("incidents.empty")}</p> : <div className="divide-y divide-slate-100">{data.items.map((item) => {
      const blocking = item.incident_type === "runtime_control_blocked";
      return <Link key={item.incident_key} to={`/incidents/${encodeURIComponent(item.incident_key)}`} className={`grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[1fr_1.5fr_1fr_auto] lg:items-center ${blocking ? "border-l-4 border-red-600 bg-red-50/40" : ""}`}><div><StateBadge value={blocking ? "blocking" : item.severity} label={blocking ? "Bloquant" : "Critique"} /><p className="mt-2 text-sm font-semibold">{adminLabel(item.incident_type)}</p>{blocking && <p className="mt-1 text-xs font-semibold text-red-700">{t("incidents.blocking")}</p>}</div><div className="min-w-0"><p className="truncate text-sm">{item.detail}</p><p className="mt-1 font-mono text-xs text-slate-500">{shortId(item.payment_id || item.source_id)}</p></div><div><p className="font-semibold">{formatCents(item.divergence_amount_cents ?? item.glossed_amount_cents, item.currency?.toUpperCase())}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.occurred_at)}</p></div><span className="text-sm font-semibold text-rose-700">Examiner</span></Link>;
    })}</div>}</section>}
  </div>;
}
