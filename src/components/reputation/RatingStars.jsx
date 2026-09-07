import { Star } from "lucide-react";

export default function RatingStars({ value, size = 16, className = "" }) {
  const rating = Math.max(0, Math.min(5, Number(value) || 0));
  const roundedRating = Math.round(rating);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-amber-400 ${className}`}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          aria-hidden="true"
          className={star <= roundedRating ? "fill-current" : "text-gray-300"}
        />
      ))}
    </span>
  );
}
