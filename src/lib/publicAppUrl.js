function normalizedConfiguredOrigin() {
  const configured = String(import.meta.env.VITE_PUBLIC_APP_URL || "").trim();
  if (!configured) return null;

  try {
    return new URL(configured).origin;
  } catch {
    console.error("[Glossed] VITE_PUBLIC_APP_URL is not a valid absolute URL.");
    return null;
  }
}

export function publicAppUrl(path = "/") {
  const origin = normalizedConfiguredOrigin() || window.location.origin;
  return new URL(path, `${origin}/`).toString();
}
