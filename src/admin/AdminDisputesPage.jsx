import { useCallback, useEffect, useState } from "react";
import { FileWarning, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { listAdminDisputeCases } from "./adminOperationsApi";

export default function AdminDisputesPage() {
  const [queue, setQueue] = useState("disputes");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await listAdminDisputeCases(queue)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><FileWarning className="text-rose-600" /> Litiges et annulations</h1>
      <p className="mt-2 text-sm text-slate-600">Instruction des dossiers v2. Toute décision financière passe exclusivement par le workflow serveur audité.</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {[{ key: "disputes", label: "Litiges de prestation" }, { key: "cancellations", label: "Annulations à traiter" }].map((item) =>
          <button key={item.key} type="button" onClick={() => setQueue(item.key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${queue === item.key ? "bg-slate-950 text-white" : "border border-slate-300 bg-white"}`}>{item.label}</button>)}
        <button type="button" onClick={load} aria-label="Actualiser" className="rounded-xl border border-slate-300 px-3"><RefreshCw size={17} /></button>
      </div>
    </header>
    {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> :
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} dossier{data.total === 1 ? "" : "s"}</div>
        {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Aucun dossier dans cette file.</p> :
          <div className="divide-y divide-slate-100">{data.items.map((item) =>
            <Link key={item.id} to={`/litiges/${item.case_type}/${item.id}`} className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[minmax(0,2fr)_1.4fr_1fr_auto] lg:items-center">
              <div className="min-w-0"><p className="font-semibold">{item.issue_code || item.cancellation_type}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.reason}</p><p className="mt-1 font-mono text-xs text-slate-400">{shortId(item.id)}</p></div>
              <div className="min-w-0 text-sm"><p className="truncate">Client : {item.client_label}</p><p className="truncate text-slate-500">Prestataire : {item.provider_label}</p></div>
              <div><StateBadge value={item.state} /><p className="mt-2 text-sm font-semibold">{formatCents(item.client_total_amount_cents, item.currency?.toUpperCase())}</p></div>
              <div className="text-right text-xs text-slate-500"><p>{formatDate(item.updated_at)}</p><p className="mt-1 font-semibold text-rose-700">Ouvrir</p></div>
            </Link>)}</div>}
      </section>}
  </div>;
}
