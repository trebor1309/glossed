import { useCallback, useEffect, useState } from "react";
import { ClipboardList, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { listAdminMissions } from "./adminOperationsApi";

export default function AdminMissionsPage() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await listAdminMissions(submittedQuery)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [submittedQuery]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="text-rose-600" /> Missions</h1>
        <p className="mt-2 text-sm text-slate-600">Suivi opérationnel des propositions, contrats et machines d’état. Les informations financières sont en lecture seule.</p>
        <form onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); }} className="mt-5 flex max-w-2xl gap-2">
          <label className="relative min-w-0 flex-1"><span className="sr-only">Rechercher</span><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Mission, demande, service ou email" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-rose-500" /></label>
          <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Rechercher</button>
          <button type="button" onClick={load} aria-label="Actualiser" className="rounded-xl border border-slate-300 px-3"><RefreshCw size={17} /></button>
        </form>
      </header>
      {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} mission{data.total === 1 ? "" : "s"}</div>
          {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Aucune mission trouvée.</p> : <div className="divide-y divide-slate-100">{data.items.map((mission) => (
            <Link key={mission.id} to={`/missions/${mission.id}`} className="grid gap-3 p-5 hover:bg-slate-50 md:grid-cols-[minmax(0,2fr)_1.2fr_1fr_auto] md:items-center">
              <div className="min-w-0"><p className="truncate font-semibold">{mission.service || "Mission"}</p><p className="mt-1 font-mono text-xs text-slate-400">{shortId(mission.id)}{mission.booking_id ? ` · demande ${shortId(mission.booking_id)}` : ""}</p></div>
              <div className="min-w-0 text-sm"><p className="truncate">Client : {mission.client_label || "—"}</p><p className="truncate text-slate-500">Prestataire : {mission.provider_label || "—"}</p></div>
              <div className="flex flex-wrap gap-2"><StateBadge value={mission.status} />{mission.payment_state && <StateBadge value={mission.payment_state} />}</div>
              <div className="text-right text-xs text-slate-500"><p>{formatDate(mission.scheduled_at)}</p><p className="mt-1 font-semibold text-rose-700">Ouvrir</p></div>
            </Link>
          ))}</div>}
        </section>
      )}
    </div>
  );
}
