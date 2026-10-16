import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleCheckBig,
  CircleHelp,
  Loader2,
  MailWarning,
  MapPinned,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate, shortId } from "./AdminDataUi";
import { listAdminOperationalHealth, updateAdminOperationalEvent } from "./adminOperationsApi";

const eventTypes = [
  ["all", "Tous les signaux"],
  ["frontend_render_failure", "Erreur d’affichage React"],
  ["runtime_error", "Erreur JavaScript"],
  ["unhandled_rejection", "Opération asynchrone en échec"],
  ["maps_auth_failure", "Clé Google Maps refusée"],
  ["maps_load_failure", "Chargement Google Maps"],
  ["maps_widget_failure", "Suggestion d’adresse"],
];

const eventLabel = (value) => eventTypes.find(([key]) => key === value)?.[1] || value;

function Metric({ icon: Icon, label, value, tone = "text-slate-700" }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex items-center gap-2 ${tone}`}>
        <Icon size={19} />
        <p className="text-sm font-semibold">{label}</p>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-950">{value}</p>
      <p className="mt-1 text-xs text-slate-500">sur les dernières 24 heures</p>
    </div>
  );
}

export default function AdminOperationalHealthPage() {
  const { hasPermission } = useAdminAuth();
  const [filters, setFilters] = useState({ status: "open", eventType: "all" });
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
      setData(await listAdminOperationalHealth(filters));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const metrics = useMemo(() => {
    const counts = data?.last_24_hours?.by_type || {};
    return {
      all: data?.last_24_hours?.client_event_count || 0,
      maps:
        (counts.maps_auth_failure || 0) +
        (counts.maps_load_failure || 0) +
        (counts.maps_widget_failure || 0),
      frontend:
        (counts.frontend_render_failure || 0) +
        (counts.runtime_error || 0) +
        (counts.unhandled_rejection || 0),
      contact: data?.last_24_hours?.contact_delivery_failures || 0,
    };
  }, [data]);

  const update = async (event) => {
    const nextStatus = event.status === "open" ? "resolved" : "open";
    if (nextStatus === "resolved" && note.trim().length < 10) {
      setError(new Error("Ajoutez une note de résolution d’au moins 10 caractères."));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateAdminOperationalEvent(event.id, nextStatus, note.trim(), crypto.randomUUID());
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
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <Activity className="text-rose-600" /> Santé technique
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Signaux clients assainis, erreurs Google Maps et échecs récents du routage support.
              Aucun message d’exception, contenu de formulaire ou paramètre d’URL n’est collecté.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualiser
          </button>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          icon={TriangleAlert}
          label="Signaux clients"
          value={metrics.all}
          tone="text-amber-700"
        />
        <Metric icon={MapPinned} label="Google Maps" value={metrics.maps} tone="text-sky-700" />
        <Metric icon={Activity} label="Interface" value={metrics.frontend} tone="text-rose-700" />
        <Metric
          icon={MailWarning}
          label="Emails support en échec"
          value={metrics.contact}
          tone="text-violet-700"
        />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-bold">Contrôles externes avant bêta</h2>
        <p className="mt-1 text-sm text-slate-500">
          Ces contrôles dépendent des consoles fournisseur et ne sont volontairement pas marqués
          comme validés par l’application.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
            <CircleCheckBig className="mt-0.5 shrink-0" size={17} /> Collecte technique minimale et
            file de traitement admin actives.
          </p>
          {[
            "SMTP Auth Glossed et suivi de délivrabilité",
            "Boîte support@glossed.app avec test de réponse",
            "Sauvegarde Supabase et restauration testée",
            "Alertes quota, erreurs et budget Google Maps",
          ].map((label) => (
            <p
              key={label}
              className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
            >
              <CircleHelp className="mt-0.5 shrink-0" size={17} /> {label} : à confirmer dans la
              console concernée.
            </p>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">
            État
            <select
              value={filters.status}
              onChange={(e) => setFilters((current) => ({ ...current, status: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
            >
              <option value="open">À traiter</option>
              <option value="resolved">Résolus</option>
              <option value="all">Tous</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Type
            <select
              value={filters.eventType}
              onChange={(e) => setFilters((current) => ({ ...current, eventType: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2"
            >
              {eventTypes.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && <ErrorPanel error={error} retry={() => setError(null)} />}
      {loading ? (
        <LoadingPanel />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">
            {data?.total || 0} événement{data?.total === 1 ? "" : "s"}
          </div>
          {!data?.items?.length ? (
            <p className="p-10 text-center text-sm text-slate-500">Aucun signal dans cette file.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((event) => (
                <article key={event.id} className="space-y-3 p-5">
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-start">
                    <div className="min-w-0">
                      <p className="font-semibold">{eventLabel(event.event_type)}</p>
                      <p className="mt-1 font-mono text-xs text-slate-500">
                        {event.event_code} · {shortId(event.id)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500">Page</p>
                      <p className="break-all text-sm font-semibold">{event.source_path}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(event.created_at)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <StateBadge value={event.status} />
                      <StateBadge value={event.severity} />
                    </div>
                    {hasPermission("operations_health.manage") && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(event.id);
                          setNote(event.resolution_note || "");
                          setError(null);
                        }}
                        className="rounded-xl border border-rose-300 px-3 py-2 text-sm font-semibold text-rose-700"
                      >
                        {event.status === "open" ? "Résoudre" : "Rouvrir"}
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    {event.app_release && <span>Version {event.app_release}</span>}
                    {event.client_context?.locale && (
                      <span>Langue {event.client_context.locale}</span>
                    )}
                    {event.client_context?.viewport && (
                      <span>Écran {event.client_context.viewport}</span>
                    )}
                    {typeof event.client_context?.online === "boolean" && (
                      <span>{event.client_context.online ? "En ligne" : "Hors ligne"}</span>
                    )}
                  </div>
                  {event.resolution_note && (
                    <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                      <strong>Résolution :</strong> {event.resolution_note}
                    </p>
                  )}
                  {editing === event.id && (
                    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-end">
                      {event.status === "open" && (
                        <label className="min-w-0 flex-1 text-sm font-semibold">
                          Note de résolution
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            rows={2}
                            maxLength={2000}
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
                          onClick={() => update(event)}
                          disabled={busy}
                          className="inline-flex items-center gap-2 rounded-lg bg-rose-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          {busy && <Loader2 className="animate-spin" size={15} />}
                          Confirmer
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
