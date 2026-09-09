import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Flag,
  MessageSquareReply,
  RotateCcw,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  AdminPanel,
  DefinitionList,
  ErrorPanel,
  LoadingPanel,
  StateBadge,
  formatDate,
  shortId,
} from "./AdminDataUi";
import AdminModalShell from "./AdminModalShell";
import { useAdminAuth } from "./AdminAuthContext";
import {
  getAdminReportedReviewDetail,
  moderateAdminReview,
} from "./adminOperationsApi";
import { adminLabel, humanizeAdminError } from "./adminPresentation";

const REPORT_REASON_LABELS = {
  abusive_or_hateful: "Contenu abusif ou haineux",
  personal_or_sensitive_info: "Informations personnelles ou sensibles",
  spam_or_commercial: "Spam ou contenu commercial",
  off_topic_or_misleading: "Hors sujet ou trompeur",
  other: "Autre",
};

const ACTIONS = {
  keep: {
    targetStatus: "published",
    label: "Conserver publié",
    title: "Conserver l’avis publié",
    description:
      "L’avis restera visible publiquement et tous ses signalements ouverts seront résolus.",
    buttonClass: "bg-emerald-700 hover:bg-emerald-800",
    Icon: CheckCircle2,
  },
  hide: {
    targetStatus: "hidden",
    label: "Masquer",
    title: "Masquer temporairement l’avis",
    description:
      "L’avis et sa réponse disparaîtront de la projection publique. Une republication restera possible.",
    buttonClass: "bg-amber-600 hover:bg-amber-700",
    Icon: EyeOff,
  },
  restore: {
    targetStatus: "published",
    label: "Republier",
    title: "Republier l’avis",
    description:
      "L’avis et sa réponse redeviendront visibles dans le profil et les agrégats publics.",
    buttonClass: "bg-emerald-700 hover:bg-emerald-800",
    Icon: RotateCcw,
  },
  remove: {
    targetStatus: "removed",
    label: "Retirer",
    title: "Retirer définitivement l’avis",
    description:
      "Cette transition est terminale dans le workflow normal. L’avis et sa réponse ne pourront plus être restaurés depuis ce back-office.",
    buttonClass: "bg-red-700 hover:bg-red-800",
    Icon: Trash2,
  },
};

function moderationEventLabel(event) {
  if (event.event_type === "hidden") return "Avis masqué";
  if (event.event_type === "removed") return "Avis retiré";
  if (
    event.event_type === "published" &&
    event.metadata?.previous_status === "hidden"
  ) {
    return "Avis republié";
  }
  if (event.event_type === "published") return "Avis publié";
  return adminLabel(event.event_type);
}

function availableActions(status, hasOpenReports) {
  if (status === "published") {
    return [...(hasOpenReports ? [ACTIONS.keep] : []), ACTIONS.hide, ACTIONS.remove];
  }
  if (status === "hidden") return [ACTIONS.restore, ACTIONS.remove];
  return [];
}

function ModerationDialog({ action, reviewId, onClose, onSuccess }) {
  const reasonRef = useRef(null);
  const operationRef = useRef(null);
  const payloadRef = useRef(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const trimmedReason = reason.trim();
  const tooLong = trimmedReason.length > 4000;

  const changeReason = (event) => {
    const nextReason = event.target.value;
    setReason(nextReason);
    if (payloadRef.current !== `${action.targetStatus}\u0000${nextReason.trim()}`) {
      operationRef.current = null;
      payloadRef.current = null;
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!trimmedReason || tooLong) return;
    const fingerprint = `${action.targetStatus}\u0000${trimmedReason}`;
    if (!operationRef.current || payloadRef.current !== fingerprint) {
      operationRef.current = crypto.randomUUID();
      payloadRef.current = fingerprint;
    }
    setBusy(true);
    setError(null);
    try {
      await moderateAdminReview(
        operationRef.current,
        reviewId,
        action.targetStatus,
        trimmedReason
      );
      await onSuccess(action);
    } catch (submitError) {
      setError(humanizeAdminError(submitError));
    } finally {
      setBusy(false);
    }
  };

  const ActionIcon = action.Icon;
  return (
    <AdminModalShell
      title={action.title}
      description={action.description}
      busy={busy}
      initialFocusRef={reasonRef}
      onClose={onClose}
    >
      {action.targetStatus === "removed" && (
        <div className="mb-4 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={18} /> Retrait définitif
          </p>
          <p className="mt-1">
            Vérifiez l’avis, les signalements et l’historique avant de confirmer.
          </p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <label htmlFor="moderation-reason" className="block text-sm font-semibold text-slate-900">
          Motif obligatoire
        </label>
        <textarea
          ref={reasonRef}
          id="moderation-reason"
          required
          rows={6}
          maxLength={4000}
          value={reason}
          onChange={changeReason}
          aria-describedby="moderation-reason-help moderation-reason-count"
          aria-invalid={tooLong}
          className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
          placeholder="Expliquez la décision de manière factuelle…"
        />
        <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
          <span id="moderation-reason-help">
            Ce motif sera conservé dans l’historique et l’audit administrateur.
          </span>
          <span id="moderation-reason-count" aria-live="polite">
            {reason.length} / 4 000 caractères
          </span>
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy || !trimmedReason || tooLong}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white disabled:opacity-50 ${action.buttonClass}`}
          >
            <ActionIcon size={17} /> {busy ? "Enregistrement…" : action.title}
          </button>
        </div>
      </form>
    </AdminModalShell>
  );
}

export default function AdminReputationDetailPage() {
  const { reviewId } = useParams();
  const [searchParams] = useSearchParams();
  const { hasPermission } = useAdminAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [action, setAction] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getAdminReportedReviewDetail(reviewId));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => {
    load();
  }, [load]);

  const reports = useMemo(() => data?.reports || [], [data]);
  const hasOpenReports = reports.some((report) => report.status === "open");
  const backQuery = new URLSearchParams({
    view: searchParams.get("view") === "history" ? "history" : "open",
    ...(searchParams.get("page") ? { page: searchParams.get("page") } : {}),
  });

  const finishModeration = async (completedAction) => {
    setAction(null);
    setSuccess(`${completedAction.title} : la décision a été enregistrée et auditée.`);
    await load();
    window.dispatchEvent(new CustomEvent("admin:reputation-updated"));
  };

  if (loading && !data) return <LoadingPanel label="Chargement du dossier de réputation…" />;
  if (error && !data) return <ErrorPanel error={error} retry={load} />;

  const review = data.review;
  const history = data.status_history || [];
  const actions = availableActions(review.status, hasOpenReports);

  return (
    <div className="space-y-6">
      <Link
        to={`/reputation?${backQuery}`}
        className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-rose-700"
      >
        <ArrowLeft size={16} /> Retour à la file Réputation
      </Link>

      <header className="rounded-2xl bg-slate-950 p-6 text-white">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-400">
          Dossier de modération
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">Avis {review.rating}/5</h1>
          <StateBadge value={review.status} />
        </div>
        <p className="mt-3 text-sm text-slate-300">
          {reports.filter((report) => report.status === "open").length} signalement(s) ouvert(s) sur {reports.length}
        </p>
      </header>

      {error && <ErrorPanel error={error} retry={load} />}
      {success && (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900">
          {success}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel title="Avis signalé">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-lg font-bold text-amber-600" aria-label={`${review.rating} sur 5`}>
              {review.rating}/5 ★
            </span>
            <time className="text-sm text-slate-500">{formatDate(review.created_at)}</time>
          </div>
          <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-slate-900">
            {review.comment || "Avis sans commentaire"}
          </p>
          {data.reply && (
            <div className="mt-5 rounded-xl border-l-4 border-rose-300 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <MessageSquareReply size={17} /> Réponse du professionnel
              </p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-800">
                {data.reply.content}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Publiée le {formatDate(data.reply.published_at)}
              </p>
            </div>
          )}
        </AdminPanel>

        <AdminPanel title="Parties et contexte Glossed" description="Contexte métier uniquement, sans donnée financière.">
          <DefinitionList
            items={[
              {
                label: "Auteur de l’avis",
                value: `${data.author.username || "Utilisateur"} (${data.author.email || "email non disponible"})`,
              },
              {
                label: "Professionnel évalué",
                value: `${data.provider.business_name || data.provider.username || "Professionnel"} (${data.provider.email || "email non disponible"})`,
              },
              { label: "Service", value: data.service_context?.service },
              { label: "Date de prestation", value: data.service_context?.date },
              { label: "État de mission", value: adminLabel(data.service_context?.mission_status) },
              {
                label: "Issue de réalisation",
                value: adminLabel(data.service_context?.delivery_outcome),
              },
            ]}
          />
          <details className="mt-5 rounded-xl border border-slate-200 p-4 text-sm">
            <summary className="cursor-pointer font-semibold">Identifiants techniques</summary>
            <dl className="mt-3 space-y-2 font-mono text-xs text-slate-600">
              <div><dt className="inline font-semibold">Avis : </dt><dd className="inline">{review.id}</dd></div>
              <div><dt className="inline font-semibold">Mission : </dt><dd className="inline">{data.service_context?.mission_id}</dd></div>
            </dl>
          </details>
        </AdminPanel>
      </div>

      <AdminPanel title="Signalements privés" description="Ces informations ne sont visibles que dans l’administration Glossed.">
        <div className="space-y-4">
          {reports.map((report) => (
            <article key={report.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 font-bold text-slate-900">
                    <Flag size={16} className="text-rose-600" />
                    {REPORT_REASON_LABELS[report.reason_code] || adminLabel(report.reason_code)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Par {report.reporter_username || report.reporter_email || shortId(report.reporter_id)} · {formatDate(report.created_at)}
                  </p>
                </div>
                <StateBadge value={report.status} />
              </div>
              {report.explanation && (
                <p className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-800">
                  {report.explanation}
                </p>
              )}
              {report.resolved_at && (
                <p className="mt-2 text-xs text-slate-500">
                  Traité le {formatDate(report.resolved_at)} par {shortId(report.resolved_by)}
                </p>
              )}
            </article>
          ))}
        </div>
      </AdminPanel>

      <AdminPanel title="Historique de modération" description="Chronologie fournie par le journal append-only de réputation.">
        {history.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun événement enregistré.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((event) => (
              <li key={event.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      <Eye size={16} /> {moderationEventLabel(event)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {adminLabel(event.actor_type)}
                      {event.actor_user_id ? ` · ${shortId(event.actor_user_id)}` : ""}
                    </p>
                  </div>
                  <time className="text-xs text-slate-500">{formatDate(event.created_at)}</time>
                </div>
                {event.reason && (
                  <p className="mt-3 whitespace-pre-wrap break-words text-slate-800">
                    <strong>Motif :</strong> {event.reason}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </AdminPanel>

      <AdminPanel title="Décision de modération" description="Les transitions, l’idempotence et l’audit restent imposés par le serveur.">
        {!hasPermission("reputation.moderate") ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <ShieldAlert size={18} className="mb-2" />
            Votre accès est en lecture seule. La permission de modération est requise pour prendre une décision.
          </div>
        ) : review.status === "removed" ? (
          <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
            Avis retiré : aucune restauration n’est autorisée par le workflow normal.
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {actions.map((availableAction) => {
              const ActionIcon = availableAction.Icon;
              return (
                <button
                  key={availableAction.label}
                  type="button"
                  onClick={() => {
                    setSuccess(null);
                    setAction(availableAction);
                  }}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-white ${availableAction.buttonClass}`}
                >
                  <ActionIcon size={17} /> {availableAction.label}
                </button>
              );
            })}
          </div>
        )}
      </AdminPanel>

      {action && (
        <ModerationDialog
          action={action}
          reviewId={reviewId}
          onClose={() => setAction(null)}
          onSuccess={finishModeration}
        />
      )}
    </div>
  );
}
