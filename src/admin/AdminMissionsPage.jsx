import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { listAdminMissions } from "./adminOperationsApi";
import { adminLabel } from "./adminPresentation";
import { useAdminI18n } from "./AdminI18nContext";

const PAGE_SIZE = 25;
const initialFilters = { query: "", status: "all", flowVersion: "all", partyQuery: "", dateFrom: "", dateTo: "", attentionOnly: false };

function isoBoundary(value, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).toISOString();
}

function nextCancellationAction(state) {
  if (["routed_to_dispute", "financial_resolution_pending"].includes(state)) return "Instruction administrative requise";
  if (["client_full_refund_requested", "provider_partial_allocation_proposed", "mutual_allocation_proposed"].includes(state)) return "Réponse d’une partie attendue";
  return null;
}

export default function AdminMissionsPage() {
  const { t } = useAdminI18n();
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const request = useMemo(() => ({ ...applied, dateFrom: isoBoundary(applied.dateFrom), dateTo: isoBoundary(applied.dateTo, true), limit: PAGE_SIZE, offset }), [applied, offset]);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await listAdminMissions(request)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [request]);
  useEffect(() => { load(); }, [load]);
  const submit = (event) => {
    event.preventDefault(); setOffset(0);
    setApplied({ ...filters, query: filters.query.trim(), partyQuery: filters.partyQuery.trim() });
  };
  const total = data?.total || 0;

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardList className="text-rose-600" /> {t("missions.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">{t("missions.description")}</p>
      <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{t("missions.legacy_notice")}</p>
      <form onSubmit={submit} className="mt-5 grid gap-3 lg:grid-cols-4">
        <label className="relative min-w-0 lg:col-span-2"><span className="sr-only">Rechercher</span><Search className="absolute left-3 top-3 text-slate-400" size={17} /><input value={filters.query} onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))} maxLength={200} placeholder="Mission, demande, service ou email" className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-rose-500" /></label>
        <input aria-label={t("missions.filters.party")} value={filters.partyQuery} onChange={(event) => setFilters((current) => ({ ...current, partyQuery: event.target.value }))} placeholder={t("missions.filters.party")} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
        <select aria-label={t("missions.filters.status")} value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"><option value="all">Tous les états</option><option value="attention">Attention requise</option><option value="payment_pending">Paiement en attente</option><option value="paid">Payée</option><option value="pending">En attente</option><option value="proposed">Proposée</option><option value="confirmed">Confirmée</option><option value="cancel_requested">Annulation demandée</option><option value="completed">Terminée</option><option value="cancelled">Annulée</option></select>
        <select aria-label={t("missions.filters.flow")} value={filters.flowVersion} onChange={(event) => setFilters((current) => ({ ...current, flowVersion: event.target.value }))} className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"><option value="all">{t("missions.flow.all")}</option><option value="legacy_v1">{t("missions.flow.legacy_v1")}</option><option value="marketplace_v2">{t("missions.flow.marketplace_v2")}</option></select>
        <label className="text-xs font-semibold text-slate-600">{t("missions.filters.from")}<input type="date" value={filters.dateFrom} onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
        <label className="text-xs font-semibold text-slate-600">{t("missions.filters.to")}<input type="date" value={filters.dateTo} onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" /></label>
        <label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2.5 text-sm"><input type="checkbox" checked={filters.attentionOnly} onChange={(event) => setFilters((current) => ({ ...current, attentionOnly: event.target.checked }))} />{t("missions.filters.attention")}</label>
        <div className="flex gap-2 lg:col-span-4"><button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">{t("common.search")}</button><button type="button" onClick={load} aria-label={t("common.refresh")} className="rounded-xl border border-slate-300 px-3"><RefreshCw size={17} /></button></div>
      </form>
    </header>
    {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 text-sm text-slate-500"><span>{total} mission{total === 1 ? "" : "s"}</span>{total > 0 && <span>{offset + 1}–{Math.min(offset + PAGE_SIZE, total)} sur {total}</span>}</div>
      {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{t("missions.empty")}</p> : <div className="divide-y divide-slate-100">{data.items.map((mission) => <Link key={mission.id} to={`/missions/${mission.id}`} className="block p-5 hover:bg-slate-50">
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_1.2fr_1.2fr_auto] md:items-center">
          <div className="min-w-0"><p className="truncate font-semibold">{mission.service || "Mission"}</p><p className="mt-1 font-mono text-xs text-slate-400">{shortId(mission.id)}{mission.booking_id ? ` · demande ${shortId(mission.booking_id)}` : ""}</p></div>
          <div className="min-w-0 text-sm"><p className="truncate">Client : {mission.client_label || "—"}</p><p className="truncate text-slate-500">Prestataire : {mission.provider_label || "—"}</p></div>
          <div className="flex flex-wrap gap-2"><StateBadge value={mission.operational_state} /><StateBadge value={mission.financial_flow_version} label={mission.financial_flow_version === "legacy_v1" ? "Legacy v1" : "Marketplace v2"} />{mission.payment_id && !mission.livemode && <StateBadge value="test" label={t("missions.test_data")} />}{mission.attention_required && <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700"><AlertTriangle size={13} />{t("missions.attention")}</span>}</div>
          <div className="text-right text-xs text-slate-500"><p className="font-semibold text-slate-600">{t("missions.scheduled_date")}</p><p>{formatDate(mission.scheduled_at)}</p><p className="mt-1 font-semibold text-rose-700">{t("common.open")}</p></div>
        </div>
        {mission.attention_reasons?.length > 0 && <p className="mt-3 text-xs text-red-700">{mission.attention_reasons.map((reason) => adminLabel(reason)).join(" · ")}</p>}
        {mission.cancellation_id && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><p><strong>Annulation demandée par :</strong> {adminLabel(mission.cancellation_requested_by)} · {formatDate(mission.cancellation_requested_at)}</p>{mission.cancellation_reason && <p className="mt-1"><strong>Raison :</strong> {mission.cancellation_reason}</p>}{nextCancellationAction(mission.cancellation_state) && <p className="mt-1"><strong>Prochaine action :</strong> {nextCancellationAction(mission.cancellation_state)}</p>}</div>}
      </Link>)}</div>}
      {total > PAGE_SIZE && <div className="flex justify-end gap-2 border-t p-4"><button type="button" disabled={offset === 0} onClick={() => setOffset((current) => Math.max(0, current - PAGE_SIZE))} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Page précédente"><ChevronLeft size={18} /></button><button type="button" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset((current) => current + PAGE_SIZE)} className="rounded-lg border p-2 disabled:opacity-40" aria-label="Page suivante"><ChevronRight size={18} /></button></div>}
    </section>}
  </div>;
}
