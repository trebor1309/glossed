import { buildContactEmail } from "./contact_email.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("contact email escapes user content and strips subject line breaks", () => {
  const email = buildContactEmail({
    requestId: "a1000000-0000-0000-0000-000000000001",
    category: "safety",
    name: 'Jane <script>alert("x")</script>',
    email: "jane@example.test",
    subject: "Unsafe\r\nBcc: attacker@example.test",
    message: "A & B\n<script>alert('x')</script>",
    locale: "en",
    sourcePath: "/contact",
    createdAt: "2026-10-13T00:00:00.000Z",
    userId: null,
  });

  assert(!email.html.includes("<script>"), "HTML contains unescaped user markup");
  assert(email.html.includes("&lt;script&gt;"), "Escaped message markup is missing");
  assert(!email.subject.includes("\n"), "Subject contains a line break");
  assert(email.subject.includes("Unsafe Bcc:"), "Subject was not normalized");
  assert(email.reference === "A1000000", "Reference was not derived from the request id");
});

Deno.test("contact email maps known categories", () => {
  const email = buildContactEmail({
    requestId: "b2000000-0000-0000-0000-000000000001",
    category: "professional",
    name: "Professional User",
    email: "pro@example.test",
    subject: null,
    message: "I need help completing my professional onboarding.",
    locale: "fr-BE",
    sourcePath: "/contact?topic=professional",
    createdAt: "2026-10-13T00:00:00.000Z",
    userId: "b2000000-0000-0000-0000-000000000002",
  });

  assert(email.subject.includes("Glossed Professional"), "Category label is missing");
  assert(email.text.includes("fr-BE"), "Locale metadata is missing");
  assert(email.text.includes("b2000000-0000-0000-0000-000000000002"), "User id is missing");
});
