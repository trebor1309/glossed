import { supabase } from "@/lib/supabaseClient";

const reported = new Set();
let globalMonitoringInstalled = false;

function currentPath() {
  if (typeof window === "undefined") return "/";
  const path = window.location.pathname || "/";
  return path.startsWith("/") && !path.startsWith("//") ? path.slice(0, 200) : "/";
}

function diagnosticContext() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return {};
  return {
    locale: (document.documentElement.lang || navigator.language || "en").slice(0, 16),
    online: navigator.onLine,
    visibility: document.visibilityState,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
  };
}

function wasReported(key) {
  if (reported.has(key)) return true;
  reported.add(key);
  try {
    const storageKey = `glossed:incident:${key}`;
    if (sessionStorage.getItem(storageKey)) return true;
    sessionStorage.setItem(storageKey, "1");
  } catch {
    // In-memory deduplication remains available when browser storage is blocked.
  }
  return false;
}

export function reportOperationalEvent({
  eventType,
  eventCode,
  severity = "error",
  deduplicationKey,
}) {
  if (typeof window === "undefined") return;
  const path = currentPath();
  const key = deduplicationKey || `${eventType}:${eventCode}:${path}`;
  if (wasReported(key)) return;

  const payload = {
    eventId: crypto.randomUUID(),
    eventType,
    eventCode,
    severity,
    sourcePath: path,
    appRelease: import.meta.env.VITE_APP_RELEASE?.trim() || null,
    context: diagnosticContext(),
  };

  void supabase.functions.invoke("report-client-incident", { body: payload }).catch(() => {
    // Monitoring is best-effort and must never break the user journey or show
    // another error while the application is already degraded.
  });
}

export function installGlobalOperationalMonitoring() {
  if (globalMonitoringInstalled || typeof window === "undefined") return;
  globalMonitoringInstalled = true;

  window.addEventListener("error", (event) => {
    const isResourceFailure = event.target && event.target !== window && !event.error;
    reportOperationalEvent({
      eventType: "runtime_error",
      eventCode: isResourceFailure ? "resource_load_failure" : "javascript_runtime_error",
      severity: "error",
    });
  });

  window.addEventListener("unhandledrejection", () => {
    reportOperationalEvent({
      eventType: "unhandled_rejection",
      eventCode: "javascript_unhandled_rejection",
      severity: "error",
    });
  });
}
