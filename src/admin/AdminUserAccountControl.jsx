import { useState } from "react";
import { AlertTriangle, Loader2, LockKeyhole, RotateCcw } from "lucide-react";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import AdminModalShell from "./AdminModalShell";
import { AdminPanel, StateBadge, formatDate } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import { controlAdminUserAccount } from "./adminOperationsApi";
import { humanizeAdminError, isRecentMfaError } from "./adminPresentation";

export default function AdminUserAccountControl({ profile, control, history, onChanged }) {
  const { hasPermission } = useAdminAuth();
  const [targetStatus, setTargetStatus] = useState(null);
  const [reason, setReason] = useState("");
  const [operationId, setOperationId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [needsMfa, setNeedsMfa] = useState(false);
  const status = control?.status || "active";

  const open = (nextStatus) => {
    setTargetStatus(nextStatus);
    setReason("");
    setOperationId(crypto.randomUUID());
    setError(null);
    setNeedsMfa(false);
  };
  const close = () => {
    if (busy) return;
    setTargetStatus(null);
    setReason("");
    setOperationId(null);
    setError(null);
    setNeedsMfa(false);
  };
  const submit = async () => {
    if (!targetStatus || !operationId || reason.trim().length < 10) return;
    setBusy(true);
    setError(null);
    try {
      await controlAdminUserAccount(profile.id, targetStatus, reason.trim(), operationId);
      setTargetStatus(null);
      setReason("");
      setOperationId(null);
      setNeedsMfa(false);
      await onChanged();
    } catch (submitError) {
      if (isRecentMfaError(submitError)) setNeedsMfa(true);
      setError(humanizeAdminError(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPanel
      title="Contrôle du compte"
      description="Le statut est synchronisé avec Supabase Auth et appliqué aux API, fonctions et fichiers privés."
    >
      <div className={`rounded-xl border p-4 ${status === "suspended" ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accès actuel</p>
            <div className="mt-2"><StateBadge value={status} /></div>
          </div>
          {hasPermission("users.manage") && (status === "active" ? (
            <button type="button" onClick={() => open("suspended")} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold text-white">
              <LockKeyhole size={16} /> Suspendre
            </button>
          ) : (
            <button type="button" onClick={() => open("active")} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
              <RotateCcw size={16} /> Réactiver
            </button>
          ))}
        </div>
        {control?.reason && <p className="mt-3 text-sm text-slate-700"><strong>Dernier motif :</strong> {control.reason}</p>}
        <p className="mt-2 text-xs text-slate-500">Dernière modification : {formatDate(control?.updated_at)}</p>
      </div>
      <div className="mt-5">
        <h3 className="text-sm font-semibold">Historique</h3>
        {(history || []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Aucun changement de statut.</p> : (
          <ol className="mt-3 space-y-3">{history.map((event) => (
            <li key={event.id} className="rounded-xl bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><span><StateBadge value={event.previous_status} /> <span className="px-1">→</span> <StateBadge value={event.new_status} /></span><span className="text-xs text-slate-500">{formatDate(event.created_at)}</span></div>
              <p className="mt-2 text-slate-700">{event.reason}</p>
              <p className="mt-1 text-xs text-slate-500">Par {event.actor_label || event.actor_admin_id}</p>
            </li>
          ))}</ol>
        )}
      </div>
      {targetStatus && (
        <AdminModalShell
          title={targetStatus === "suspended" ? "Suspendre ce compte" : "Réactiver ce compte"}
          description={targetStatus === "suspended"
            ? "La connexion et les accès applicatifs seront bloqués. Les données et l’historique restent conservés."
            : "La connexion et les accès applicatifs seront rétablis. La suspension reste visible dans l’audit."}
          busy={busy}
          onClose={close}
        >
          {targetStatus === "suspended" && <div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={18} /><p>Vérifie l’identité et les éventuelles missions en cours avant de confirmer.</p></div>}
          <label className="block text-sm font-semibold">Motif détaillé<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={4000} rows={4} className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2" required /></label>
          {needsMfa && <div className="mt-4"><AdminMfaReauthentication required onVerified={() => { setNeedsMfa(false); setError(null); }} /></div>}
          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-700">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} disabled={busy} className="rounded-xl border px-4 py-2 font-semibold">Annuler</button>
            <button type="button" onClick={submit} disabled={busy || reason.trim().length < 10 || needsMfa} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 font-semibold text-white disabled:opacity-50 ${targetStatus === "suspended" ? "bg-red-700" : "bg-emerald-700"}`}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {targetStatus === "suspended" ? "Confirmer la suspension" : "Confirmer la réactivation"}
            </button>
          </div>
        </AdminModalShell>
      )}
    </AdminPanel>
  );
}
