import { buildContactEmail } from "../_shared/contact_email.ts";
import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin } from "../_shared/supabase.ts";

const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";
const emailFrom =
  Deno.env.get("CONTACT_EMAIL_FROM") ?? Deno.env.get("NOTIFICATION_EMAIL_FROM") ?? "";
const emailTo = Deno.env.get("CONTACT_EMAIL_TO") ?? "";
const fingerprintSecret =
  Deno.env.get("CONTACT_FORM_HASH_SECRET") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const allowedCategories = new Set([
  "general",
  "booking",
  "account",
  "professional",
  "safety",
  "privacy",
  "partnership",
  "press",
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactPayload = {
  requestId?: unknown;
  category?: unknown;
  name?: unknown;
  email?: unknown;
  subject?: unknown;
  message?: unknown;
  locale?: unknown;
  sourcePath?: unknown;
  website?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength + 1) : "";
}

function validatePayload(raw: ContactPayload) {
  const requestId = text(raw.requestId, 36).toLowerCase();
  const category = text(raw.category, 32).toLowerCase();
  const name = text(raw.name, 100);
  const email = text(raw.email, 254).toLowerCase();
  const subject = text(raw.subject, 160);
  const message = text(raw.message, 5000);
  const locale = text(raw.locale, 16) || "en";
  const sourcePath = text(raw.sourcePath, 300) || "/contact";

  if (!uuidPattern.test(requestId)) throw new HttpError(400, "Invalid request identifier");
  if (!allowedCategories.has(category)) throw new HttpError(400, "Invalid contact category");
  if (name.length < 2 || name.length > 100) throw new HttpError(400, "Invalid name");
  if (!emailPattern.test(email) || email.length > 254) {
    throw new HttpError(400, "Invalid email address");
  }
  if (subject && subject.length < 2) throw new HttpError(400, "Invalid subject");
  if (message.length < 20 || message.length > 5000) {
    throw new HttpError(400, "Message must contain between 20 and 5000 characters");
  }
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(locale)) {
    throw new HttpError(400, "Invalid locale");
  }
  if (!sourcePath.startsWith("/") || sourcePath.startsWith("//")) {
    throw new HttpError(400, "Invalid source path");
  }

  return {
    requestId,
    category,
    name,
    email,
    subject: subject || null,
    message,
    locale,
    sourcePath,
  };
}

function requireAllowedOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) throw new HttpError(403, "Request origin is required");

  const configured = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("APP_URL") ?? "";
  const allowed = new Set([
    ...configured
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    "https://glossed.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:4173",
  ]);
  if (!allowed.has(origin)) throw new HttpError(403, "Request origin is not allowed");
}

async function senderFingerprint(req: Request) {
  if (!fingerprintSecret) throw new HttpError(503, "Contact form is not configured");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    req.headers.get("cf-connecting-ip") ?? forwarded ?? req.headers.get("x-real-ip") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const material = `${address}\n${userAgent}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(fingerprintSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(material));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function optionalUserId(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  return error ? null : (data.user?.id ?? null);
}

async function sendContactEmail(
  payload: ReturnType<typeof validatePayload>,
  userId: string | null,
  acceptedAt: string
) {
  if (!resendApiKey || !emailFrom || !emailTo) {
    throw new Error("Contact email provider is not configured");
  }

  const content = buildContactEmail({ ...payload, userId, createdAt: acceptedAt });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `contact/${payload.requestId}`,
      "User-Agent": "Glossed/1.0",
    },
    body: JSON.stringify({
      from: emailFrom,
      to: [emailTo],
      reply_to: payload.email,
      subject: content.subject,
      text: content.text,
      html: content.html,
      tags: [
        { name: "event_type", value: "contact_request" },
        { name: "category", value: payload.category },
      ],
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof result?.message === "string"
        ? result.message
        : `Email provider returned HTTP ${response.status}`;
    throw new Error(message);
  }
  if (typeof result?.id !== "string" || !result.id) {
    throw new Error("Email provider response did not contain a message id");
  }

  return { providerMessageId: result.id, reference: content.reference };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    requireAllowedOrigin(req);
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 16_000) throw new HttpError(413, "Request is too large");

    const raw = (await req.json().catch(() => {
      throw new HttpError(400, "Invalid JSON payload");
    })) as ContactPayload;

    // A filled honeypot is treated as accepted so automated submitters do not
    // learn which field caused the request to be discarded.
    if (text(raw.website, 200)) {
      return json(req, { ok: true, reference: null });
    }

    const payload = validatePayload(raw);
    const [fingerprint, userId] = await Promise.all([senderFingerprint(req), optionalUserId(req)]);
    const { data, error } = await admin.rpc("accept_contact_request", {
      p_id: payload.requestId,
      p_user_id: userId,
      p_category: payload.category,
      p_name: payload.name,
      p_email: payload.email,
      p_subject: payload.subject,
      p_message: payload.message,
      p_locale: payload.locale,
      p_source_path: payload.sourcePath,
      p_sender_fingerprint: fingerprint,
    });

    if (error?.message?.includes("contact_rate_limited")) {
      throw new HttpError(429, "Too many contact requests. Please try again later.");
    }
    if (error) throw error;

    const request = data?.[0];
    const reference = payload.requestId.slice(0, 8).toUpperCase();
    if (request?.delivery_status === "email_sent") {
      return json(req, { ok: true, reference });
    }

    try {
      const acceptedAt =
        typeof request?.accepted_at === "string" ? request.accepted_at : new Date().toISOString();
      const delivery = await sendContactEmail(payload, userId, acceptedAt);
      const { error: completionError } = await admin.rpc("mark_contact_request_delivery", {
        p_id: payload.requestId,
        p_success: true,
        p_provider_message_id: delivery.providerMessageId,
        p_error: null,
      });
      if (completionError) throw completionError;
      return json(req, { ok: true, reference: delivery.reference });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown email delivery error";
      const { error: completionError } = await admin.rpc("mark_contact_request_delivery", {
        p_id: payload.requestId,
        p_success: false,
        p_provider_message_id: null,
        p_error: message,
      });
      if (completionError) console.error(completionError);
      console.error("Contact email delivery failed", error);
      throw new HttpError(
        502,
        `Your message was saved as ${reference}, but delivery could not be confirmed. Please retry.`
      );
    }
  } catch (error) {
    return errorResponse(req, error);
  }
});
