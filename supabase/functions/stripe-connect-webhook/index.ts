import { stripe, syncConnectAccount } from "../_shared/connect-v2.ts";

const webhookSecret = Deno.env.get("STRIPE_CONNECT_WEBHOOK_SECRET") ?? "";
const handledTypes = new Set([
  "v2.core.account.created",
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated",
  "v2.core.account[requirements].updated",
  "v2.core.account[future_requirements].updated",
]);

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function eventDate(value: unknown) {
  if (typeof value === "number") return new Date(value * 1000);
  if (typeof value === "string") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);
  const signature = req.headers.get("stripe-signature");
  if (!signature || !webhookSecret) {
    return response({ error: "Connect webhook is not configured" }, 500);
  }

  const rawBody = await req.text();
  let notification;
  try {
    notification = await stripe.parseEventNotificationAsync(
      rawBody,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Invalid Stripe Connect signature", error);
    return response({ error: "Invalid Connect signature" }, 400);
  }

  try {
    if (!handledTypes.has(notification.type)) return response({ skipped: true });
    if (!("fetchRelatedObject" in notification)) {
      return response({ error: "Expected an Accounts v2 thin event" }, 400);
    }

    const account = await notification.fetchRelatedObject();
    const inserted = await syncConnectAccount(account, {
      id: notification.id,
      type: notification.type,
      createdAt: eventDate(notification.created),
      livemode: notification.livemode,
      source: "webhook",
    });

    return response({ ok: true, duplicate: !inserted });
  } catch (error) {
    console.error("Stripe Connect webhook processing failed", error);
    return response({ error: "Connect event processing failed" }, 500);
  }
});
