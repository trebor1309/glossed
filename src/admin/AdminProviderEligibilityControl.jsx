import { useMemo, useRef, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import { AdminPanel, DefinitionList, StateBadge, formatDate } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import { recordAdminProviderEligibility } from "./adminOperationsApi";
import { humanizeAdminError } from "./adminPresentation";

const inputClass = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2";

export default function AdminProviderEligibilityControl({
  profile,
  declaration,
  eligibility,
  history,
  policies,
  onChanged,
}) {
  const { hasPermission } = useAdminAuth();
  const applicablePolicies = useMemo(() => policies || [], [policies]);
  const [policyVersion, setPolicyVersion] = useState(applicablePolicies[0]?.version || "");
  const [status, setStatus] = useState("review_required");
  const [category, setCategory] = useState(applicablePolicies[0]?.service_category_code || "*");
  const [validUntil, setValidUntil] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const operation = useRef(null);
  const selectedPolicy = useMemo(
    () => applicablePolicies.find((policy) => policy.version === policyVersion),
    [applicablePolicies, policyVersion]
  );

  if (profile.role !== "pro") return null;
  const changePolicy = (version) => {
    const policy = applicablePolicies.find((item) => item.version === version);
    setPolicyVersion(version);
    setCategory(policy?.service_category_code || "*");
    operation.current = null;
  };
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      operation.current ||= crypto.randomUUID();
      await recordAdminProviderEligibility({
        providerId: profile.id,
        policyVersion,
        serviceCategoryCode: category.trim() || "*",
        status,
        validUntil: status === "eligible" ? new Date(validUntil).toISOString() : null,
        reason: reason.trim(),
        operationId: operation.current,
      });
      operation.current = null;
      setReason("");
      setValidUntil("");
      await onChanged();
    } catch (submitError) {
      setError(humanizeAdminError(submitError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminPanel title="Éligibilité prestataire" description="Déclaration du prestataire, politique applicable et décisions immuables versionnées.">
      {eligibility || declaration ? <DefinitionList items={[
        { label: "État", value: eligibility?.status },
        { label: "Politique", value: eligibility?.policy_version, mono: true },
        { label: "Pays de résidence", value: declaration?.residence_country_code },
        { label: "Pays de prestation", value: eligibility?.service_country_code || declaration?.service_country_code },
        { label: "Statut déclaré", value: declaration?.provider_status_code },
        { label: "Trader", value: declaration?.trader_classification },
        { label: "Validité", value: formatDate(eligibility?.valid_until) },
        { label: "Motif", value: eligibility?.reason },
      ]} /> : <p className="text-sm text-slate-500">Aucune déclaration d’éligibilité.</p>}

      {hasPermission("verification.review") && declaration && (
        <form onSubmit={submit} className="mt-5 space-y-4 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 font-semibold"><BadgeCheck size={17} className="text-rose-600" /> Enregistrer une décision</h3>
          {applicablePolicies.length === 0 ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Aucune politique active ne correspond à cette déclaration. Crée d’abord une politique d’éligibilité dans Configuration.</p>
          ) : <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold">Politique<select value={policyVersion} onChange={(event) => changePolicy(event.target.value)} className={inputClass}>{applicablePolicies.map((policy) => <option key={policy.version} value={policy.version}>{policy.version} · {policy.jurisdiction_code}</option>)}</select></label>
              <label className="text-sm font-semibold">Décision<select value={status} onChange={(event) => { setStatus(event.target.value); operation.current = null; }} className={inputClass}><option value="review_required">Revue complémentaire requise</option><option value="eligible">Éligible</option><option value="ineligible">Non éligible</option></select></label>
              <label className="text-sm font-semibold">Catégorie de service<input value={category} onChange={(event) => { setCategory(event.target.value.toLowerCase()); operation.current = null; }} disabled={Boolean(selectedPolicy?.service_category_code)} pattern="\*|[a-z][a-z0-9_.-]{1,99}" className={inputClass} required /></label>
              {status === "eligible" && <label className="text-sm font-semibold">Valide jusqu’au<input type="datetime-local" value={validUntil} onChange={(event) => { setValidUntil(event.target.value); operation.current = null; }} min={new Date(Date.now() + 60000).toISOString().slice(0, 16)} className={inputClass} required /></label>}
            </div>
            <label className="block text-sm font-semibold">Motif détaillé<textarea value={reason} onChange={(event) => { setReason(event.target.value); operation.current = null; }} minLength={10} maxLength={4000} rows={3} className={inputClass} required /></label>
            {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
            <button type="submit" disabled={busy || reason.trim().length < 10 || !policyVersion || (status === "eligible" && !validUntil)} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Enregistrer la décision</button>
          </>}
        </form>
      )}

      <div className="mt-5 border-t border-slate-200 pt-5">
        <h3 className="text-sm font-semibold">Historique des évaluations</h3>
        {(history || []).length === 0 ? <p className="mt-2 text-sm text-slate-500">Aucune évaluation enregistrée.</p> : <ol className="mt-3 space-y-3">{history.map((item) => <li key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><span><StateBadge value={item.status} /> <code className="ml-2 text-xs">{item.policy_version}</code></span><span className="text-xs text-slate-500">{formatDate(item.created_at)}</span></div><p className="mt-2 text-slate-700">{item.reason}</p><p className="mt-1 text-xs text-slate-500">Catégorie {item.service_category_code} · par {item.actor_label || item.actor_type}</p></li>)}</ol>}
      </div>
    </AdminPanel>
  );
}
