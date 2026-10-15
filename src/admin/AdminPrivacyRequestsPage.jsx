import { useCallback, useEffect, useState } from "react";
import { Clock3, FileLock2, Loader2, RefreshCw, Search } from "lucide-react";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import AdminMfaReauthentication from "./AdminMfaReauthentication";
import { useAdminAuth } from "./AdminAuthContext";
import { listAdminDataSubjectRequests, updateAdminDataSubjectRequest } from "./adminOperationsApi";
import { humanizeAdminError, isRecentMfaError } from "./adminPresentation";

const typeLabels = {
  access: "Accès",
  rectification: "Rectification",
  erasure: "Effacement / fermeture",
  restriction: "Limitation",
  objection: "Opposition",
  portability: "Portabilité",
  other: "Autre demande",
};

const nextStatuses = [
  ["identity_check", "Contrôle d’identité"],
  ["in_progress", "En cours"],
  ["completed", "Terminée"],
  ["refused", "Refusée"],
  ["cancelled", "Annulée"],
];

function subjectName(request) {
  return (
    [request.first_name, request.last_name].filter(Boolean).join(" ") ||
    request.business_name ||
    request.username ||
    request.subject_email
  );
}

export default function AdminPrivacyRequestsPage() {
  const { hasPermission } = useAdminAuth();
  const [filters, setFilters] = useState({ status: "open", requestType: "all", query: "" });
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [targetStatus, setTargetStatus] = useState("in_progress");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await listAdminDataSubjectRequests({
          status: filters.status,
          requestType: filters.requestType,
          query: submittedQuery,
        })
      );
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [filters.requestType, filters.status, submittedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const startUpdate = (request) => {
    setEditing(request.id);
    setTargetStatus(request.status === "received" ? "identity_check" : "in_progress");
    setNote("");
    setNeedsMfa(false);
    setError(null);
  };

  const submitUpdate = async () => {
    if (!editing || busy) return;
    if (["completed", "refused", "cancelled"].includes(targetStatus) && note.trim().length < 10) {
      setError(
        new Error(
          "Un motif détaillé d’au moins 10 caractères est requis pour clôturer une demande."
        )
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminDataSubjectRequest(editing, targetStatus, note.trim(), crypto.randomUUID());
      setEditing(null);
      setNote("");
      setNeedsMfa(false);
      await load();
    } catch (updateError) {
      if (isRecentMfaError(updateError)) setNeedsMfa(true);
      setError(updateError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileLock2 className="text-rose-600" /> Demandes de droits RGPD
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          File opérationnelle des demandes authentifiées. Une clôture documente la réponse ; elle ne
          supprime jamais automatiquement les preuves légales, comptables ou d’audit.
        </p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setSubmittedQuery(filters.query.trim());
          }}
          className="mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
        >
          <label className="relative min-w-0">
            <span className="sr-only">Rechercher</span>
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              value={filters.query}
              onChange={(event) =>
                setFilters((current) => ({ ...current, query: event.target.value }))
              }
              placeholder="Email, nom, pseudo ou référence"
              maxLength={200}
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={filters.status}
            onChange={(event) =>
              setFilters((current) => ({ ...current, status: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="open">À traiter</option>
            <option value="history">Historique</option>
            <option value="all">Toutes</option>
          </select>
          <select
            value={filters.requestType}
            onChange={(event) =>
              setFilters((current) => ({ ...current, requestType: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="all">Tous les droits</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              Rechercher
            </button>
            <button
              type="button"
              onClick={load}
              aria-label="Actualiser"
              className="rounded-xl border border-slate-300 px-3"
            >
              <RefreshCw size={17} />
            </button>
          </div>
        </form>
      </header>

      {error && <ErrorPanel error={humanizeAdminError(error)} retry={() => setError(null)} />}
      {needsMfa && (
        <AdminMfaReauthentication
          required
          onVerified={() => {
            setNeedsMfa(false);
            setError(null);
          }}
        />
      )}

      {loading ? (
        <LoadingPanel />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">
            {data?.total || 0} demande{data?.total === 1 ? "" : "s"}
          </div>
          {!data?.items?.length ? (
            <p className="p-10 text-center text-sm text-slate-500">
              Aucune demande dans cette file.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((request) => (
                <article key={request.id} className="space-y-4 p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-start">
                    <div className="min-w-0">
                      <p className="font-semibold">{subjectName(request)}</p>
                      <p className="truncate text-sm text-slate-500">{request.subject_email}</p>
                      <p className="mt-1 font-mono text-xs text-slate-400">{shortId(request.id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Droit exercé</p>
                      <p className="text-sm font-semibold">{typeLabels[request.request_type]}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reçue {formatDate(request.received_at)}
                      </p>
                    </div>
                    <div>
                      <StateBadge value={request.status} />
                      <p
                        className={`mt-2 flex items-center gap-1 text-xs ${request.overdue ? "font-semibold text-red-700" : "text-slate-500"}`}
                      >
                        <Clock3 size={13} /> Échéance {formatDate(request.due_at)}
                      </p>
                    </div>
                    {hasPermission("privacy.manage") &&
                      !["completed", "refused", "cancelled"].includes(request.status) && (
                        <button
                          type="button"
                          onClick={() => startUpdate(request)}
                          className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700"
                        >
                          Traiter
                        </button>
                      )}
                  </div>
                  {request.details && (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      {request.details}
                    </p>
                  )}
                  {editing === request.id && (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
                      <label className="text-sm font-semibold">
                        Nouvel état
                        <select
                          value={targetStatus}
                          onChange={(event) => setTargetStatus(event.target.value)}
                          className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal"
                        >
                          {nextStatuses.map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="text-sm font-semibold">
                        Note opérationnelle
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          rows={2}
                          maxLength={4000}
                          className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                          placeholder="Décision, vérifications et références utiles"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditing(null)}
                          disabled={busy}
                          className="rounded-lg border px-3 py-2 text-sm font-semibold"
                        >
                          Annuler
                        </button>
                        <button
                          type="button"
                          onClick={submitUpdate}
                          disabled={busy || needsMfa}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy && <Loader2 className="animate-spin" size={15} />} Enregistrer
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
