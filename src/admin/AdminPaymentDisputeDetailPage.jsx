import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Radar, ShieldAlert } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate } from "./AdminDataUi";
import AdminFinancialAction from "./AdminFinancialAction";
import { getAdminPaymentDispute } from "./adminOperationsApi";

export default function AdminPaymentDisputeDetailPage() {
  const { disputeId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getAdminPaymentDispute(disputeId)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [disputeId]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <LoadingPanel />;
  if (error && !data) return <ErrorPanel error={error} retry={load} />;
  const { dispute, reversal, workflow } = data;
  const currency = dispute.currency.toUpperCase();
  return <div className="space-y-6">
    <Link to="/risque" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"><ArrowLeft size={16} /> Retour aux chargebacks</Link>
    <header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Payment dispute Stripe</p><h1 className="mt-2 break-all font-mono text-xl font-bold">{dispute.stripe_dispute_id}</h1><div className="mt-4 flex flex-wrap items-center gap-4"><StateBadge value={workflow.current_state} /><b>{formatCents(dispute.amount_debited_cents, currency)}</b></div></header>
    {error && <ErrorPanel error={error} retry={load} />}
    <div className="grid gap-6 xl:grid-cols-2">
      <AdminPanel title="Contestation bancaire"><DefinitionList items={[
        { label: "Motif Stripe", value: dispute.reason_code }, { label: "Décision Stripe", value: dispute.stripe_status },
        { label: "Charge", value: dispute.stripe_charge_id, mono: true }, { label: "Ouverture", value: formatDate(dispute.opened_at) },
        { label: "Montant débité à Glossed", value: formatCents(dispute.amount_debited_cents, currency) }, { label: "Frais Stripe supportés par Glossed", value: formatCents(dispute.stripe_dispute_fee_amount_cents, currency) },
      ]} /><Link to={`/finance/paiements/${dispute.payment_id}`} className="mt-5 inline-block text-sm font-semibold text-rose-700">Voir l’allocation et le grand livre</Link></AdminPanel>
      <AdminPanel title="Parties et mission"><DefinitionList items={[
        { label: "Client", value: data.parties?.client?.email }, { label: "Prestataire", value: data.parties?.provider?.email },
        { label: "Mission", value: data.mission?.id, mono: true }, { label: "Paiement", value: dispute.payment_id, mono: true },
      ]} /></AdminPanel>
    </div>
    <AdminPanel title="Récupération provisoire, responsabilité et déficit" description="La récupération provisoire ne constitue jamais une attribution automatique de responsabilité au prestataire.">
      <DefinitionList items={[
        { label: "Cible provisoire", value: formatCents(dispute.provisional_recovery_target_amount_cents, currency) },
        { label: "Récupéré provisoirement", value: formatCents(dispute.provisional_recovered_amount_cents, currency) },
        { label: "Responsabilité prestataire définitive", value: formatCents(dispute.definitive_provider_liability_amount_cents, currency) },
        { label: "Perte finale Glossed", value: formatCents(dispute.platform_final_loss_amount_cents, currency) },
        { label: "Retransféré au prestataire", value: formatCents(dispute.provider_retransferred_amount_cents, currency) },
        { label: "Déficit de récupération", value: formatCents(dispute.recovery_deficit_amount_cents, currency) },
      ]} />
      {reversal && <div className="mt-5 rounded-xl border border-slate-200 p-4"><DefinitionList items={[{ label: "Inversion Stripe", value: reversal.stripe_reversal_id, mono: true }, { label: "État", value: <StateBadge value={reversal.workflow_state} /> }, { label: "Retransfert", value: reversal.stripe_retransfer_id, mono: true }, { label: "Dernière erreur", value: reversal.last_error_message }]} />{["requested_provisional", "submitted"].includes(reversal.workflow_state) && <div className="mt-4"><AdminFinancialAction operationType="transfer_reversal" operationId={reversal.id} requiresRisk onComplete={load} /></div>}{dispute.stripe_status === "won" && ["fully_recovered", "partially_recovered"].includes(reversal.workflow_state) && !reversal.retransferred_at && <div className="mt-4"><AdminFinancialAction operationType="provider_retransfer" operationId={reversal.id} requiresRisk onComplete={load} /></div>}</div>}
      {data.deficit && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Déficit en revue administrative : {formatCents(data.deficit.amount_cents, currency)}. Aucune compensation automatique sur les gains futurs.</p>}
    </AdminPanel>
    <AdminPanel title="Radar et signaux de risque" description="Consultation des données enregistrées, sans nouvelle règle antifraude Glossed.">
      <div className="flex items-center gap-2 font-semibold"><Radar size={18} /> Signaux Stripe conservés</div>
      <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{JSON.stringify(data.risk_signals || {}, null, 2)}</pre>
    </AdminPanel>
    <AdminPanel title="Chronologie signée et auditée"><div className="space-y-3">{data.timeline.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><b>{item.from_state || "création"} → {item.to_state}</b><span>{formatDate(item.created_at)}</span></div><p className="mt-1 text-slate-600">{item.reason}</p></div>)}{data.timeline.length === 0 && <p className="text-sm text-slate-500"><ShieldAlert size={18} className="mb-2" />Aucune transition enregistrée.</p>}</div></AdminPanel>
  </div>;
}
