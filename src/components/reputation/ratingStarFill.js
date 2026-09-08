export function normalizeRating(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

export function ratingFillPercentage(value, starPosition) {
  const rating = normalizeRating(value);
  const fractionalFill = Math.max(0, Math.min(1, rating - (starPosition - 1)));
  return Math.round(fractionalFill * 1000) / 10;
}
