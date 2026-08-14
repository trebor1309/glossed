import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import AdminControlReactivation from "./AdminControlReactivation";
import { getAdminFinancialIncident, reconcileAdminFinancialIncident } from "./adminOperationsApi";

export default function AdminIncidentDetailPage() {
  const { incidentKey } = useParams(); const key = decodeURIComponent(incidentKey);
  const { hasPermission } = useAdminAuth();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(null); try { setData(await getAdminFinancialIncident(key)); } catch (e) { setError(e.message); } }, [key]);
  useEffect(() => { load(); }, [load]);
  const reconcile = async () => { setBusy(true); setError(null); try { await reconcileAdminFinancialIncident(key); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  if (error && !data) return <ErrorPanel error={error} retry={load} />;
  if (!data) return <LoadingPanel />;
  const incident = data.incident; const latest = data.reconciliations?.[0];
  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><Link to="/incidents" className="text-sm font-semibold text-rose-700">← Incidents</Link><div className="mt-3 flex flex-wrap items-center gap-3"><h1 className="text-2xl font-bold">{incident.incident_type}</h1><StateBadge value={incident.severity} /></div><p className="mt-2 text-sm text-slate-600">{incident.detail}</p></header>
    {error && <ErrorPanel error={error} />}
    <div className="grid gap-6 xl:grid-cols-2">
      <AdminPanel title="Divergence Stripe / Glossed"><DefinitionList items={[{label:"Attendu Glossed",value:formatCents(incident.glossed_amount_cents,incident.currency?.toUpperCase())},{label:"Observé Stripe",value:formatCents(incident.stripe_amount_cents,incident.currency?.toUpperCase())},{label:"Divergence",value:formatCents(incident.divergence_amount_cents,incident.currency?.toUpperCase())},{label:"Objet Stripe",value:incident.stripe_object_id,mono:true},{label:"Paiement",value:incident.payment_id,mono:true},{label:"Survenu",value:formatDate(incident.occurred_at)}]} /></AdminPanel>
      <AdminPanel title="Rapprochement" description="Le serveur recalcule l’équilibre du grand livre et l’état des sources enregistrées."><DefinitionList items={[{label:"État",value:latest?.reconciliation_status || "Non exécuté"},{label:"Grand livre équilibré",value:latest ? (latest.ledger_balanced ? "Oui" : "Non") : null},{label:"Source résolue",value:latest ? (latest.source_resolved ? "Oui" : "Non") : null},{label:"Contrôlé",value:formatDate(latest?.checked_at)}]} />{hasPermission("incidents.reconcile") && <button type="button" onClick={reconcile} disabled={busy} className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Lancer le rapprochement serveur</button>}</AdminPanel>
    </div>
    {incident.control_id && <AdminPanel title="Réactivation contrôlée" description="Impossible sans rapprochement concluant, permission financière, MFA récent, prévisualisation et justification."><AdminControlReactivation controlId={incident.control_id} reconciliation={latest} onComplete={load} /></AdminPanel>}
    <AdminPanel title="Écritures concernées">{data.ledger_batches.length === 0 ? <p className="text-sm text-slate-500">Aucune écriture directement rattachée.</p> : <div className="divide-y">{data.ledger_batches.map((batch) => <div key={batch.id} className="grid gap-2 py-3 text-sm sm:grid-cols-4"><span>{batch.operation_type}</span><span className="font-mono text-xs">{batch.id}</span><span>Débit {formatCents(batch.debit_total_cents,batch.currency?.toUpperCase())}</span><span>Crédit {formatCents(batch.credit_total_cents,batch.currency?.toUpperCase())}</span></div>)}</div>}</AdminPanel>
    <AdminPanel title="Chronologie"><div className="space-y-3">{[...(data.runtime_events || []),...(data.financial_timeline || [])].sort((a,b) => new Date(a.changed_at || a.created_at)-new Date(b.changed_at || b.created_at)).map((event,index) => <div key={event.id || index} className="border-l-2 border-slate-200 pl-4 text-sm"><p className="font-semibold">{event.event_type || `${event.previous_state || "—"} → ${event.new_state}`}</p><p className="text-slate-500">{formatDate(event.created_at || event.changed_at)}</p></div>)}</div></AdminPanel>
  </div>;
}
