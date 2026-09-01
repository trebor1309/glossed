import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, Search, X } from "lucide-react";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { searchAdminAudit } from "./adminOperationsApi";
import { adminLabel } from "./adminPresentation";
import { useAdminI18n } from "./AdminI18nContext";

function isoBoundary(value, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

export default function AdminAuditPage() {
  const { t } = useAdminI18n();
  const [filters, setFilters] = useState({ query: "", source: "all", outcome: "all", actorQuery: "", dateFrom: "", dateTo: "" });
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const search = useCallback(async (nextFilters) => {
    const active = nextFilters || filters;
    setLoading(true); setError(null);
    try { setData(await searchAdminAudit({ ...active, dateFrom: isoBoundary(active.dateFrom), dateTo: isoBoundary(active.dateTo, true) })); }
    catch (searchError) { setError(searchError.message); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => {
    search({ query: "", source: "all", outcome: "all", actorQuery: "", dateFrom: "", dateTo: "" });
    // Initial immutable audit feed only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = (event) => { event.preventDefault(); search(); };

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><BookOpenCheck className="text-rose-600" /> {t("audit.title")}</h1><p className="mt-2 text-sm text-slate-600">Actions administratives, financières et authentifications issues des journaux immuables.</p><form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-4"><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} className="rounded-xl border px-4 py-3 lg:col-span-2" placeholder="Action, entité ou identifiant" /><input value={filters.actorQuery} onChange={(event) => setFilters((current) => ({ ...current, actorQuery: event.target.value }))} className="rounded-xl border px-4 py-3" placeholder={t("audit.actor")} /><select value={filters.source} onChange={(event) => setFilters((current) => ({ ...current, source: event.target.value }))} className="rounded-xl border px-3"><option value="all">Toutes les sources</option><option value="admin">Administration</option><option value="financial">Finance</option><option value="authentication">Authentification</option></select><select value={filters.outcome} onChange={(event) => setFilters((current) => ({ ...current, outcome: event.target.value }))} className="rounded-xl border px-3"><option value="all">{t("audit.outcome.all")}</option><option value="success">{t("audit.outcome.success")}</option><option value="failed">{t("audit.outcome.failed")}</option></select><label className="text-xs font-semibold text-slate-600">{t("audit.period_from")}<input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label><label className="text-xs font-semibold text-slate-600">{t("audit.period_to")}<input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className="mt-1 block w-full rounded-xl border px-3 py-2 text-sm font-normal" /></label><button type="submit" disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 font-semibold text-white"><Search size={18} />{t("common.search")}</button></form></header>
    {loading && <LoadingPanel />}{error && <ErrorPanel error={error} retry={() => search()} />}
    {data && !loading && <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-5 py-4 text-sm text-slate-500">{data.total} événement{data.total === 1 ? "" : "s"}</div>{data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{t("audit.empty")}</p> : <div className="divide-y">{data.items.map((item) => <button type="button" onClick={() => setSelected(item)} key={`${item.source}-${item.record_id}`} className="grid w-full gap-3 p-5 text-left hover:bg-slate-50 lg:grid-cols-[8rem_1fr_1fr_11rem]"><div><StateBadge value={item.source} /><p className="mt-2 text-xs text-slate-500">{adminLabel(item.outcome)}</p></div><div><p className="font-semibold">{adminLabel(item.action || item.event_type)}</p><p className="mt-1 font-mono text-xs text-slate-500">{item.event_type} · {item.action}</p>{item.reason && <p className="mt-2 text-sm">{item.reason}</p>}</div><div><p className="text-sm">{adminLabel(item.entity_type)}</p><p className="font-mono text-xs text-slate-500">{shortId(item.entity_id)}</p><p className="mt-2 text-xs">{item.actor_email || shortId(item.actor_id)}</p></div><time className="text-sm text-slate-500">{formatDate(item.occurred_at)}</time></button>)}</div>}</section>}
    {selected && <div role="dialog" aria-modal="true" aria-label={t("audit.details")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"><div className="flex items-start justify-between gap-4"><div><h2 className="text-xl font-bold">{t("audit.details")}</h2><p className="mt-1 text-sm text-slate-500">Lecture seule · journal immuable</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Fermer"><X /></button></div><dl className="mt-6 grid gap-4 sm:grid-cols-2"><div><dt className="text-xs font-semibold uppercase text-slate-500">Action</dt><dd className="mt-1">{adminLabel(selected.action || selected.event_type)}</dd><dd className="font-mono text-xs text-slate-500">{selected.event_type} · {selected.action}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Résultat</dt><dd className="mt-1"><StateBadge value={selected.outcome} /></dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Acteur</dt><dd className="mt-1">{selected.actor_email || selected.actor_id || "Système"}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Date</dt><dd className="mt-1">{formatDate(selected.occurred_at)}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Entité</dt><dd className="mt-1">{adminLabel(selected.entity_type)}</dd><dd className="font-mono text-xs">{selected.entity_id || "—"}</dd></div><div><dt className="text-xs font-semibold uppercase text-slate-500">Opération liée</dt><dd className="mt-1 font-mono text-xs">{selected.deduplication_key || "—"}</dd></div></dl>{selected.reason && <div className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><strong>Justification :</strong> {selected.reason}</div>}<details className="mt-5 rounded-xl border p-4"><summary className="cursor-pointer font-semibold">{t("common.technical_details")}</summary><pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify({ source: selected.source, record_id: selected.record_id, payload: selected.payload }, null, 2)}</pre></details></section></div>}
  </div>;
}
