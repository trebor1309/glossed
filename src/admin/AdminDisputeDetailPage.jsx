import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, FilePlus2, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { AdminPanel, DefinitionList, ErrorPanel, LoadingPanel, StateBadge, formatCents, formatDate } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { isRecentMfaError } from "./adminPresentation";
import {
  addAdminDisputeEvidence, decideAdminDispute, getAdminCancellationCase,
  getAdminDisputeCase, getAdminEvidenceUrl, previewDisputeAllocation,
  uploadAdminDisputeEvidence,
} from "./adminOperationsApi";

const decisions = [
  ["provider_full", "Attribution intégrale au prestataire"],
  ["client_full_refund", "Remboursement intégral au client"],
  ["partial", "Allocation partielle"],
  ["reject_dispute", "Rejet du litige"],
];

function EvidenceLink({ reference }) {
  const [url, setUrl] = useState(null);
  const open = async () => {
    try { setUrl(await getAdminEvidenceUrl(reference)); }
    catch { setUrl(null); }
  };
  return url ? <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-rose-700">{reference.name || "Pièce jointe"}<ExternalLink size={13} /></a>
    : <button type="button" onClick={open} className="text-rose-700 underline">Ouvrir la pièce privée</button>;
}

function AllocationPreview({ disputeId, data, reload }) {
  const { hasPermission } = useAdminAuth();
  const [decision, setDecision] = useState("provider_full");
  const [amounts, setAmounts] = useState({ gross: "", withholding: "0", tax: "0" });
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasRoles = hasPermission("disputes.allocate") && hasPermission("finance.execute");
  const toCents = (value) => Math.round(Number(value || 0) * 100);
  const makePreview = async () => {
    setBusy(true); setError(null); setConfirmed(false);
    try {
      setPreview(await previewDisputeAllocation(disputeId, decision, decision === "partial" ? {
        provider_awarded_gross_amount_cents: toCents(amounts.gross),
        provider_statutory_withholding_amount_cents: toCents(amounts.withholding),
        client_tax_allocated_amount_cents: toCents(amounts.tax),
      } : {}));
    } catch (previewError) { if (isRecentMfaError(previewError)) { setNeedsMfa(true); setError(null); } else setError(previewError.message); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (!confirmed) return;
    setBusy(true); setError(null);
    try { await decideAdminDispute(preview.id, reason, { evidence_ids: data.evidence.map((item) => item.id) }); await reload(); }
    catch (commitError) { if (isRecentMfaError(commitError)) { setNeedsMfa(true); setError(null); } else setError(commitError.message); }
    finally { setBusy(false); }
  };
  if (!hasRoles) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><LockKeyhole size={18} className="mb-2" />La décision financière exige simultanément les permissions <code>disputes.allocate</code> et <code>finance.execute</code>.</div>;
  if (!data.can_allocate || needsMfa) return <AdminMfaReauthentication required description="Saisissez un nouveau code avant de prévisualiser ou confirmer une allocation." onVerified={async () => { setNeedsMfa(false); await reload(); }} />;
  const currency = (preview?.currency || data.mission_detail?.financial?.terms_snapshot?.currency || "eur").toUpperCase();
  return <div className="space-y-4">
    <div><label className="text-sm font-semibold" htmlFor="decision">Décision</label><select id="decision" value={decision} onChange={(e) => { setDecision(e.target.value); setPreview(null); }} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2">{decisions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    {decision === "partial" && <div className="grid gap-3 sm:grid-cols-3">{[["gross","Brut attribué prestataire"],["withholding","Retenue statutaire incluse"],["tax","Taxe client allouée"]].map(([key,label]) => <label key={key} className="text-sm font-semibold">{label}<input type="number" min="0" step="0.01" value={amounts[key]} onChange={(e) => { setAmounts({ ...amounts, [key]: e.target.value }); setPreview(null); }} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label>)}</div>}
    <button type="button" disabled={busy} onClick={makePreview} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Prévisualiser chaque centime</button>
    {preview && <div className="space-y-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
      <div className="flex items-center gap-2 font-bold text-rose-950"><ShieldCheck size={20} /> Allocation serveur à confirmer</div>
      <DefinitionList items={[
        { label:"Total encaissé",value:formatCents(preview.client_total_amount_cents,currency) },
        { label:"Brut attribué prestataire",value:formatCents(preview.provider_awarded_gross_amount_cents,currency) },
        { label:"Retenue statutaire (incluse dans le brut)",value:formatCents(preview.provider_statutory_withholding_amount_cents,currency) },
        { label:"Transfert prestataire",value:formatCents(preview.provider_transfer_amount_cents,currency) },
        { label:`Commission Glossed (${preview.platform_fee_rate_bps} bps)`,value:formatCents(preview.platform_fee_final_amount_cents,currency) },
        { label:"Taxe client allouée",value:formatCents(preview.client_tax_allocated_amount_cents,currency) },
        { label:"Remboursement client",value:formatCents(preview.client_refund_amount_cents,currency) },
        { label:"Récupération prestataire à tenter",value:formatCents(preview.provider_recovery_target_amount_cents,currency) },
      ]} />
      <label className="block text-sm font-semibold">Justification obligatoire<textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={10} maxLength={4000} rows={4} className="mt-1 w-full rounded-xl border border-rose-300 px-3 py-2" /></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" /><span>Je confirme explicitement cette allocation de chaque centime et son exécution par les workflows serveur v2.</span></label>
      <button type="button" disabled={busy || !confirmed || reason.trim().length < 10} onClick={commit} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Valider définitivement</button>
    </div>}
    {error && <ErrorPanel error={error} />}
  </div>;
}

export default function AdminDisputeDetailPage() {
  const { caseType, caseId } = useParams();
  const { session, hasPermission } = useAdminAuth();
  const [data, setData] = useState(null); const [error, setError] = useState(null); const [loading, setLoading] = useState(true);
  const [statement, setStatement] = useState(""); const [files, setFiles] = useState([]); const [evidenceBusy, setEvidenceBusy] = useState(false);
  const load = useCallback(async () => { setLoading(true); setError(null); try { setData(caseType === "cancellation" ? await getAdminCancellationCase(caseId) : await getAdminDisputeCase(caseId)); } catch (loadError) { setError(loadError.message); } finally { setLoading(false); } }, [caseId, caseType]);
  useEffect(() => { load(); }, [load]);
  const isDispute = caseType === "dispute";
  const mission = data?.mission_detail?.mission;
  const evidence = useMemo(() => data?.evidence || [], [data]);
  const submitEvidence = async () => {
    setEvidenceBusy(true); setError(null);
    try {
      const attachments = [];
      for (const file of files) attachments.push(await uploadAdminDisputeEvidence(caseId, session.user.id, file));
      await addAdminDisputeEvidence(caseId, statement, attachments); setStatement(""); setFiles([]); await load();
    } catch (submitError) { setError(submitError.message); } finally { setEvidenceBusy(false); }
  };
  if (loading) return <LoadingPanel />; if (error && !data) return <ErrorPanel error={error} retry={load} />;
  const record = data.dispute || data.cancellation;
  return <div className="space-y-6">
    <Link to="/litiges" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"><ArrowLeft size={16} /> Retour aux files</Link>
    <header className="rounded-2xl bg-slate-950 p-6 text-white"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">{isDispute ? "Litige de prestation" : "Annulation à traiter"}</p><h1 className="mt-2 text-2xl font-bold">{record.issue_code || record.cancellation_type}</h1><p className="mt-2 text-sm text-slate-300">{record.reason}</p><div className="mt-4"><StateBadge value={data.workflow.current_state} /></div></header>
    {error && <ErrorPanel error={error} retry={load} />}
    <div className="grid gap-6 xl:grid-cols-2"><AdminPanel title="Mission et contrat"><DefinitionList items={[{label:"Mission",value:mission?.id,mono:true},{label:"Service",value:mission?.service},{label:"Début",value:formatDate(data.mission_detail?.contract_snapshot?.scheduled_start_at)},{label:"Version contrat",value:data.mission_detail?.contract_snapshot?.contract_version},{label:"Juridiction",value:data.mission_detail?.contract_snapshot?.jurisdiction_code}]} /><Link to={`/missions/${mission?.id}`} className="mt-4 inline-block text-sm font-semibold text-rose-700">Ouvrir la fiche mission</Link></AdminPanel><AdminPanel title="Parties"><DefinitionList items={[{label:"Client",value:data.mission_detail?.client?.email},{label:"Prestataire",value:data.mission_detail?.provider?.email},{label:"Ouvert par",value:record.opened_by_actor_type || record.requested_by_actor_type},{label:"Créé",value:formatDate(record.created_at)}]} /></AdminPanel></div>
    <AdminPanel title="Chronologie et échanges disponibles"><div className="space-y-3">{(data.timeline || []).map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-3 text-sm"><div className="flex justify-between gap-3"><b>{item.from_state || "création"} → {item.to_state}</b><span>{formatDate(item.created_at)}</span></div><p className="mt-1 text-slate-600">{item.reason}</p></div>)}{(data.messages || []).map((message) => <div key={message.id} className="rounded-xl bg-slate-50 p-3 text-sm"><p>{message.content || "Pièce jointe"}</p><p className="mt-1 text-xs text-slate-400">{formatDate(message.created_at)}</p>{message.attachment_url && <EvidenceLink reference={{ bucket:"chat_attachments",path:message.attachment_url,name:"Pièce du chat" }} />}</div>)}</div></AdminPanel>
    {isDispute ? <>
      <AdminPanel title="Preuves privées"><div className="space-y-4">{evidence.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><p className="text-xs text-slate-500">{item.submitted_by_actor_type} · {formatDate(item.created_at)}</p><p className="mt-2 whitespace-pre-wrap text-sm">{item.statement}</p><div className="mt-2 flex flex-wrap gap-3">{item.attachments.map((reference) => <EvidenceLink key={reference.path} reference={reference} />)}</div></article>)}</div>{hasPermission("disputes.decide") && <div className="mt-5 border-t border-slate-200 pt-5"><label className="text-sm font-semibold">Ajouter une note ou des preuves<textarea value={statement} onChange={(e) => setStatement(e.target.value)} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" /></label><input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFiles([...e.target.files])} className="mt-3 block text-sm" /><button type="button" disabled={evidenceBusy || !statement.trim()} onClick={submitEvidence} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><FilePlus2 size={17} /> Enregistrer dans le dossier</button></div>}</AdminPanel>
      <AdminPanel title="Situation financière et décision" description="La prévisualisation serveur est immuable et la confirmation n’appelle jamais Stripe depuis le navigateur."><AllocationPreview disputeId={caseId} data={data} reload={load} /></AdminPanel>
    </> : <AdminPanel title="Propositions d’allocation et orientation"><div className="space-y-3">{data.allocation_proposals.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap justify-between gap-2"><b>Proposition #{item.revision}</b><StateBadge value={item.accepted_at ? "accepted" : "pending"} /></div><p className="mt-2 text-sm">Brut prestataire : {formatCents(item.provider_awarded_gross_amount_cents, "EUR")} · Remboursement : {formatCents(item.client_refund_amount_cents, "EUR")}</p><p className="mt-1 text-sm text-slate-600">{item.reason}</p></div>)}</div>{data.linked_dispute_id ? <Link to={`/litiges/dispute/${data.linked_dispute_id}`} className="mt-5 inline-block rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Ouvrir le litige lié</Link> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Aucun litige lié n’est encore disponible. L’allocation ne peut pas être décidée hors du workflow v2.</p>}</AdminPanel>}
    {data.resolution && <AdminPanel title="Exécution financière"><DefinitionList items={[{label:"État résolution",value:data.resolution.status},{label:"Brut attribué",value:formatCents(data.resolution.provider_awarded_gross_amount_cents,data.resolution.currency || "EUR")},{label:"Remboursement",value:formatCents(data.resolution.client_refund_amount_cents,data.resolution.currency || "EUR")},{label:"Déficit/récupération",value:formatCents(data.resolution.provider_recovery_target_amount_cents,data.resolution.currency || "EUR")},{label:"Remboursement Stripe",value:data.refund?.succeeded_at ? "Réussi" : data.refund?.last_error_message ? "Échoué" : data.refund ? "En attente" : "Non requis"},{label:"Inversion",value:data.reversal?.succeeded_at ? "Réussie" : data.reversal?.last_error_message ? "Échouée / revue" : data.reversal ? "En attente" : "Non requise"}]} /></AdminPanel>}
  </div>;
}
