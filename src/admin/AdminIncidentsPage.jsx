import { useCallback, useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { listAdminFinancialIncidents } from "./adminOperationsApi";

export default function AdminIncidentsPage() {
  const [queue, setQueue] = useState("open");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await listAdminFinancialIncidents(queue)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><AlertTriangle className="text-rose-600" />Incidents financiers critiques</h1>
      <p className="mt-2 text-sm text-slate-600">Déficits, remédiations ou transferts en revue, payouts échoués et contrôles financiers bloqués.</p>
      <div className="mt-4 flex gap-2">{[["open","À traiter"],["all","Tous"]].map(([value,label]) =>
        <button key={value} type="button" onClick={() => setQueue(value)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${queue === value ? "bg-slate-950 text-white" : "bg-slate-100"}`}>{label}</button>)}</div>
    </header>
    {loading && <LoadingPanel />}{error && <ErrorPanel error={error} retry={load} />}
    {data && !loading && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} incident{data.total === 1 ? "" : "s"}</div>
      {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Aucun incident dans cette file.</p> : <div className="divide-y divide-slate-100">{data.items.map((item) =>
        <Link key={item.incident_key} to={`/incidents/${encodeURIComponent(item.incident_key)}`} className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[1fr_1.5fr_1fr_auto] lg:items-center">
          <div><StateBadge value={item.severity} /><p className="mt-2 text-sm font-semibold">{item.incident_type}</p></div>
          <div className="min-w-0"><p className="truncate text-sm">{item.detail}</p><p className="mt-1 font-mono text-xs text-slate-500">{shortId(item.payment_id || item.source_id)}</p></div>
          <div><p className="font-semibold">{formatCents(item.divergence_amount_cents ?? item.glossed_amount_cents, item.currency?.toUpperCase())}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.occurred_at)}</p></div>
          <span className="text-sm font-semibold text-rose-700">Examiner</span>
        </Link>)}</div>}
    </section>}
  </div>;
}
