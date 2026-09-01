import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { getAdminPaymentDisputeCounts, listAdminPaymentDisputes } from "./adminOperationsApi";
import { adminLabel } from "./adminPresentation";
import { useAdminI18n } from "./AdminI18nContext";

const queues = [["open", "risk.open"], ["won", "risk.won"], ["lost_review", "risk.lost_review"], ["resolved", "risk.resolved"], ["all", "common.all"]];

export default function AdminPaymentDisputesPage() {
  const { t } = useAdminI18n();
  const [queue, setQueue] = useState("open");
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { const [result, nextCounts] = await Promise.all([listAdminPaymentDisputes(queue), getAdminPaymentDisputeCounts()]); setData(result); setCounts(nextCounts); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [queue]);
  useEffect(() => { load(); }, [load]);
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldAlert className="text-rose-600" /> {t("risk.title")}</h1><p className="mt-2 text-sm text-slate-600">Contestations bancaires Stripe, séparées des litiges de prestation Glossed. Les signaux Radar affichés sont ceux enregistrés par les webhooks signés.</p><div className="mt-5 flex flex-wrap gap-2">{queues.map(([value, label]) => <button key={value} type="button" onClick={() => setQueue(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold ${queue === value ? "bg-slate-950 text-white" : "border border-slate-300 bg-white"}`}>{t(label)} <span className="ml-1 opacity-70">({counts[value] ?? "—"})</span></button>)}<button type="button" onClick={load} aria-label={t("common.refresh")} className="rounded-xl border border-slate-300 px-3"><RefreshCw size={17} /></button></div></header>
    {loading ? <LoadingPanel /> : error ? <ErrorPanel error={error} retry={load} /> : <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">{data.total} contestation{data.total === 1 ? "" : "s"}</div>{data.items.length === 0 ? <p className="p-10 text-center text-sm text-slate-500">{t("risk.empty")}</p> : <div className="divide-y divide-slate-100">{data.items.map((item) => <Link key={item.id} to={`/risque/${item.id}`} className="grid gap-3 p-5 hover:bg-slate-50 lg:grid-cols-[1.4fr_1fr_1fr_auto] lg:items-center"><div><p className="font-semibold">{item.reason_code ? adminLabel(item.reason_code) : "Motif Stripe non précisé"}</p><p className="mt-1 font-mono text-xs text-slate-500">{shortId(item.stripe_dispute_id)}</p></div><div className="text-sm"><p>{item.client_email}</p><p className="text-slate-500">{item.provider_email}</p></div><div><StateBadge value={item.workflow_state} /><p className="mt-2 font-semibold">{formatCents(item.amount_debited_cents, item.currency?.toUpperCase())}</p></div><div className="text-right text-xs text-slate-500"><p>{formatDate(item.opened_at)}</p><p className="mt-1 font-semibold text-rose-700">{t("common.open")}</p></div></Link>)}</div>}</section>}
  </div>;
}
