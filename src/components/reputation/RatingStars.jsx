import { Star } from "lucide-react";
import { normalizeRating, ratingFillPercentage } from "./ratingStarFill";

export default function RatingStars({ value, size = 16, className = "" }) {
  const rating = normalizeRating(value);

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-amber-400 ${className}`}
      role="img"
      aria-label={`${rating.toFixed(1)} out of 5 stars`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fillPercentage = ratingFillPercentage(rating, star);
        return (
          <span
            key={star}
            aria-hidden="true"
            className="relative inline-block shrink-0"
            style={{ width: size, height: size }}
          >
            <Star size={size} className="absolute inset-0 fill-gray-100 text-gray-300" />
            <span
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${fillPercentage}%` }}
              data-rating-fill={fillPercentage}
            >
              <Star size={size} className="max-w-none fill-current text-amber-400" />
            </span>
          </span>
        );
      })}
    </span>
  );
}
