import { useEffect, useState } from "react";
import { Banknote, Search } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { searchAdminFinance } from "./adminOperationsApi";

export default function AdminFinancePage() {
  const [parameters, setParameters] = useSearchParams();
  const [query, setQuery] = useState(parameters.get("recherche") || "");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const search = async (event) => {
    event?.preventDefault();
    if (query.trim().length < 2) return;
    setLoading(true); setError(null); setParameters({ recherche: query.trim() });
    try { setData(await searchAdminFinance(query.trim())); }
    catch (searchError) { setError(searchError.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (parameters.get("recherche")?.length >= 2) search();
    // The URL seeds the first search only; subsequent searches are explicit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><Banknote className="text-rose-600" /> Finance v2</h1>
      <p className="mt-2 text-sm text-slate-600">Recherchez une mission, une personne ou un identifiant Stripe. Les actions restent limitées aux workflows v2 déjà autorisés.</p>
      <form onSubmit={search} className="mt-5 flex max-w-3xl gap-2">
        <input aria-label="Recherche financière" value={query} onChange={(event) => setQuery(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3" placeholder="Mission, email, cs_, pi_, ch_, tr_, re_ ou po_" />
        <button type="submit" disabled={loading || query.trim().length < 2} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white disabled:opacity-50"><Search size={18} /> Rechercher</button>
      </form>
    </header>
    {error && <ErrorPanel error={error} retry={search} />}
    {data && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} résultat{data.total === 1 ? "" : "s"}</div>
      {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">Aucune opération trouvée.</p> : <div className="divide-y divide-slate-100">{data.items.map((item) =>
        <Link key={`${item.entity_type}-${item.entity_id}`} to={item.route} className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[1fr_1.5fr_1fr_auto] lg:items-center">
          <div><StateBadge value={item.entity_type} /><p className="mt-2 font-mono text-xs text-slate-500">{shortId(item.entity_id)}</p></div>
          <div className="min-w-0"><p className="truncate font-semibold">{item.subtitle}</p><p className="mt-1 truncate font-mono text-xs text-slate-500">{item.primary_stripe_id || "Identifiant local"}</p></div>
          <div><p className="font-semibold">{formatCents(item.amount_cents, item.currency?.toUpperCase())}</p><p className="mt-1 text-xs text-slate-500">{formatDate(item.occurred_at)}</p></div>
          <span className="text-sm font-semibold text-rose-700">Ouvrir</span>
        </Link>)}</div>}
    </section>}
  </div>;
}
