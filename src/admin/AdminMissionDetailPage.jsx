import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Banknote, GitBranch, LockKeyhole } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate, shortId } from "./AdminDataUi";
import { getAdminMission } from "./adminOperationsApi";

function personName(person) {
  if (!person) return "Non attribué";
  return [person.first_name, person.last_name].filter(Boolean).join(" ") || person.business_name || person.email;
}

function FinancialRecord({ title, record, fields }) {
  if (!record) return <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm text-slate-500">Aucune écriture.</p></div>;
  return <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">{title}</h3><div className="mt-3"><DefinitionList items={fields(record)} /></div></div>;
}

export default function AdminMissionDetailPage() {
  const { missionId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await getAdminMission(missionId)); }
    catch (loadError) { setError(loadError.message); }
    finally { setLoading(false); }
  }, [missionId]);
  useEffect(() => { load(); }, [load]);
  if (loading) return <LoadingPanel />;
  if (error) return <ErrorPanel error={error} retry={load} />;
  const { mission, request, client, provider, contract_snapshot: contract, financial } = data;
  const currency = financial?.terms_snapshot?.currency || financial?.payment?.currency || "EUR";

  return (
    <div className="space-y-6">
      <Link to="/missions" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"><ArrowLeft size={16} /> Retour aux missions</Link>
      <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">Mission · lecture administrative</p><h1 className="mt-2 text-2xl font-bold">{mission.service || "Mission"}</h1><p className="mt-1 font-mono text-sm text-slate-300">{mission.id}</p><div className="mt-4 flex flex-wrap gap-2"><StateBadge value={mission.status} /><StateBadge value={mission.financial_flow_version} /></div>
      </header>
      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Mission et demande"><DefinitionList items={[
          { label: "Mission", value: mission.id, mono: true }, { label: "Demande", value: request?.id, mono: true },
          { label: "Service", value: mission.service }, { label: "Statut demande", value: request?.status },
          { label: "Début planifié", value: formatDate(mission.scheduled_at) }, { label: "Durée estimée", value: mission.duration_minutes ? `${mission.duration_minutes} min` : null },
          { label: "Création", value: formatDate(mission.created_at) }, { label: "Adresse", value: request?.address },
        ]} />{mission.description && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">{mission.description}</p>}</AdminPanel>
        <AdminPanel title="Parties"><div className="space-y-5"><div><p className="text-xs font-semibold uppercase text-slate-500">Client</p><p className="mt-1 font-semibold">{personName(client)}</p>{client && <Link to={`/utilisateurs/${client.id}`} className="text-sm text-rose-700">{client.email}</Link>}</div><div><p className="text-xs font-semibold uppercase text-slate-500">Prestataire</p><p className="mt-1 font-semibold">{personName(provider)}</p>{provider && <Link to={`/utilisateurs/${provider.id}`} className="text-sm text-rose-700">{provider.email}</Link>}</div></div></AdminPanel>
      </div>
      <AdminPanel title="Propositions" description="Toutes les propositions de la demande restent consultables.">
        <div className="divide-y divide-slate-100">{data.proposals.map((proposal) => <div key={proposal.id} className="grid gap-3 py-4 md:grid-cols-[minmax(0,2fr)_1fr_1fr]"><div><p className="font-semibold">{proposal.provider_label || "Prestataire"}{proposal.selected && <span className="ml-2 text-xs text-rose-700">référence consultée</span>}</p><p className="font-mono text-xs text-slate-400">{shortId(proposal.id)}</p></div><StateBadge value={proposal.status} /><p className="text-sm text-slate-500">{formatDate(proposal.scheduled_at)}</p></div>)}</div>
      </AdminPanel>
      <AdminPanel title="Instantané contractuel" description="Version et échéances figées au moment de l’engagement.">
        {contract ? <DefinitionList items={[
          { label: "Version proposition", value: contract.proposal_version }, { label: "Devise", value: contract.currency },
          { label: "Début", value: formatDate(contract.scheduled_start_at) }, { label: "Fin", value: formatDate(contract.scheduled_end_at) },
          { label: "Fin déclarable à partir de", value: formatDate(contract.completion_not_before_at) }, { label: "Juridiction", value: contract.jurisdiction_code },
          { label: "Version contrat", value: contract.contract_version }, { label: "Politique d’éligibilité", value: contract.eligibility_policy_version },
        ]} /> : <p className="text-sm text-slate-500">Aucun instantané financier v2 pour cette mission.</p>}
      </AdminPanel>
      <AdminPanel title="Machines d’état" description="État courant de chaque workflow indépendant.">
        {data.workflow_instances.length === 0 ? <p className="text-sm text-slate-500">Aucune machine v2 associée.</p> : <div className="grid gap-3 md:grid-cols-2">{data.workflow_instances.map((workflow) => <div key={workflow.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-center justify-between gap-3"><p className="font-semibold">{workflow.machine_code}</p><StateBadge value={workflow.current_state} /></div><p className="mt-2 text-xs text-slate-500">Révision {workflow.revision} · {formatDate(workflow.updated_at)}</p></div>)}</div>}
      </AdminPanel>
      <AdminPanel title="Historique audité" description="Transitions des machines d’état liées à la mission.">
        {data.history.length === 0 ? <p className="text-sm text-slate-500">Aucune transition enregistrée.</p> : <ol className="relative space-y-4 border-l border-slate-200 pl-5">{data.history.map((event) => <li key={event.id}><span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-rose-500" /><div className="flex flex-wrap items-center gap-2"><GitBranch size={15} /><p className="font-semibold">{event.machine_code}</p><StateBadge value={event.to_state} /></div><p className="mt-1 text-sm text-slate-600">{event.from_state || "création"} → {event.to_state} · {event.actor_type}</p><p className="mt-1 text-xs text-slate-400">{formatDate(event.created_at)}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol>}
      </AdminPanel>
      {data.financial_access ? (
        <AdminPanel title="Finance — lecture seule" description="Aucune action de remboursement, transfert, allocation ou correction n’est disponible dans cette tranche.">
          <div className="mb-5 flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-800"><LockKeyhole size={18} /> Données réservées aux administrateurs disposant de finance.read.</div>
          <div className="grid gap-4 xl:grid-cols-2">
            <FinancialRecord title="Paiement v2" record={financial.payment} fields={(record) => [
              { label: "État", value: record.status }, { label: "Total client", value: formatCents(record.client_total_cents, record.currency) },
              { label: "PaymentIntent", value: record.stripe_payment_intent_id, mono: true }, { label: "Charge", value: record.stripe_charge_id, mono: true },
              { label: "Confirmé", value: formatDate(record.confirmed_at) }, { label: "Devise", value: record.currency },
            ]} />
            <FinancialRecord title="Libération" record={financial.release} fields={(record) => [
              { label: "État", value: record.status }, { label: "Montant brut prestataire", value: formatCents(record.provider_awarded_gross_amount_cents, record.currency) },
              { label: "Déclencheur", value: record.release_trigger }, { label: "Échéance", value: formatDate(record.release_due_at) },
              { label: "Libéré", value: formatDate(record.released_at) }, { label: "Blocages", value: record.blocker_codes?.join(", ") },
            ]} />
            <FinancialRecord title="Transfert prestataire" record={financial.transfer} fields={(record) => [
              { label: "État", value: record.status }, { label: "Montant", value: formatCents(record.amount_cents, record.currency) },
              { label: "Transfert Stripe", value: record.stripe_transfer_id, mono: true }, { label: "Créé", value: formatDate(record.created_at) },
              { label: "Exécuté", value: formatDate(record.transferred_at) }, { label: "Échec", value: record.last_error_message },
            ]} />
            <div className="rounded-xl border border-slate-200 p-4"><h3 className="font-semibold">Incidents et remédiations</h3><DefinitionList items={[
              { label: "Litiges prestation", value: financial.service_dispute ? 1 : 0 }, { label: "Chargebacks", value: financial.payment_disputes.length },
              { label: "Remboursements", value: financial.refunds.length }, { label: "Inversions", value: financial.reversals.length },
              { label: "Déficits", value: financial.recovery_deficits.length }, { label: "Blocages actifs", value: financial.active_holds.length },
            ]} /></div>
          </div>
          {financial.legacy_payments.length > 0 && <div className="mt-4 rounded-xl border border-slate-200 p-4"><h3 className="flex items-center gap-2 font-semibold"><Banknote size={17} /> Paiements legacy</h3><div className="mt-3 divide-y divide-slate-100">{financial.legacy_payments.map((payment) => <div key={payment.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm"><span><StateBadge value={payment.status} /> <span className="ml-2 font-mono text-xs">{shortId(payment.stripe_payment_id)}</span></span><span>{formatCents(payment.amount_cents ?? Math.round(Number(payment.amount || 0) * 100), payment.currency || currency)}</span></div>)}</div></div>}
        </AdminPanel>
      ) : <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600"><LockKeyhole size={18} className="mb-2" /> Les données financières ne sont pas incluses : la permission <code>finance.read</code> est absente.</div>}
    </div>
  );
}
