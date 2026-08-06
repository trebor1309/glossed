export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function allowedOrigins() {
  const configured = Deno.env.get("ALLOWED_ORIGINS") ?? Deno.env.get("APP_URL") ?? "";
  return new Set([
    ...configured
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    "https://glossed.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
}

export function corsHeaders(req: Request) {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };

  if (origin && allowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export function handleOptions(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function errorResponse(req: Request, error: unknown) {
  const status = error instanceof HttpError ? error.status : 500;
  const message = error instanceof HttpError ? error.message : "Internal server error";

  if (!(error instanceof HttpError)) console.error(error);
  return json(req, { error: message }, status);
}
