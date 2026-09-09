import { useRef, useState } from "react";
import { Loader2, MessageSquareReply } from "lucide-react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import ReputationModalShell from "./ReputationModalShell";

export const MAX_REPLY_LENGTH = 2000;

function humanReplyError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("already has a provider reply")) {
    return "Une réponse existe déjà pour cet avis. Actualisez la page pour la consulter.";
  }
  if (message.includes("only the reviewed professional")) {
    return "Seul le professionnel concerné peut répondre à cet avis.";
  }
  if (message.includes("only a published review")) {
    return "Cet avis n’est plus disponible publiquement.";
  }
  return "La réponse n’a pas pu être publiée. Réessayez dans quelques instants.";
}

export default function ReviewReplyModal({ review, onClose, onSuccess }) {
  const [content, setContent] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const operationIdRef = useRef(uuid());
  const submittingRef = useRef(false);
  const textareaRef = useRef(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    const normalizedContent = content.trim();
    if (submittingRef.current) return;
    if (!normalizedContent) {
      setError("La réponse est obligatoire.");
      textareaRef.current?.focus();
      return;
    }
    if (normalizedContent.length > MAX_REPLY_LENGTH) {
      setError(
        `La réponse ne peut pas dépasser ${MAX_REPLY_LENGTH.toLocaleString("fr-FR")} caractères.`
      );
      textareaRef.current?.focus();
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setError("");
    try {
      const { data, error: replyError } = await supabase.rpc("submit_review_reply_v1", {
        p_operation_id: operationIdRef.current,
        p_review_id: review.id,
        p_content: normalizedContent,
      });
      if (replyError) throw replyError;

      const result = data?.[0];
      onSuccess({
        content: result?.content || normalizedContent,
        created_at: result?.created_at || new Date().toISOString(),
      });
    } catch (replyError) {
      console.error("Unable to submit review reply:", replyError);
      setError(humanReplyError(replyError));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <ReputationModalShell
      title="Répondre à l’avis"
      description="Votre réponse sera publique et ne pourra pas être modifiée après sa publication."
      busy={submitting}
      initialFocusRef={textareaRef}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="review-reply-content" className="text-sm font-semibold text-gray-800">
          Votre réponse
        </label>
        <textarea
          ref={textareaRef}
          id="review-reply-content"
          value={content}
          onChange={(event) => {
            setContent(event.target.value);
            if (error) setError("");
          }}
          maxLength={MAX_REPLY_LENGTH}
          rows={6}
          disabled={submitting}
          required
          aria-invalid={Boolean(error)}
          aria-describedby={`review-reply-counter${error ? " review-reply-error" : ""}`}
          className="mt-2 w-full resize-y rounded-xl border border-gray-300 px-3 py-2 text-sm leading-6 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
        />
        <p
          id="review-reply-counter"
          className="mt-1 text-right text-xs text-gray-500"
          aria-live="polite"
        >
          {content.length.toLocaleString("fr-FR")} / {MAX_REPLY_LENGTH.toLocaleString("fr-FR")}{" "}
          caractères
        </p>

        {error && (
          <p
            id="review-reply-error"
            role="alert"
            className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
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
            disabled={submitting || !content.trim()}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 size={17} className="animate-spin" aria-hidden="true" />
            ) : (
              <MessageSquareReply size={17} aria-hidden="true" />
            )}
            {submitting ? "Publication…" : "Publier la réponse"}
          </button>
        </div>
      </form>
    </ReputationModalShell>
  );
}
