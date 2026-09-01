import { useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import { formatDate } from "./AdminDataUi";
import { humanizeAdminError } from "./adminPresentation";

export default function AdminMfaReauthentication({
  required = false,
  onVerified,
  title = "Réauthentification MFA récente requise",
  description = "Saisissez le code actuel de votre application d’authentification pour renouveler la fenêtre de sécurité.",
  showStatus = false,
}) {
  const {
    access,
    factors,
    verifyMfa,
    refreshMfaFactors,
  } = useAdminAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const configured = factors.length > 0;
  const recent = access?.mfa_recent ?? !access?.financial_reauthentication_required;

  const submit = async () => {
    if (busy || !code.trim()) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const availableFactors = configured ? factors : await refreshMfaFactors();
      if (!availableFactors[0]?.id) throw new Error("Aucun facteur MFA vérifié n’est configuré.");
      await verifyMfa(code, availableFactors[0].id);
      setCode("");
      setSuccess("Réauthentification MFA renouvelée.");
      await onVerified?.();
    } catch (reauthenticationError) {
      setError(humanizeAdminError(reauthenticationError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {showStatus && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border p-3 text-sm ${configured ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            <p className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} /> MFA du compte</p>
            <p className="mt-1">{configured ? "Configuré et vérifié" : "Aucun facteur vérifié"}</p>
          </div>
          <div className={`rounded-xl border p-3 text-sm ${recent ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
            <p className="flex items-center gap-2 font-semibold"><KeyRound size={17} /> Fenêtre MFA récente</p>
            <p className="mt-1">{recent ? `Valide${access?.mfa_reauthentication_expires_at ? ` jusqu’au ${formatDate(access.mfa_reauthentication_expires_at)}` : ""}` : "Expirée — une nouvelle vérification est requise"}</p>
          </div>
        </div>
      )}
      {(required || !recent) && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-indigo-800">{description}</p>
          <div className="mt-3 flex max-w-md flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submit();
                }
              }}
              inputMode="numeric"
              pattern="[0-9]{6}"
              autoComplete="one-time-code"
              aria-label="Code MFA"
              placeholder="Code MFA à 6 chiffres"
              className="min-w-0 flex-1 rounded-lg border border-indigo-300 px-3 py-2 text-center tracking-[0.25em]"
            />
            <button
              type="button"
              disabled={busy || code.length !== 6}
              onClick={submit}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              {busy && <Loader2 size={16} className="animate-spin" />}
              Renouveler la fenêtre MFA
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm font-medium text-emerald-700">{success}</p>}
    </div>
  );
}
