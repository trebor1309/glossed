import { useCallback, useEffect, useState } from "react";
import { Inbox, Loader2, MailCheck, RefreshCw, Search } from "lucide-react";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { useAdminAuth } from "./AdminAuthContext";
import { listAdminContactRequests, updateAdminContactRequest } from "./adminOperationsApi";

const categories = [
  ["all", "Toutes les catégories"],
  ["general", "Question générale"],
  ["booking", "Réservation / paiement"],
  ["account", "Compte"],
  ["professional", "Professionnel"],
  ["safety", "Sécurité / signalement"],
  ["privacy", "Confidentialité"],
  ["partnership", "Partenariat"],
  ["press", "Presse"],
];

export default function AdminSupportRequestsPage() {
  const { hasPermission } = useAdminAuth();
  const [filters, setFilters] = useState({ caseStatus: "open", category: "all", query: "" });
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await listAdminContactRequests({
          caseStatus: filters.caseStatus,
          category: filters.category,
          query: submittedQuery,
        })
      );
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [filters.caseStatus, filters.category, submittedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const update = async (request) => {
    const nextStatus = request.case_status === "open" ? "closed" : "open";
    if (nextStatus === "closed" && note.trim().length < 10) {
      setError(new Error("Ajoutez une note de résolution d’au moins 10 caractères."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminContactRequest(request.id, nextStatus, note.trim(), crypto.randomUUID());
      setEditing(null);
      setNote("");
      await load();
    } catch (updateError) {
      setError(updateError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Inbox className="text-rose-600" /> Demandes de support
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Messages reçus depuis le formulaire public, statut d’envoi Resend et suivi de résolution.
          Les réponses restent envoyées par email.
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
              maxLength={200}
              placeholder="Email, nom, sujet ou référence"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-3 text-sm"
            />
          </label>
          <select
            value={filters.caseStatus}
            onChange={(event) =>
              setFilters((current) => ({ ...current, caseStatus: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            <option value="open">À traiter</option>
            <option value="closed">Traitées</option>
            <option value="all">Toutes</option>
          </select>
          <select
            value={filters.category}
            onChange={(event) =>
              setFilters((current) => ({ ...current, category: event.target.value }))
            }
            className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"
          >
            {categories.map(([value, label]) => (
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

      {error && <ErrorPanel error={error} retry={() => setError(null)} />}
      {loading ? (
        <LoadingPanel />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">
            {data?.total || 0} message{data?.total === 1 ? "" : "s"}
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
                      <p className="font-semibold">{request.name}</p>
                      <a
                        href={`mailto:${request.email}`}
                        className="truncate text-sm text-rose-700"
                      >
                        {request.email}
                      </a>
                      <p className="mt-1 font-mono text-xs text-slate-400">{shortId(request.id)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Catégorie</p>
                      <p className="text-sm font-semibold">
                        {categories.find(([value]) => value === request.category)?.[1] ||
                          request.category}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Reçu {formatDate(request.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2">
                      <StateBadge value={request.case_status} />
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <MailCheck size={13} />{" "}
                        {request.delivery_status === "email_sent"
                          ? "Email transmis"
                          : request.delivery_status}
                      </span>
                    </div>
                    {hasPermission("support_requests.manage") && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(request.id);
                          setNote(request.resolution_note || "");
                          setError(null);
                        }}
                        className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700"
                      >
                        {request.case_status === "open" ? "Clôturer" : "Rouvrir"}
                      </button>
                    )}
                  </div>
                  {request.subject && (
                    <p className="font-semibold text-slate-800">{request.subject}</p>
                  )}
                  <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                    {request.message}
                  </p>
                  {request.delivery_error && (
                    <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                      Échec d’envoi : {request.delivery_error}
                    </p>
                  )}
                  {request.resolution_note && (
                    <p className="text-sm text-slate-600">
                      <strong>Résolution :</strong> {request.resolution_note}
                    </p>
                  )}
                  {editing === request.id && (
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-end">
                      {request.case_status === "open" && (
                        <label className="min-w-0 flex-1 text-sm font-semibold">
                          Note de résolution
                          <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={2}
                            maxLength={4000}
                            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
                          />
                        </label>
                      )}
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
                          onClick={() => update(request)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy && <Loader2 className="animate-spin" size={15} />}
                          {request.case_status === "open"
                            ? "Confirmer la clôture"
                            : "Confirmer la réouverture"}
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
