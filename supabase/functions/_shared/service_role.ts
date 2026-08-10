import { HttpError } from "./http.ts";

type JwtClaims = {
  role?: unknown;
};

function decodeJwtClaims(token: string): JwtClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;

  try {
    const base64 = parts[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const claims = JSON.parse(atob(padded));
    return claims && typeof claims === "object" ? claims as JwtClaims : null;
  } catch {
    return null;
  }
}

export function hasServiceRoleClaim(token: string) {
  return decodeJwtClaims(token)?.role === "service_role";
}

export function requireServiceRole(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  // Supabase verifies the JWT signature before invoking functions with
  // verify_jwt=true. This second check restricts this internal worker to the
  // service_role claim and rejects authenticated end-user JWTs.
  if (!token || !hasServiceRoleClaim(token)) {
    throw new HttpError(403, "Service role required");
  }
}
