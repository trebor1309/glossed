import { useState } from "react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { ErrorPanel, DefinitionList, formatCents, formatDate } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { isRecentMfaError } from "./adminPresentation";
import {
  executeAdminFinancialOperation,
  previewAdminFinancialOperation,
} from "./adminOperationsApi";

const labels = {
  refund: "Relancer le remboursement",
  transfer_reversal: "Relancer l’inversion",
  provider_retransfer: "Retransférer la récupération provisoire",
};

export default function AdminFinancialAction({ operationType, operationId, requiresRisk, onComplete }) {
  const { hasPermission } = useAdminAuth();
  const [preview, setPreview] = useState(null);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const allowed = hasPermission("finance.execute") && (!requiresRisk || hasPermission("risk.manage"));

  if (!allowed) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <LockKeyhole size={18} className="mb-2" />
      Cette action exige {requiresRisk ? <><code>finance.execute</code> et <code>risk.manage</code></> : <code>finance.execute</code>}.
    </div>;
  }

  const makePreview = async () => {
    setBusy(true); setError(null);
    try {
      setPreview(await previewAdminFinancialOperation(operationType, operationId));
      setNeedsMfa(false); setConfirmed(false);
    } catch (previewError) {
      if (isRecentMfaError(previewError)) { setNeedsMfa(true); setError(null); }
      else setError(previewError.message);
    } finally { setBusy(false); }
  };

  const execute = async () => {
    setBusy(true); setError(null);
    try {
      await executeAdminFinancialOperation(preview.id, reason.trim(), crypto.randomUUID());
      setPreview(null); setReason(""); setConfirmed(false);
      await onComplete?.();
    } catch (executeError) {
      if (isRecentMfaError(executeError)) { setNeedsMfa(true); setError(null); }
      else setError(executeError.message);
    }
    finally { setBusy(false); }
  };

  return <div className="space-y-3">
    {!preview && <button type="button" disabled={busy} onClick={makePreview} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{labels[operationType]}</button>}
    {needsMfa && <AdminMfaReauthentication required onVerified={() => setNeedsMfa(false)} />}
    {preview && <div className="space-y-4 rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
      <p className="flex items-center gap-2 font-bold text-rose-950"><ShieldCheck size={20} />Prévisualisation serveur immuable</p>
      <DefinitionList items={[
        { label: "Opération", value: labels[preview.operation_type] },
        { label: "Montant", value: formatCents(preview.amount_cents, preview.currency?.toUpperCase()) },
        { label: "État actuel", value: preview.workflow_state },
        { label: "Identité idempotente", value: preview.stable_idempotency_key, mono: true },
        { label: "Objet Stripe source", value: preview.stripe_object_id, mono: true },
        { label: "Expire", value: formatDate(preview.expires_at) },
      ]} />
      <label className="block text-sm font-semibold">Justification obligatoire<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={4000} rows={3} className="mt-1 w-full rounded-xl border border-rose-300 px-3 py-2" /></label>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>Je confirme cette opération existante, avec sa clé d’idempotence inchangée.</span></label>
      <button type="button" disabled={busy || !confirmed || reason.trim().length < 10} onClick={execute} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirmer l’exécution</button>
    </div>}
    {error && <ErrorPanel error={error} />}
  </div>;
}
