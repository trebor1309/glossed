import { useCallback, useEffect, useState } from "react";
import { FileWarning, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { getAdminDisputeQueueCounts, listAdminDisputeCases } from "./adminOperationsApi";
import { adminLabel } from "./adminPresentation";
import { useAdminI18n } from "./AdminI18nContext";

const queues = [
  ["disputes_open", "disputes.service_open"],
  ["cancellations_open", "disputes.cancellation_open"],
  ["disputes_history", "disputes.service_history"],
  ["cancellations_history", "disputes.cancellation_history"],
];

function nextAction(item) {
  if (item.case_type === "dispute") return item.state === "resolved" ? "Dossier clôturé" : "Examiner les éléments et préparer une décision";
  if (["resolved", "rejected"].includes(item.state)) return "Dossier clôturé";
  if (item.state === "routed_to_dispute") return "Ouvrir ou poursuivre le litige de prestation";
  if (item.state === "financial_resolution_pending") return "Exécuter la résolution financière autorisée";
  return "Obtenir la réponse de la partie attendue";
}

export default function AdminDisputesPage() {
  const { t } = useAdminI18n();
  const [queue, setQueue] = useState("disputes_open");
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [result, nextCounts] = await Promise.all([listAdminDisputeCases(queue), getAdminDisputeQueueCounts()]);
      setData(result); setCounts(nextCounts);
    } catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="flex items-center gap-2 text-2xl font-bold"><FileWarning className="text-rose-600" /> {t("disputes.title")}</h1>
      <p className="mt-2 text-sm text-slate-600">Les litiges de prestation Glossed restent strictement séparés des contestations bancaires Stripe.</p>
      <p className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800">Ces files contiennent uniquement les dossiers marketplace v2 ; les missions legacy v1 restent consultables dans Missions.</p>
      <div className="mt-5 flex flex-wrap gap-2">{queues.map(([key, label]) => <button key={key} type="button" onClick={() => setQueue(key)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${queue === key ? "bg-slate-950 text-white" : "border border-slate-300 bg-white"}`}>{t(label)} <span className="ml-1 opacity-70">({counts[key] ?? "—"})</span></button>)}<button type="button" onClick={load} aria-label={t("common.refresh")} className="rounded-xl border border-slate-300 px-3"><RefreshCw size={17} /></button></div>
    </header>
    {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} dossier{data.total === 1 ? "" : "s"}</div>
      {data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{t("disputes.empty")}</p> : <div className="divide-y divide-slate-100">{data.items.map((item) => <Link key={item.id} to={`/litiges/${item.case_type}/${item.id}`} className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[minmax(0,2fr)_1.2fr_1.1fr_auto] lg:items-center">
        <div className="min-w-0"><p className="font-semibold">{adminLabel(item.issue_code || item.cancellation_type)}</p><p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.reason}</p><p className="mt-1 font-mono text-xs text-slate-400">{shortId(item.id)}</p></div>
        <div className="min-w-0 text-sm"><p className="truncate">Client : {item.client_label}</p><p className="truncate text-slate-500">Prestataire : {item.provider_label}</p><p className="mt-2 text-xs text-slate-500">Demandeur : {adminLabel(item.requested_by)} · {formatDate(item.requested_at)}</p></div>
        <div><StateBadge value={item.state} /><p className="mt-2 text-sm font-semibold">{formatCents(item.client_total_amount_cents, item.currency?.toUpperCase())}</p><p className="mt-2 text-xs text-rose-700">{nextAction(item)}</p></div>
        <div className="text-right text-xs text-slate-500"><p>Mis à jour {formatDate(item.updated_at)}</p><p className="mt-1 font-semibold text-rose-700">{t("common.open")}</p></div>
      </Link>)}</div>}
    </section>}
  </div>;
}
