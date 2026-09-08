import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import RatingStars from "@/components/reputation/RatingStars";
import { supabase } from "@/lib/supabaseClient";

const PAGE_SIZE = 5;

const publicAuthorName = (review) => review.reviewer_username || "Glossed client";

export default function ProfileReviews({ targetUserId }) {
  const requestSequence = useRef(0);
  const [reviews, setReviews] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const loadPage = useCallback(
    async ({ append = false, before = null } = {}) => {
      if (!targetUserId) return;
      const sequence = ++requestSequence.current;
      append ? setLoadingMore(true) : setLoading(true);
      setError("");

      try {
        const { data, error: reviewsError } = await supabase.rpc("get_public_reviews", {
          p_target_id: targetUserId,
          p_page_size: PAGE_SIZE + 1,
          p_before_created_at: before?.created_at || null,
          p_before_review_id: before?.id || null,
        });
        if (reviewsError) throw reviewsError;
        if (sequence !== requestSequence.current) return;

        const page = data || [];
        const visiblePage = page.slice(0, PAGE_SIZE);
        setReviews((current) => {
          if (!append) return visiblePage;
          const ids = new Set(current.map((review) => review.id));
          return [...current, ...visiblePage.filter((review) => !ids.has(review.id))];
        });
        const lastVisible = visiblePage.at(-1);
        setCursor(lastVisible ? { id: lastVisible.id, created_at: lastVisible.created_at } : before);
        setHasMore(page.length > PAGE_SIZE);
      } catch (reviewsError) {
        if (sequence !== requestSequence.current) return;
        console.error("Unable to load public reviews:", reviewsError);
        setError("Reviews could not be loaded. Please try again.");
      } finally {
        if (sequence === requestSequence.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [targetUserId]
  );

  useEffect(() => {
    setReviews([]);
    setCursor(null);
    setHasMore(false);
    loadPage();
  }, [loadPage]);

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 py-5 text-sm text-gray-500">
        <Loader2 size={17} className="animate-spin" aria-hidden="true" /> Loading reviews…
      </div>
    );
  }

  if (reviews.length === 0 && !error) {
    return <p className="text-sm italic text-gray-500">No reviews yet.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-4">
        {reviews.map((review) => {
          const author = publicAuthorName(review);
          return (
            <article
              key={review.id}
              className="flex min-w-0 gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <img
                src={review.reviewer_profile_photo || "/default-avatar.png"}
                className="h-11 w-11 shrink-0 rounded-full object-cover"
                alt={`${author}'s profile`}
              />

              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                  <p className="break-words font-medium text-gray-900">{author}</p>
                  <time
                    dateTime={review.created_at}
                    className="shrink-0 text-xs text-gray-400"
                  >
                    {new Date(review.created_at).toLocaleDateString()}
                  </time>
                </div>

                <RatingStars value={review.rating} size={15} className="mt-1" />

                {review.comment && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-gray-700">
                    {review.comment}
                  </p>
                )}

                {review.verified_glossed_service && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    <BadgeCheck size={14} aria-hidden="true" /> Service completed through Glossed
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {error && (
        <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => loadPage({ append: true, before: cursor })}
          disabled={loadingMore}
          className="inline-flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-rose-300 hover:text-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-200 disabled:opacity-60"
        >
          {loadingMore && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
          {loadingMore ? "Loading…" : "Show more reviews"}
        </button>
      )}

      {error && reviews.length === 0 && (
        <button
          type="button"
          onClick={() => loadPage()}
          className="rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700"
        >
          Retry
        </button>
      )}
    </div>
  );
}
