import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Scale } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate } from "./AdminDataUi";
import AdminFinancialAction from "./AdminFinancialAction";
import { getAdminFinancialPayment } from "./adminOperationsApi";

function OperationStatus({ operation }) {
  const state = operation.workflow_state || (operation.succeeded_at ? "succeeded" : operation.last_error_code ? "manual_review" : "pending");
  return <StateBadge value={state} />;
}

export default function AdminFinancialPaymentDetailPage() {
  const { paymentId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getAdminFinancialPayment(paymentId)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [paymentId]);
  useEffect(() => { load(); }, [load]);
  const latest = useMemo(() => data?.allocation_snapshots?.at(-1), [data]);
  if (loading) return <LoadingPanel />;
  if (error && !data) return <ErrorPanel error={error} retry={load} />;
  const { payment, terms_snapshot: terms } = data;
  const currency = payment.currency.toUpperCase();
  return <div className="space-y-6">
    <Link to="/finance" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"><ArrowLeft size={16} /> Retour à la recherche</Link>
    <header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Paiement marketplace_v2</p><h1 className="mt-2 break-all font-mono text-xl font-bold">{payment.stripe_payment_intent_id}</h1><p className="mt-3 text-3xl font-bold">{formatCents(payment.amount_total_cents, currency)}</p></header>
    {error && <ErrorPanel error={error} retry={load} />}
    <div className="grid gap-6 xl:grid-cols-2">
      <AdminPanel title="Parties et références"><DefinitionList items={[
        { label: "Client", value: data.client?.email }, { label: "Prestataire", value: data.provider?.email },
        { label: "Mission", value: payment.proposal_id, mono: true }, { label: "Demande", value: payment.request_id, mono: true },
        { label: "Checkout Session", value: payment.stripe_session_id, mono: true }, { label: "Charge", value: payment.stripe_charge_id, mono: true },
        { label: "Paiement confirmé", value: formatDate(payment.paid_at) }, { label: "État paiement", value: <StateBadge value={data.payment_workflow?.current_state} /> },
      ]} /></AdminPanel>
      <AdminPanel title="Instantané contractuel"><DefinitionList items={[
        { label: "Prestation", value: formatCents(terms.service_amount_cents, currency) }, { label: "Déplacement", value: formatCents(terms.travel_amount_cents, currency) },
        { label: "Brut prestataire initial", value: formatCents(terms.provider_initial_gross_amount_cents, currency) }, { label: "Commission initiale", value: formatCents(terms.platform_fee_initial_amount_cents, currency) },
        { label: "Taxe client initiale", value: formatCents(terms.client_tax_initial_amount_cents, currency) }, { label: "Total client", value: formatCents(terms.client_total_amount_cents, currency) },
      ]} /></AdminPanel>
    </div>
    <AdminPanel title="Allocation de chaque centime" description="La retenue statutaire est incluse dans le brut attribué et n’est jamais déduite une seconde fois du remboursement.">
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase text-slate-500"><th className="p-3">Révision</th><th className="p-3">Brut attribué</th><th className="p-3">Retenue incluse</th><th className="p-3">Transfert</th><th className="p-3">Commission</th><th className="p-3">Taxe</th><th className="p-3">Remboursement</th></tr></thead><tbody>{data.allocation_snapshots.map((allocation) => <tr key={allocation.id} className={allocation.id === latest?.id ? "bg-rose-50" : "border-b border-slate-100"}><td className="p-3">#{allocation.revision}</td><td className="p-3">{formatCents(allocation.provider_awarded_gross_amount_cents, currency)}</td><td className="p-3">{formatCents(allocation.provider_statutory_withholding_amount_cents, currency)}</td><td className="p-3">{formatCents(allocation.provider_transfer_amount_cents, currency)}</td><td className="p-3">{formatCents(allocation.platform_fee_final_amount_cents, currency)}</td><td className="p-3">{formatCents(allocation.client_tax_allocated_amount_cents, currency)}</td><td className="p-3 font-semibold">{formatCents(allocation.client_refund_amount_cents, currency)}</td></tr>)}</tbody></table></div>
    </AdminPanel>
    <AdminPanel title="Grand livre associé" description="Chaque lot doit être posté et présenter des débits strictement égaux aux crédits.">
      <div className="space-y-4">{data.ledger_batches.map((batch) => <article key={batch.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><b>{batch.operation_type}</b><p className="font-mono text-xs text-slate-500">{batch.operation_key}</p></div><div className="text-right"><StateBadge value={batch.status} /><p className={`mt-1 text-xs font-semibold ${batch.debit_total_cents === batch.credit_total_cents ? "text-emerald-700" : "text-red-700"}`}>{formatCents(batch.debit_total_cents, currency)} = {formatCents(batch.credit_total_cents, currency)}</p></div></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><tbody>{batch.entries.map((entry) => <tr key={entry.line_number} className="border-t border-slate-100"><td className="py-2 font-mono">{entry.account_code}</td><td className="py-2">{entry.memo}</td><td className="py-2 text-right uppercase">{entry.direction}</td><td className="py-2 text-right font-semibold">{formatCents(entry.amount_cents, currency)}</td></tr>)}</tbody></table></div></article>)}</div>
    </AdminPanel>
    <AdminPanel title="Remboursements"><div className="space-y-4">{data.refunds.length === 0 ? <p className="text-sm text-slate-500">Aucun remboursement autorisé.</p> : data.refunds.map((refund) => <article key={refund.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-3"><div><b>{formatCents(refund.amount_cents, currency)}</b><p className="mt-1 font-mono text-xs text-slate-500">{refund.stripe_refund_id || refund.idempotency_key}</p></div><OperationStatus operation={refund} /></div>{["authorized", "recovery_attempted", "submitted", "failed_retryable"].includes(refund.workflow_state) && <div className="mt-4"><AdminFinancialAction operationType="refund" operationId={refund.id} onComplete={load} /></div>}</article>)}</div></AdminPanel>
    <AdminPanel title="Transferts, inversions, retransferts et déficits">
      {data.transfer && <DefinitionList items={[{ label: "Transfert", value: data.transfer.stripe_transfer_id, mono: true }, { label: "Montant", value: formatCents(data.transfer.amount_cents, currency) }, { label: "État", value: <OperationStatus operation={data.transfer} /> }]} />}
      <div className="mt-5 space-y-4">{data.reversals.map((reversal) => <article key={reversal.id} className="rounded-xl border border-slate-200 p-4"><DefinitionList items={[{ label: "Type", value: reversal.recovery_type }, { label: "État", value: <OperationStatus operation={reversal} /> }, { label: "Demandé", value: formatCents(reversal.requested_amount_cents, currency) }, { label: "Récupéré", value: formatCents(reversal.recovered_amount_cents, currency) }, { label: "Déficit", value: formatCents(reversal.recovery_deficit_amount_cents, currency) }, { label: "Retransfert", value: reversal.stripe_retransfer_id, mono: true }]} />{["requested_provisional", "requested_final", "submitted"].includes(reversal.workflow_state) && <div className="mt-4"><AdminFinancialAction operationType="transfer_reversal" operationId={reversal.id} requiresRisk={Boolean(reversal.payment_dispute_id)} onComplete={load} /></div>}{reversal.payment_dispute_id && ["fully_recovered", "partially_recovered"].includes(reversal.workflow_state) && !reversal.retransferred_at && <div className="mt-4"><AdminFinancialAction operationType="provider_retransfer" operationId={reversal.id} requiresRisk onComplete={load} /></div>}</article>)}</div>
      {data.deficits.length > 0 && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="flex items-center gap-2 font-bold text-amber-900"><Scale size={18} /> Déficits en revue</p>{data.deficits.map((deficit) => <p key={deficit.id} className="mt-2 text-sm">{formatCents(deficit.amount_cents, currency)} · {deficit.reason}</p>)}</div>}
    </AdminPanel>
  </div>;
}
