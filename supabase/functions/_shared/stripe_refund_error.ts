type StripeErrorLike = {
  type?: unknown;
  code?: unknown;
};

const definitiveErrorTypes = new Set([
  "StripeAuthenticationError",
  "StripePermissionError",
  "StripeCardError",
]);

const outcomeAmbiguousCodes = new Set([
  "charge_already_refunded",
  "payment_intent_unexpected_state",
]);

function stripeErrorFields(error: unknown): StripeErrorLike {
  return typeof error === "object" && error !== null
    ? error as StripeErrorLike
    : {};
}

// Only release a reservation when Stripe has definitively rejected the request.
// Transport, server, rate-limit and idempotency errors may hide a successful
// response, so they deliberately remain reserved and reuse the same key.
export function isDefinitiveRefundFailure(error: unknown) {
  const { type, code } = stripeErrorFields(error);
  if (typeof type !== "string") return false;
  if (definitiveErrorTypes.has(type)) return true;
  if (type !== "StripeInvalidRequestError") return false;

  if (typeof code === "string") {
    if (outcomeAmbiguousCodes.has(code) || code.includes("already_refunded")) {
      return false;
    }
  }
  return true;
}

export function refundFailureCode(error: unknown) {
  const { type, code } = stripeErrorFields(error);
  const raw = typeof code === "string" && code
    ? code
    : typeof type === "string"
    ? type
    : "stripe_rejected";
  const normalized = raw.toLowerCase().replace(/[^a-z0-9_.:-]+/g, "_").slice(
    0,
    100,
  );
  return normalized || "stripe_rejected";
}
