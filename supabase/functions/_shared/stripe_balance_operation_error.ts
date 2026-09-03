type StripeLikeError = {
  code?: unknown;
  type?: unknown;
};

export function isRetryableStripeBalanceOperationFailure(error: unknown) {
  if (!error || typeof error !== "object") return true;

  const stripeError = error as StripeLikeError;
  if (stripeError.code === "balance_insufficient") return true;

  return ![
    "StripeInvalidRequestError",
    "StripeAuthenticationError",
    "StripePermissionError",
  ].includes(String(stripeError.type ?? ""));
}
