import {
  isDefinitiveRefundFailure,
  refundFailureCode,
} from "./stripe_refund_error.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

Deno.test("definitive Stripe rejections may release a refund reservation", () => {
  assertEquals(
    isDefinitiveRefundFailure({ type: "StripeAuthenticationError" }),
    true,
  );
  assertEquals(
    isDefinitiveRefundFailure({ type: "StripePermissionError" }),
    true,
  );
  assertEquals(
    isDefinitiveRefundFailure({
      type: "StripeInvalidRequestError",
      code: "balance_insufficient",
    }),
    true,
  );
});

Deno.test("ambiguous Stripe failures keep the reservation and idempotency key", () => {
  assertEquals(
    isDefinitiveRefundFailure({ type: "StripeConnectionError" }),
    false,
  );
  assertEquals(isDefinitiveRefundFailure({ type: "StripeAPIError" }), false);
  assertEquals(
    isDefinitiveRefundFailure({ type: "StripeRateLimitError" }),
    false,
  );
  assertEquals(
    isDefinitiveRefundFailure({ type: "StripeIdempotencyError" }),
    false,
  );
  assertEquals(
    isDefinitiveRefundFailure({
      type: "StripeInvalidRequestError",
      code: "charge_already_refunded",
    }),
    false,
  );
});

Deno.test("failure codes are sanitized before database storage", () => {
  assertEquals(
    refundFailureCode({
      type: "StripeInvalidRequestError",
      code: "bad code / unsafe",
    }),
    "bad_code_unsafe",
  );
});
