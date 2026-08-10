import { buildNotificationEmail } from "./notification_email.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test("notification email escapes user-visible content", () => {
  const email = buildNotificationEmail(
    {
      notification_id: "notification-1",
      recipient_email: "user@example.test",
      event_type: "new_message",
      title: "Hello <script>",
      body: "A & B",
      metadata: { path: "/dashboard/messages/chat-1" },
    },
    "https://glossed.vercel.app/",
  );

  assert(!email.html.includes("<script>"), "Title HTML must be escaped");
  assert(email.html.includes("Hello &lt;script&gt;"), "Escaped title is missing");
  assert(email.html.includes("A &amp; B"), "Body HTML must be escaped");
  assert(
    email.text.includes("https://glossed.vercel.app/dashboard/messages/chat-1"),
    "Expected application link is missing",
  );
});

Deno.test("notification email rejects protocol-relative paths", () => {
  const email = buildNotificationEmail(
    {
      notification_id: "notification-2",
      recipient_email: "user@example.test",
      event_type: "payment_confirmed",
      title: "Payment confirmed",
      body: "Done",
      metadata: { path: "//attacker.example/path" },
    },
    "https://glossed.vercel.app",
  );

  assert(!email.html.includes("attacker.example"), "Untrusted redirect path was accepted");
  assert(email.text.endsWith("https://glossed.vercel.app/"), "Fallback URL is invalid");
});

Deno.test("notification email rejects non-dashboard application paths", () => {
  const email = buildNotificationEmail(
    {
      notification_id: "notification-3",
      recipient_email: "user@example.test",
      event_type: "verification_approved",
      title: "Verification approved",
      body: "Done",
      metadata: { path: "/admin/verifications" },
    },
    "https://glossed.vercel.app",
  );

  assert(email.text.endsWith("https://glossed.vercel.app/"), "Unsafe path did not fall back");
});
