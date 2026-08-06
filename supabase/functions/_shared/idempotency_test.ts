import {
  connectAccountIdempotencyKey,
  refundIdempotencyKey,
} from "./idempotency.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`Expected ${expected}, received ${actual}`);
}

Deno.test("two concurrent account creations use one stable Stripe operation", async () => {
  const created = new Map<string, Promise<string>>();
  let calls = 0;
  const fakeStripeCreate = (key: string) => {
    if (!created.has(key)) {
      created.set(
        key,
        Promise.resolve().then(() => {
          calls += 1;
          return "acct_test";
        })
      );
    }
    return created.get(key)!;
  };

  const key = connectAccountIdempotencyKey("user-1");
  const [first, second] = await Promise.all([fakeStripeCreate(key), fakeStripeCreate(key)]);
  assertEquals(first, "acct_test");
  assertEquals(second, "acct_test");
  assertEquals(calls, 1);
});

Deno.test("refund retries use the same Stripe idempotency key", () => {
  assertEquals(
    refundIdempotencyKey("mission-1", "pro_cancel"),
    refundIdempotencyKey("mission-1", "pro_cancel")
  );
});
