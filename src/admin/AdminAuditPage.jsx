import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, Search } from "lucide-react";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { searchAdminAudit } from "./adminOperationsApi";

export default function AdminAuditPage() {
  const [query, setQuery] = useState(""); const [source, setSource] = useState("all");
  const [data, setData] = useState(null); const [loading, setLoading] = useState(true); const [error, setError] = useState(null);
  const search = useCallback(async (nextQuery = "", nextSource = "all") => { setLoading(true); setError(null); try { setData(await searchAdminAudit(nextQuery, nextSource)); } catch (e) { setError(e.message); } finally { setLoading(false); } }, []);
  useEffect(() => { search(); }, [search]);
  const submit = (event) => { event.preventDefault(); search(query, source); };
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpenCheck className="text-rose-600" />Audit global</h1><p className="mt-2 text-sm text-slate-600">Actions administratives, financières et authentifications, issues des journaux immuables.</p><form onSubmit={submit} className="mt-5 grid gap-2 sm:grid-cols-[1fr_12rem_auto]"><input value={query} onChange={(event) => setQuery(event.target.value)} className="rounded-xl border px-4 py-3" placeholder="Action, acteur, entité, identifiant…" /><select value={source} onChange={(event) => setSource(event.target.value)} className="rounded-xl border px-3"><option value="all">Toutes les sources</option><option value="admin">Administration</option><option value="financial">Finance</option><option value="authentication">Authentification</option></select><button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"><Search size={18} />Rechercher</button></form></header>
    {loading && <LoadingPanel />}{error && <ErrorPanel error={error} retry={() => search(query, source)} />}
    {data && !loading && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4 text-sm text-slate-500">{data.total} événement{data.total === 1 ? "" : "s"}</div><div className="divide-y">{data.items.map((item) => <article key={`${item.source}-${item.record_id}`} className="grid gap-3 p-5 lg:grid-cols-[8rem_1fr_1fr_11rem]"><div><StateBadge value={item.source} /><p className="mt-2 text-xs text-slate-500">{item.outcome}</p></div><div><p className="font-semibold">{item.event_type}</p><p className="mt-1 text-sm text-slate-500">{item.action}</p>{item.reason && <p className="mt-2 text-sm">{item.reason}</p>}</div><div><p className="text-sm">{item.entity_type}</p><p className="font-mono text-xs text-slate-500">{shortId(item.entity_id)}</p><p className="mt-2 text-xs">{item.actor_email || shortId(item.actor_id)}</p></div><time className="text-sm text-slate-500">{formatDate(item.occurred_at)}</time></article>)}</div></section>}
  </div>;
}
