import { useCallback, useEffect, useMemo, useState } from "react";
import { ShieldCheck, UserCog } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import { AdminPanel, ErrorPanel, LoadingPanel, StateBadge, formatDate } from "./AdminDataUi";
import {
  executeAdministratorChange,
  getAdministratorCatalog,
  listAdministrators,
  previewAdministratorChange,
} from "./adminOperationsApi";

const emptyActivation = { email: "", displayName: "", roles: [] };

function RoleSelector({ catalog, selected, onChange }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(catalog?.roles || []).map((role) => (
        <label
          key={role.role_code}
          className="flex gap-3 rounded-xl border border-slate-200 p-3 text-sm"
        >
          <input
            type="checkbox"
            checked={selected.includes(role.role_code)}
            className="mt-1"
            onChange={(event) =>
              onChange(
                event.target.checked
                  ? [...selected, role.role_code]
                  : selected.filter((code) => code !== role.role_code)
              )
            }
          />
          <span>
            <strong className="block text-slate-900">{role.display_name}</strong>
            <span className="text-slate-500">{role.description}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

export default function AdminAdministratorsPage() {
  const { factors, verifyMfa, refreshMfaFactors } = useAdminAuth();
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [activation, setActivation] = useState(emptyActivation);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [executionOperationId, setExecutionOperationId] = useState(null);
  const [reason, setReason] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [accounts, roleCatalog] = await Promise.all([
        listAdministrators(submittedQuery),
        getAdministratorCatalog(),
      ]);
      setData(accounts);
      setCatalog(roleCatalog);
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [submittedQuery]);
  useEffect(() => {
    load();
  }, [load]);

  const rolesByCode = useMemo(
    () =>
      Object.fromEntries((catalog?.roles || []).map((role) => [role.role_code, role.display_name])),
    [catalog]
  );

  const requestPreview = async (request) => {
    setBusy(true);
    setError(null);
    setPreview(null);
    setExecutionOperationId(null);
    try {
      setPreview(await previewAdministratorChange(request));
      setExecutionOperationId(crypto.randomUUID());
      setNeedsMfa(false);
    } catch (previewError) {
      setError(previewError.message);
      setNeedsMfa(/MFA|permission/i.test(previewError.message));
    } finally {
      setBusy(false);
    }
  };

  const beginActivation = (event) => {
    event.preventDefault();
    requestPreview({
      action: "activate",
      targetEmail: activation.email,
      displayName: activation.displayName,
      roles: activation.roles,
    });
  };
  const beginUpdate = (event) => {
    event.preventDefault();
    requestPreview({
      action: "update",
      targetUserId: selected.user_id,
      displayName: draft.displayName,
      roles: draft.roles,
    });
  };
  const beginStatusChange = (status) =>
    requestPreview({
      action: "set_status",
      targetUserId: selected.user_id,
      status,
    });

  const reauthenticate = async () => {
    setBusy(true);
    setError(null);
    try {
      const availableFactors = factors.length > 0 ? factors : await refreshMfaFactors();
      await verifyMfa(mfaCode, availableFactors[0]?.id);
      setMfaCode("");
      setNeedsMfa(false);
    } catch (mfaError) {
      setError(mfaError.message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await executeAdministratorChange(preview.id, reason.trim(), executionOperationId);
      setPreview(null);
      setExecutionOperationId(null);
      setReason("");
      setSelected(null);
      setDraft(null);
      setActivation(emptyActivation);
      await load();
    } catch (executeError) {
      setError(executeError.message);
      setNeedsMfa(/MFA|permission/i.test(executeError.message));
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) return <LoadingPanel />;
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <UserCog className="text-rose-600" />
          Administrateurs
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Comptes distincts des profils Glossed, rôles granulaires et changements sensibles audités.
        </p>
      </header>
      {error && <ErrorPanel error={error} retry={load} />}
      {needsMfa && (
        <AdminPanel
          title="Réauthentification MFA requise"
          description="La fenêtre de sécurité est courte et configurable."
        >
          <div className="flex max-w-md gap-2">
            <input
              value={mfaCode}
              onChange={(event) => setMfaCode(event.target.value)}
              placeholder="Code MFA"
              inputMode="numeric"
              className="min-w-0 flex-1 rounded-xl border px-3 py-2"
            />
            <button
              type="button"
              disabled={busy || !mfaCode.trim()}
              onClick={reauthenticate}
              className="rounded-xl bg-indigo-800 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              Vérifier
            </button>
          </div>
        </AdminPanel>
      )}

      <AdminPanel
        title="Activer une identité admin préprovisionnée"
        description="Le navigateur ne crée jamais d’identité privilégiée. L’identité Auth doit déjà être confirmée, marquée account_type=admin et ne posséder aucun profil client/prestataire."
      >
        <form onSubmit={beginActivation} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">
              Email
              <input
                type="email"
                required
                value={activation.email}
                onChange={(event) => setActivation({ ...activation, email: event.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <label className="text-sm font-semibold">
              Nom affiché
              <input
                value={activation.displayName}
                onChange={(event) =>
                  setActivation({ ...activation, displayName: event.target.value })
                }
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
          </div>
          <RoleSelector
            catalog={catalog}
            selected={activation.roles}
            onChange={(roles) => setActivation({ ...activation, roles })}
          />
          <button
            type="submit"
            disabled={busy || activation.roles.length === 0}
            className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
          >
            Prévisualiser l’activation
          </button>
        </form>
      </AdminPanel>

      <AdminPanel title="Comptes administrateurs">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(query.trim());
          }}
          className="mb-4 flex gap-2"
        >
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Email, nom, rôle ou identifiant"
            className="min-w-0 flex-1 rounded-xl border px-3 py-2"
          />
          <button className="rounded-xl bg-slate-800 px-4 py-2 text-white">Rechercher</button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-3 py-2">Compte</th>
                <th className="px-3 py-2">Rôles</th>
                <th className="px-3 py-2">État</th>
                <th className="px-3 py-2">Dernier accès</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {(data?.items || []).map((account) => (
                <tr key={account.user_id} className="border-b last:border-0">
                  <td className="px-3 py-3">
                    <strong className="block">{account.display_name || account.email}</strong>
                    <span className="text-xs text-slate-500">{account.email}</span>
                  </td>
                  <td className="px-3 py-3">
                    {account.roles.map((role) => rolesByCode[role] || role).join(", ")}
                  </td>
                  <td className="px-3 py-3">
                    <StateBadge value={account.status} />
                  </td>
                  <td className="px-3 py-3">{formatDate(account.last_authenticated_at)}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(account);
                        setDraft({ displayName: account.display_name || "", roles: account.roles });
                        setPreview(null);
                      }}
                      className="rounded-lg border px-3 py-1.5 font-semibold"
                    >
                      Gérer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminPanel>

      {selected && draft && (
        <AdminPanel
          title={`Gérer ${selected.email}`}
          description="Il est impossible de modifier son propre compte ou de retirer le dernier super-administrateur actif."
        >
          <form onSubmit={beginUpdate} className="space-y-4">
            <label className="block text-sm font-semibold">
              Nom affiché
              <input
                value={draft.displayName}
                onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
                className="mt-1 w-full rounded-xl border px-3 py-2"
              />
            </label>
            <RoleSelector
              catalog={catalog}
              selected={draft.roles}
              onChange={(roles) => setDraft({ ...draft, roles })}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={busy || draft.roles.length === 0}
                className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:opacity-50"
              >
                Prévisualiser les rôles
              </button>
              {selected.status !== "active" && (
                <button
                  type="button"
                  onClick={() => beginStatusChange("active")}
                  className="rounded-xl bg-emerald-700 px-4 py-2 font-semibold text-white"
                >
                  Prévisualiser la réactivation
                </button>
              )}
              {selected.status === "active" && (
                <button
                  type="button"
                  onClick={() => beginStatusChange("suspended")}
                  className="rounded-xl bg-amber-600 px-4 py-2 font-semibold text-white"
                >
                  Prévisualiser la suspension
                </button>
              )}
              {selected.status !== "disabled" && (
                <button
                  type="button"
                  onClick={() => beginStatusChange("disabled")}
                  className="rounded-xl bg-red-700 px-4 py-2 font-semibold text-white"
                >
                  Prévisualiser la désactivation
                </button>
              )}
            </div>
          </form>
        </AdminPanel>
      )}

      {preview && (
        <AdminPanel
          title="Confirmation du changement"
          description={`Cette prévisualisation expire le ${formatDate(preview.expires_at)}.`}
        >
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Avant</p>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(preview.before_state, null, 2)}
              </pre>
            </div>
            <div className="rounded-xl bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase text-rose-700">Après</p>
              <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs">
                {JSON.stringify(preview.proposed_state, null, 2)}
              </pre>
            </div>
          </div>
          <label className="mt-4 block text-sm font-semibold">
            Justification obligatoire
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={4000}
              rows={3}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />
          </label>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy || reason.trim().length < 10}
              className="flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            >
              <ShieldCheck size={17} />
              Confirmer explicitement
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setExecutionOperationId(null);
                setReason("");
              }}
              className="rounded-xl border px-4 py-2 font-semibold"
            >
              Annuler
            </button>
          </div>
        </AdminPanel>
      )}
    </div>
  );
}
