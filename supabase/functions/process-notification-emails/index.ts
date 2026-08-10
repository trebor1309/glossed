import { errorResponse, HttpError, json } from "../_shared/http.ts";
import { buildNotificationEmail } from "../_shared/notification_email.ts";
import { requireServiceRole } from "../_shared/service_role.ts";
import { admin } from "../_shared/supabase.ts";

type Delivery = {
  delivery_id: string;
  notification_id: string;
  recipient_id: string;
  recipient_email: string;
  event_type: string;
  title: string;
  body: string;
  metadata: Record<string, unknown> | null;
  lock_token: string;
};

const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const emailFrom = Deno.env.get("NOTIFICATION_EMAIL_FROM") ?? "";
const appUrl = Deno.env.get("APP_URL") ?? "https://glossed.vercel.app";

async function sendEmail(delivery: Delivery) {
  const content = buildNotificationEmail(delivery, appUrl);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `notification/${delivery.notification_id}`,
      "User-Agent": "Glossed/1.0",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [delivery.recipient_email],
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: [{ name: "event_type", value: delivery.event_type }],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage = typeof result?.message === "string"
      ? result.message
      : `Email provider returned HTTP ${response.status}`;
    throw new Error(providerMessage);
  }

  if (typeof result?.id !== "string" || !result.id) {
    throw new Error("Email provider response did not contain a message id");
  }
  return result.id;
}

async function completeDelivery(
  delivery: Delivery,
  success: boolean,
  providerMessageId: string | null,
  error: string | null,
) {
  const { error: completeError } = await admin.rpc(
    "complete_notification_email_delivery",
    {
      p_delivery_id: delivery.delivery_id,
      p_lock_token: delivery.lock_token,
      p_success: success,
      p_provider_message_id: providerMessageId,
      p_error: error,
    },
  );
  if (completeError) throw completeError;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json(req, { error: "Method not allowed" }, 405);
  }

  try {
    requireServiceRole(req);
    if (!resendApiKey || !emailFrom) {
      throw new HttpError(503, "Notification email provider is not configured");
    }

    const body = await req.json().catch(() => ({}));
    const requestedLimit = Number(body?.limit ?? 25);
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 50)
      : 25;
    const lockToken = crypto.randomUUID();

    const { data, error } = await admin.rpc(
      "claim_notification_email_deliveries",
      {
        p_lock_token: lockToken,
        p_limit: limit,
      },
    );
    if (error) throw error;

    const deliveries = (data ?? []) as Delivery[];
    let sent = 0;
    let failed = 0;

    for (const delivery of deliveries) {
      try {
        const providerMessageId = await sendEmail(delivery);
        await completeDelivery(delivery, true, providerMessageId, null);
        sent += 1;
      } catch (error) {
        const message = error instanceof Error
          ? error.message
          : "Unknown email delivery error";
        await completeDelivery(delivery, false, null, message);
        failed += 1;
      }
    }

    return json(req, { claimed: deliveries.length, sent, failed });
  } catch (error) {
    return errorResponse(req, error);
  }
});
