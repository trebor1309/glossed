import { motion } from "framer-motion";
import { Loader2, Star, X } from "lucide-react";
import { useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";

const MAX_COMMENT_LENGTH = 2000;

export default function ProEvaluationModal({ booking, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const operationIdRef = useRef(uuid());
  const submittingRef = useRef(false);

  if (!booking) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submittingRef.current || rating < 1 || rating > 5) return;

    submittingRef.current = true;
    setSubmitting(true);
    setError("");

    try {
      const { data, error: submitError } = await supabase.rpc("submit_review_v1", {
        p_operation_id: operationIdRef.current,
        p_mission_id: booking.id,
        p_rating: rating,
        p_comment: comment,
      });

      if (submitError) throw submitError;

      await onSuccess?.(data?.[0] || null);
      onClose();
    } catch (submitError) {
      console.error("Error submitting review:", submitError);
      setError(submitError?.message || "Your review could not be published. Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={submitting ? undefined : onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-dialog-title"
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          aria-label="Close review form"
          className="absolute right-3 top-3 rounded-full p-1 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus:ring-2 focus:ring-rose-300 disabled:opacity-50"
        >
          <X size={22} />
        </button>

        <h2
          id="review-dialog-title"
          className="mb-2 flex items-center gap-2 pr-8 text-xl font-bold text-gray-800"
        >
          <Star size={20} className="text-amber-500" aria-hidden="true" /> Leave a review
        </h2>
        <p className="mb-5 text-sm leading-6 text-gray-600">
          Your review will be published on the professional&apos;s Glossed profile. Published reviews
          cannot be edited in this version.
        </p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <fieldset disabled={submitting}>
            <legend className="text-sm font-semibold text-gray-800">Your rating (required)</legend>
            <div className="mt-2 flex justify-center gap-1" aria-label="Choose a rating from 1 to 5">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onFocus={() => setHover(star)}
                  onBlur={() => setHover(0)}
                  onMouseEnter={() => setHover(star)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                  aria-pressed={rating === star}
                  className="rounded-lg p-1.5 transition hover:scale-105 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2"
                >
                  <Star
                    size={34}
                    aria-hidden="true"
                    className={`transition-colors ${
                      (hover || rating) >= star
                        ? "fill-amber-400 text-amber-400"
                        : "text-gray-300"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="mt-2 min-h-5 text-center text-sm text-gray-600" aria-live="polite">
              {rating ? `${rating} out of 5 stars selected` : "No rating selected"}
            </p>
          </fieldset>

          <label className="block text-sm font-medium text-gray-700">
            Comment <span className="font-normal text-gray-500">(optional)</span>
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              maxLength={MAX_COMMENT_LENGTH}
              rows={5}
              disabled={submitting}
              placeholder="Tell other clients about your experience"
              aria-describedby="review-comment-limit"
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:bg-gray-50"
            />
            <span id="review-comment-limit" className="mt-1 block text-right text-xs text-gray-500">
              {comment.length.toLocaleString()} / {MAX_COMMENT_LENGTH.toLocaleString()}
            </span>
          </label>

          {error && (
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={rating === 0 || submitting}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2 font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-300 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 size={17} className="animate-spin" aria-hidden="true" />}
              {submitting ? "Publishing…" : "Publish review"}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
