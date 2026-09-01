import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, ShieldCheck, UserCog } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { AdminPanel, ErrorPanel, LoadingPanel, StateBadge, formatDate } from "./AdminDataUi";
import {
  executeAdministratorChange,
  getAdministratorCatalog,
  getAdministratorHistory,
  listAdministrators,
  previewAdministratorChange,
} from "./adminOperationsApi";
import {
  adminLabel,
  adminRoleDescription,
  adminRoleLabel,
  formatRelativeFuture,
  humanizeAdminError,
  isRecentMfaError,
} from "./adminPresentation";

const emptyActivation = { email: "", displayName: "", roles: [] };

function RoleSelector({ catalog, selected, onChange, disabled = false }) {
  return <div className="grid gap-3 md:grid-cols-2">{(catalog?.roles || []).map((role) => {
    const privileged = role.role_code === "super_admin";
    return <label key={role.role_code} className={`flex gap-3 rounded-xl border p-3 text-sm ${privileged ? "border-rose-300 bg-rose-50" : "border-slate-200"} ${disabled ? "opacity-60" : ""}`}>
      <input type="checkbox" checked={selected.includes(role.role_code)} disabled={disabled} className="mt-1" onChange={(event) => onChange(event.target.checked ? [...selected, role.role_code] : selected.filter((code) => code !== role.role_code))} />
      <span><strong className={`block ${privileged ? "text-rose-900" : "text-slate-900"}`}>{adminRoleLabel(role.role_code)}{privileged && " — privilège maximal"}</strong><span className="text-slate-600">{adminRoleDescription(role.role_code, role.description)}</span></span>
    </label>;
  })}</div>;
}

const roleList = (roles) => (roles || []).map(adminRoleLabel).join(", ") || "Aucun rôle";

function previewConsequence(preview) {
  if (preview.action === "activate") return "L’identité pourra accéder au back-office avec les rôles indiqués dès qu’elle se reconnectera avec son MFA.";
  if (preview.action === "update") return "Les nouvelles permissions remplaceront les rôles actuels. Les contrôles serveur restent appliqués à chaque action.";
  const status = preview.proposed_state?.status;
  if (status === "active") return "L’accès au back-office sera rétabli avec les rôles actuellement conservés.";
  if (status === "suspended") return "L’accès sera bloqué temporairement. Les rôles sont conservés et une réactivation contrôlée restera possible.";
  return "L’accès sera désactivé. Les rôles sont conservés pour l’audit et une réactivation contrôlée restera possible.";
}

function confirmationLabel(preview) {
  if (preview.action === "activate") return "Activer cet administrateur";
  if (preview.action === "update") return "Appliquer ces rôles";
  if (preview.proposed_state?.status === "active") return "Réactiver cet administrateur";
  if (preview.proposed_state?.status === "suspended") return "Suspendre cet administrateur";
  return "Désactiver cet administrateur";
}

function HumanPreview({ preview, rolesByCode }) {
  const before = preview.before_state || {};
  const after = preview.proposed_state || {};
  const checks = after.security_checks;
  const rows = [
    ["Nom affiché", before.display_name || "—", after.display_name || "—"],
    ["Email", before.email || "—", after.email || "—"],
    ["État", before.status ? adminLabel(before.status) : "Non activé", adminLabel(after.status)],
    ["Rôles", (before.roles || []).map((role) => rolesByCode[role] || adminRoleLabel(role)).join(", ") || "Aucun", (after.roles || []).map((role) => rolesByCode[role] || adminRoleLabel(role)).join(", ") || "Aucun"],
  ];
  return <div className="space-y-4">
    <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[540px] text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-4 py-3">Élément</th><th className="px-4 py-3">Avant</th><th className="px-4 py-3">Après confirmation</th></tr></thead><tbody>{rows.map(([label, previous, proposed]) => <tr key={label} className="border-t border-slate-200"><th className="px-4 py-3 font-semibold">{label}</th><td className="px-4 py-3 text-slate-600">{previous}</td><td className="px-4 py-3 font-medium text-slate-950">{proposed}</td></tr>)}</tbody></table></div>
    {checks && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="font-semibold text-emerald-950">Contrôles réalisés côté serveur</p><ul className="mt-3 grid gap-2 text-sm text-emerald-900 sm:grid-cols-2">{[
      ["identity_found", "Identité Auth trouvée"], ["email_confirmed", "Email confirmé"], ["account_type_admin", "account_type = admin"], ["consumer_profile_absent", "Aucun profil client/prestataire"],
    ].map(([key, label]) => <li key={key} className="flex items-center gap-2"><CheckCircle2 size={16} /> {label} : {checks[key] ? "validé" : "non validé"}</li>)}</ul></div>}
  </div>;
}

export default function AdminAdministratorsPage() {
  const { session } = useAdminAuth();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activation, setActivation] = useState(emptyActivation);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewNow, setPreviewNow] = useState(Date.now());
  const [executionOperationId, setExecutionOperationId] = useState(null);
  const [reason, setReason] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accounts, roleCatalog] = await Promise.all([listAdministrators(submittedQuery), getAdministratorCatalog()]);
      setData(accounts); setCatalog(roleCatalog);
    } catch (loadError) { setError(humanizeAdminError(loadError)); }
  }, [submittedQuery]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!preview) return undefined;
    const timer = window.setInterval(() => setPreviewNow(Date.now()), 15000);
    return () => window.clearInterval(timer);
  }, [preview]);

  const rolesByCode = useMemo(() => Object.fromEntries((catalog?.roles || []).map((role) => [role.role_code, adminRoleLabel(role.role_code)])), [catalog]);

  const requestPreview = async (request) => {
    setBusy(true); setError(null); setPreview(null); setExecutionOperationId(null); setPendingRequest(request);
    try {
      const nextPreview = await previewAdministratorChange(request);
      setPreview(nextPreview); setPreviewNow(Date.now()); setExecutionOperationId(crypto.randomUUID()); setNeedsMfa(false); setPendingRequest(null);
      if (request.action === "activate" && !activation.displayName && nextPreview.proposed_state?.display_name) setActivation((current) => ({ ...current, displayName: nextPreview.proposed_state.display_name }));
    } catch (previewError) {
      if (isRecentMfaError(previewError)) { setNeedsMfa(true); setError(null); }
      else setError(humanizeAdminError(previewError));
    } finally { setBusy(false); }
  };

  const selectAdministrator = async (account) => {
    setSelected(account); setDraft({ displayName: account.display_name || "", roles: account.roles }); setPreview(null); setHistory([]); setHistoryLoading(true);
    try { const result = await getAdministratorHistory(account.user_id); setHistory(result.items || []); }
    catch (historyError) { setError(humanizeAdminError(historyError)); }
    finally { setHistoryLoading(false); }
  };

  const beginActivation = (event) => { event.preventDefault(); requestPreview({ action: "activate", targetEmail: activation.email, displayName: activation.displayName, roles: activation.roles }); };
  const beginUpdate = (event) => { event.preventDefault(); requestPreview({ action: "update", targetUserId: selected.user_id, displayName: draft.displayName, roles: draft.roles }); };
  const beginStatusChange = (status) => requestPreview({ action: "set_status", targetUserId: selected.user_id, status });
  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      await executeAdministratorChange(preview.id, reason.trim(), executionOperationId);
      setPreview(null); setExecutionOperationId(null); setReason(""); setSelected(null); setDraft(null); setActivation(emptyActivation); await load();
    } catch (executeError) {
      if (isRecentMfaError(executeError)) { setNeedsMfa(true); setError(null); }
      else setError(humanizeAdminError(executeError));
    } finally { setBusy(false); }
  };

  if (!data && !error) return <LoadingPanel />;
  const isSelf = selected?.user_id === session?.user?.id;
  const isLastActiveSuper = Boolean(selected?.status === "active" && selected?.roles?.includes("super_admin") && Number(catalog?.active_super_administrator_count) <= 1);
  const removesLastSuper = isLastActiveSuper && draft && !draft.roles.includes("super_admin");
  const previewExpired = preview && new Date(preview.expires_at).getTime() <= previewNow;

  return <div className="space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h1 className="flex items-center gap-2 text-2xl font-bold"><UserCog className="text-rose-600" /> Administrateurs</h1><p className="mt-2 text-sm text-slate-600">Comptes distincts des profils Glossed, rôles granulaires et changements sensibles prévisualisés puis audités.</p></header>
    {error && <ErrorPanel error={error} retry={!data ? load : undefined} />}
    {needsMfa && <AdminPanel title="Sécurité de l’action"><AdminMfaReauthentication required showStatus onVerified={async () => { setNeedsMfa(false); if (pendingRequest) await requestPreview(pendingRequest); }} /></AdminPanel>}

    <AdminPanel title="Activer une identité admin préprovisionnée" description="Le navigateur ne crée jamais d’identité privilégiée. Les quatre contrôles d’éligibilité sont répétés côté serveur avant l’exécution."><form onSubmit={beginActivation} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Email<input type="email" required value={activation.email} onChange={(event) => setActivation({ ...activation, email: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2" /></label><label className="text-sm font-semibold">Nom affiché<input value={activation.displayName} onChange={(event) => setActivation({ ...activation, displayName: event.target.value })} placeholder="Repris des métadonnées Auth si disponible" className="mt-1 w-full rounded-xl border px-3 py-2" /></label></div><RoleSelector catalog={catalog} selected={activation.roles} onChange={(roles) => setActivation({ ...activation, roles })} /><button type="submit" disabled={busy || activation.roles.length === 0} className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">Prévisualiser l’activation</button></form></AdminPanel>

    <AdminPanel title="Comptes administrateurs"><form onSubmit={(event) => { event.preventDefault(); setSubmittedQuery(query.trim()); }} className="mb-4 flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Email, nom, rôle ou identifiant" className="min-w-0 flex-1 rounded-xl border px-3 py-2" /><button className="rounded-xl bg-slate-800 px-4 py-2 text-white">Rechercher</button></form><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b"><th className="px-3 py-2">Compte</th><th className="px-3 py-2">Rôles</th><th className="px-3 py-2">État</th><th className="px-3 py-2">MFA</th><th className="px-3 py-2">Dernier accès</th><th className="px-3 py-2" /></tr></thead><tbody>{(data?.items || []).map((account) => <tr key={account.user_id} className="border-b last:border-0"><td className="px-3 py-3"><strong className="block">{account.display_name || account.email}</strong><span className="text-xs text-slate-500">{account.email}</span></td><td className={`px-3 py-3 ${account.roles.includes("super_admin") ? "font-semibold text-rose-800" : ""}`}>{roleList(account.roles)}</td><td className="px-3 py-3"><StateBadge value={account.status} /></td><td className="px-3 py-3"><span className={account.mfa_configured ? "text-emerald-700" : "font-semibold text-red-700"}>{account.mfa_configured ? "Configuré" : "Non configuré"}</span></td><td className="px-3 py-3">{formatDate(account.last_authenticated_at)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => selectAdministrator(account)} className="rounded-lg border px-3 py-1.5 font-semibold">Gérer</button></td></tr>)}</tbody></table></div></AdminPanel>

    {selected && draft && <AdminPanel title={`Gérer ${selected.email}`} description="Les protections contre l’auto-verrouillage et la suppression du dernier super administrateur sont également imposées par le serveur.">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">État du compte</span><p className="mt-1 font-semibold">{adminLabel(selected.status)}</p></div><div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">MFA configuré</span><p className={`mt-1 font-semibold ${selected.mfa_configured ? "text-emerald-700" : "text-red-700"}`}>{selected.mfa_configured ? `Oui (${selected.verified_mfa_factor_count})` : "Non"}</p></div><div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Email confirmé</span><p className="mt-1 font-semibold">{selected.email_confirmed_at ? "Oui" : "Non"}</p></div><div className="rounded-xl bg-slate-50 p-3 text-sm"><span className="text-slate-500">Dernier accès</span><p className="mt-1 font-semibold">{formatDate(selected.last_authenticated_at)}</p></div></div>
      {selected.roles.includes("super_admin") && <div className="mb-4 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950"><p className="flex items-center gap-2 font-bold"><ShieldCheck size={18} /> Super administrateur</p><p className="mt-1">Ce rôle donne toutes les permissions du back-office, y compris la gestion des autres administrateurs.</p></div>}
      {isSelf && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> Votre propre compte ne peut pas être modifié depuis cette session.</p></div>}
      {isLastActiveSuper && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="flex items-center gap-2 font-semibold"><AlertTriangle size={17} /> Dernier super administrateur actif : sa suspension, sa désactivation et le retrait de ce rôle sont bloqués.</p></div>}
      <form onSubmit={beginUpdate} className="space-y-4"><label className="block text-sm font-semibold">Nom affiché<input value={draft.displayName} disabled={isSelf} onChange={(event) => setDraft({ ...draft, displayName: event.target.value })} className="mt-1 w-full rounded-xl border px-3 py-2 disabled:bg-slate-100" /></label><RoleSelector catalog={catalog} selected={draft.roles} disabled={isSelf} onChange={(roles) => setDraft({ ...draft, roles })} />{removesLastSuper && <p className="text-sm font-semibold text-red-700">Ajoutez d’abord un autre super administrateur actif avant de retirer ce rôle.</p>}<div className="flex flex-wrap gap-2"><button type="submit" disabled={busy || isSelf || removesLastSuper || draft.roles.length === 0} className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50">Prévisualiser les rôles</button>{selected.status !== "active" && <button type="button" disabled={busy || isSelf} onClick={() => beginStatusChange("active")} className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Prévisualiser la réactivation</button>}{selected.status === "active" && <button type="button" disabled={busy || isSelf || isLastActiveSuper} onClick={() => beginStatusChange("suspended")} className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-50">Prévisualiser la suspension</button>}{selected.status !== "disabled" && <button type="button" disabled={busy || isSelf || isLastActiveSuper} onClick={() => beginStatusChange("disabled")} className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-50">Prévisualiser la désactivation</button>}</div></form>
      <div className="mt-6 border-t border-slate-200 pt-5"><h3 className="flex items-center gap-2 font-semibold"><Clock3 size={17} /> Historique important</h3>{historyLoading ? <p className="mt-3 text-sm text-slate-500">Chargement…</p> : history.length === 0 ? <p className="mt-3 text-sm text-slate-500">Aucun changement de compte enregistré.</p> : <ol className="mt-3 space-y-3">{history.map((item) => <li key={item.id} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{item.action === "administrators.activate" ? "Activation" : item.action === "administrators.update" ? "Modification des rôles ou du nom" : "Changement d’état"}</strong><span className="text-slate-500">{formatDate(item.occurred_at)}</span></div><p className="mt-1 text-slate-600">Par {item.actor_label}</p>{item.reason && <p className="mt-2">{item.reason}</p>}</li>)}</ol>}</div>
      <details className="mt-5 rounded-xl bg-slate-50 p-4 text-sm"><summary className="cursor-pointer font-semibold">Informations techniques du compte</summary><pre className="mt-3 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify({ user_id: selected.user_id, account_type: selected.account_type, revision: selected.revision, roles: selected.roles, last_sign_in_at: selected.last_sign_in_at }, null, 2)}</pre></details>
    </AdminPanel>}

    {preview && <AdminPanel title="Confirmation du changement" description={`${formatRelativeFuture(preview.expires_at, previewNow)} (${formatDate(preview.expires_at)}).`}>{previewExpired && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">Cette prévisualisation a expiré. Annulez-la et recommencez pour obtenir un état serveur à jour.</div>}<HumanPreview preview={preview} rolesByCode={rolesByCode} /><div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">Conséquence de la confirmation</p><p className="mt-1">{previewConsequence(preview)}</p></div><details className="mt-4 rounded-xl bg-slate-50 p-4 text-sm"><summary className="cursor-pointer font-semibold">Détails techniques avant/après</summary><div className="mt-3 grid gap-4 lg:grid-cols-2"><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.before_state, null, 2)}</pre><pre className="overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(preview.proposed_state, null, 2)}</pre></div></details><label className="mt-4 block text-sm font-semibold">Justification obligatoire<textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={4000} rows={3} className="mt-1 w-full rounded-xl border px-3 py-2" /></label><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={confirm} disabled={busy || previewExpired || reason.trim().length < 10} className="flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-50"><ShieldCheck size={17} /> {confirmationLabel(preview)}</button><button type="button" onClick={() => { setPreview(null); setExecutionOperationId(null); setReason(""); }} className="rounded-xl border px-4 py-2 font-semibold">Annuler</button></div></AdminPanel>}
  </div>;
}
