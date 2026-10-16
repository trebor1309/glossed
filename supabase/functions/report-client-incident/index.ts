import { errorResponse, handleOptions, HttpError, json } from "../_shared/http.ts";
import { admin } from "../_shared/supabase.ts";

const fingerprintSecret =
  Deno.env.get("CLIENT_INCIDENT_HASH_SECRET") ??
  Deno.env.get("CONTACT_FORM_HASH_SECRET") ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";

const eventTypes = new Set([
  "frontend_render_failure",
  "runtime_error",
  "unhandled_rejection",
  "maps_auth_failure",
  "maps_load_failure",
  "maps_widget_failure",
]);
const severities = new Set(["warning", "error"]);
const codePattern = /^[a-z][a-z0-9_]{2,79}$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type IncidentPayload = {
  eventId?: unknown;
  eventType?: unknown;
  severity?: unknown;
  eventCode?: unknown;
  sourcePath?: unknown;
  appRelease?: unknown;
  context?: unknown;
};

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength + 1) : "";
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

function sanitizedContext(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const context: Record<string, string | boolean | number> = {};
  const locale = text(raw.locale, 16);
  const visibility = text(raw.visibility, 16);
  const viewport = text(raw.viewport, 24);

  if (/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/i.test(locale)) context.locale = locale;
  if (["visible", "hidden", "prerender"].includes(visibility)) {
    context.visibility = visibility;
  }
  if (/^\d{2,5}x\d{2,5}$/.test(viewport)) context.viewport = viewport;
  if (typeof raw.online === "boolean") context.online = raw.online;
  return context;
}

function validatePayload(raw: IncidentPayload) {
  const eventId = text(raw.eventId, 36).toLowerCase();
  const eventType = text(raw.eventType, 80).toLowerCase();
  const severity = text(raw.severity, 16).toLowerCase();
  const eventCode = text(raw.eventCode, 80).toLowerCase();
  const sourcePath = text(raw.sourcePath, 200);
  const appRelease = text(raw.appRelease, 100) || null;

  if (!uuidPattern.test(eventId)) throw new HttpError(400, "Invalid event identifier");
  if (!eventTypes.has(eventType)) throw new HttpError(400, "Invalid event type");
  if (!severities.has(severity)) throw new HttpError(400, "Invalid severity");
  if (!codePattern.test(eventCode)) throw new HttpError(400, "Invalid event code");
  if (
    !sourcePath.startsWith("/") ||
    sourcePath.startsWith("//") ||
    sourcePath.includes("?") ||
    sourcePath.includes("#")
  ) {
    throw new HttpError(400, "Invalid source path");
  }
  if (appRelease && !/^[A-Za-z0-9._-]+$/.test(appRelease)) {
    throw new HttpError(400, "Invalid application release");
  }

  return {
    eventId,
    eventType,
    severity,
    eventCode,
    sourcePath,
    appRelease,
    context: sanitizedContext(raw.context),
  };
}

async function senderFingerprint(req: Request) {
  if (!fingerprintSecret) throw new HttpError(503, "Incident reporting is not configured");
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address =
    req.headers.get("cf-connecting-ip") ?? forwarded ?? req.headers.get("x-real-ip") ?? "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(fingerprintSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${address}\n${userAgent}`)
  );
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleOptions(req);
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  try {
    requireAllowedOrigin(req);
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 4_096) throw new HttpError(413, "Request is too large");
    const raw = (await req.json().catch(() => {
      throw new HttpError(400, "Invalid JSON payload");
    })) as IncidentPayload;
    const payload = validatePayload(raw);
    const [fingerprint, userId] = await Promise.all([senderFingerprint(req), optionalUserId(req)]);

    const { error } = await admin.rpc("accept_client_operational_event", {
      p_id: payload.eventId,
      p_user_id: userId,
      p_event_type: payload.eventType,
      p_severity: payload.severity,
      p_event_code: payload.eventCode,
      p_source_path: payload.sourcePath,
      p_app_release: payload.appRelease,
      p_sender_fingerprint: fingerprint,
      p_client_context: payload.context,
    });
    if (error?.message?.includes("operational_event_rate_limited")) {
      // Telemetry must never make the application harder to use. A rate-limited
      // report is intentionally acknowledged and silently discarded.
      return json(req, { ok: true, accepted: false });
    }
    if (error) throw error;
    return json(req, { ok: true, accepted: true }, 202);
  } catch (error) {
    return errorResponse(req, error);
  }
});
