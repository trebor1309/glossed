import { useRef, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import ReputationModalShell from "./ReputationModalShell";

export const MAX_REPORT_EXPLANATION_LENGTH = 1000;

export const REVIEW_REPORT_REASONS = [
  { code: "abusive_or_hateful", label: "Contenu abusif ou haineux" },
  { code: "personal_or_sensitive_info", label: "Informations personnelles ou sensibles" },
  { code: "spam_or_commercial", label: "Spam ou contenu commercial" },
  { code: "off_topic_or_misleading", label: "Hors sujet ou trompeur" },
  { code: "other", label: "Autre" },
];

function isAlreadyReported(error) {
  return String(error?.message || "")
    .toLowerCase()
    .includes("already reported");
}

function humanReportError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("only a published review") || message.includes("review not found")) {
    return "Cet avis n’est plus disponible publiquement.";
  }
  if (message.includes("authentication required")) {
    return "Vous devez être connecté pour signaler un avis.";
  }
  return "Le signalement n’a pas pu être envoyé. Réessayez dans quelques instants.";
}

export default function ReviewReportModal({ review, onClose, onSuccess }) {
  const [reason, setReason] = useState("");
  const [explanation, setExplanation] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const operationIdRef = useRef(uuid());
  const submittingRef = useRef(false);
  const reasonRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current) return;

    const normalizedExplanation = explanation.trim();
    const nextErrors = {};
    if (!REVIEW_REPORT_REASONS.some((item) => item.code === reason)) {
      nextErrors.reason = "Choisissez un motif.";
    }
    if (reason === "other" && !normalizedExplanation) {
      nextErrors.explanation = "Ajoutez une explication lorsque vous choisissez « Autre ».";
    } else if (normalizedExplanation.length > MAX_REPORT_EXPLANATION_LENGTH) {
      nextErrors.explanation = `L’explication ne peut pas dépasser ${MAX_REPORT_EXPLANATION_LENGTH.toLocaleString("fr-FR")} caractères.`;
    }
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const { data, error: reportError } = await supabase.rpc("report_review_v1", {
        p_operation_id: operationIdRef.current,
        p_review_id: review.id,
        p_reason_code: reason,
        p_explanation: normalizedExplanation || null,
      });
      if (reportError) throw reportError;
      onSuccess({ alreadyReported: Boolean(data?.[0]?.idempotent) });
    } catch (reportError) {
      if (isAlreadyReported(reportError)) {
        onSuccess({ alreadyReported: true });
      } else {
        console.error("Unable to report review:", reportError);
        setErrors({ form: humanReportError(reportError) });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const explanationError = errors.explanation;

  return (
    <ReputationModalShell
      title="Signaler cet avis"
      description="Le signalement est privé. Il ne masque pas automatiquement l’avis et sera examiné par Glossed."
      busy={submitting}
      initialFocusRef={reasonRef}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <div>
          <label htmlFor="review-report-reason" className="text-sm font-semibold text-gray-800">
            Motif du signalement
          </label>
          <select
            ref={reasonRef}
            id="review-report-reason"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value);
              setErrors((current) => ({ ...current, reason: "", explanation: "", form: "" }));
            }}
            disabled={submitting}
            required
            aria-invalid={Boolean(errors.reason)}
            aria-describedby={errors.reason ? "review-report-reason-error" : undefined}
            className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
          >
            <option value="">Choisir un motif</option>
            {REVIEW_REPORT_REASONS.map((item) => (
              <option key={item.code} value={item.code}>
                {item.label}
              </option>
            ))}
          </select>
          {errors.reason && (
            <p id="review-report-reason-error" className="mt-1 text-sm text-red-700">
              {errors.reason}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="review-report-explanation"
            className="text-sm font-semibold text-gray-800"
          >
            Explication{" "}
            <span className="font-normal text-gray-500">
              {reason === "other" ? "(obligatoire)" : "(facultative)"}
            </span>
          </label>
          <textarea
            id="review-report-explanation"
            value={explanation}
            onChange={(event) => {
              setExplanation(event.target.value);
              setErrors((current) => ({ ...current, explanation: "", form: "" }));
            }}
            maxLength={MAX_REPORT_EXPLANATION_LENGTH}
            rows={5}
            disabled={submitting}
            aria-invalid={Boolean(explanationError)}
            aria-describedby={`review-report-counter${explanationError ? " review-report-explanation-error" : ""}`}
            className="mt-2 w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
          />
          <p
            id="review-report-counter"
            className="mt-1 text-right text-xs text-gray-500"
            aria-live="polite"
          >
            {explanation.length.toLocaleString("fr-FR")} /{" "}
            {MAX_REPORT_EXPLANATION_LENGTH.toLocaleString("fr-FR")} caractères
          </p>
          {explanationError && (
            <p id="review-report-explanation-error" className="mt-1 text-sm text-red-700">
              {explanationError}
            </p>
          )}
        </div>

        {errors.form && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.form}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-gray-800 px-5 py-2 text-sm font-semibold text-white transition hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <Flag size={16} aria-hidden="true" />
            )}
            {submitting ? "Envoi…" : "Envoyer le signalement"}
          </button>
        </div>
      </form>
    </ReputationModalShell>
  );
}
