import { hasServiceRoleClaim, requireServiceRole } from "./service_role.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function unsignedToken(payload: Record<string, unknown>) {
  const encode = (value: Record<string, unknown>) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_")
      .replaceAll("=", "");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${
    encode(payload)
  }.test-signature`;
}

Deno.test("service role authorization accepts the service_role claim", () => {
  const token = unsignedToken({ role: "service_role" });
  assert(hasServiceRoleClaim(token), "service_role claim should be accepted");

  requireServiceRole(
    new Request("https://example.test", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
});

Deno.test("service role authorization rejects an authenticated user", () => {
  const token = unsignedToken({ role: "authenticated", sub: "user-id" });
  assert(!hasServiceRoleClaim(token), "authenticated claim should be rejected");

  let rejected = false;
  try {
    requireServiceRole(
      new Request("https://example.test", {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
  } catch {
    rejected = true;
  }
  assert(rejected, "authenticated user token should be rejected");
});

Deno.test("service role authorization rejects malformed or missing JWTs", () => {
  for (const token of ["", "not-a-jwt", "a.%%%25.c", unsignedToken({})]) {
    assert(!hasServiceRoleClaim(token), `token should be rejected: ${token}`);
  }
});
