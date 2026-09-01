import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { DefinitionList, ErrorPanel, formatDate } from "./AdminDataUi";
import { executeAdminControlReactivation, previewAdminControlReactivation } from "./adminOperationsApi";
import { isRecentMfaError } from "./adminPresentation";

export default function AdminControlReactivation({ controlId, reconciliation, onComplete }) {
  const { hasPermission } = useAdminAuth();
  const [preview, setPreview] = useState(null);
  const [operationId, setOperationId] = useState(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const allowed = hasPermission("finance.execute") && hasPermission("incidents.reactivate");
  if (!allowed || reconciliation?.reconciliation_status !== "matched") return null;
  const makePreview = async () => {
    setBusy(true); setError(null);
    try { setPreview(await previewAdminControlReactivation(controlId, reconciliation.id)); setOperationId(crypto.randomUUID()); setNeedsMfa(false); }
    catch (previewError) { if (isRecentMfaError(previewError)) { setNeedsMfa(true); setError(null); } else setError(previewError.message); }
    finally { setBusy(false); }
  };
  const execute = async () => {
    setBusy(true); setError(null);
    try { await executeAdminControlReactivation(preview.id, reason.trim(), operationId); await onComplete?.(); setPreview(null); setOperationId(null); }
    catch (executionError) { if (isRecentMfaError(executionError)) { setNeedsMfa(true); setError(null); } else setError(executionError.message); }
    finally { setBusy(false); }
  };
  return <div className="space-y-3">
    {!preview && <button type="button" disabled={busy} onClick={makePreview} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Prévisualiser la réactivation</button>}
    {needsMfa && <AdminMfaReauthentication required onVerified={() => setNeedsMfa(false)} />}
    {preview && <div className="space-y-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
      <p className="flex items-center gap-2 font-bold"><ShieldCheck size={20} />Prévisualisation serveur immuable</p>
      <DefinitionList items={[{label:"Contrôle",value:preview.control_id,mono:true},{label:"Révision verrouillée",value:preview.control_revision},{label:"État",value:`${preview.previous_state} → ${preview.target_state}`},{label:"Rapprochement",value:preview.reconciliation_id,mono:true},{label:"Expire",value:formatDate(preview.expires_at)}]} />
      <label className="block text-sm font-semibold">Justification obligatoire<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={4000} rows={3} className="mt-1 w-full rounded-xl border border-rose-300 px-3 py-2" /></label>
      <label className="flex gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>Je confirme la remise à l’état normal de ce contrôle après rapprochement concluant.</span></label>
      <button type="button" disabled={busy || !operationId || !confirmed || reason.trim().length < 10} onClick={execute} className="rounded-xl bg-rose-700 px-4 py-2 font-bold text-white disabled:opacity-50">Réactiver</button>
    </div>}
    {error && <ErrorPanel error={error} />}
  </div>;
}
