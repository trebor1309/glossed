import { isRetryableStripeBalanceOperationFailure } from "./stripe_balance_operation_error.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`Expected ${expected}, received ${actual}`);
  }
}

Deno.test("insufficient Stripe balance remains retryable", () => {
  assertEquals(
    isRetryableStripeBalanceOperationFailure({
      type: "StripeInvalidRequestError",
      code: "balance_insufficient",
    }),
    true,
  );
});

Deno.test("definitive Stripe balance-operation errors require review", () => {
  assertEquals(
    isRetryableStripeBalanceOperationFailure({
      type: "StripeInvalidRequestError",
      code: "destination_not_found",
    }),
    false,
  );
  assertEquals(
    isRetryableStripeBalanceOperationFailure({
      type: "StripeAuthenticationError",
    }),
    false,
  );
  assertEquals(
    isRetryableStripeBalanceOperationFailure({ type: "StripePermissionError" }),
    false,
  );
});

Deno.test("ambiguous Stripe balance-operation errors remain retryable", () => {
  assertEquals(
    isRetryableStripeBalanceOperationFailure({ type: "StripeConnectionError" }),
    true,
  );
  assertEquals(
    isRetryableStripeBalanceOperationFailure({ type: "StripeRateLimitError" }),
    true,
  );
  assertEquals(
    isRetryableStripeBalanceOperationFailure(new Error("network")),
    true,
  );
});
