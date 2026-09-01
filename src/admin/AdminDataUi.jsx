import { adminLabel, humanizeAdminError } from "./adminPresentation";

export function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatCents(value, currency = "EUR") {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("fr-BE", { style: "currency", currency }).format(value / 100);
}

export function shortId(value) {
  if (!value) return "—";
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}

export function StateBadge({ value, label }) {
  const normalized = String(value || "unknown").toLowerCase();
  const positive = ["active", "accepted", "available", "complete", "completed", "paid", "verified", "success", "succeeded", "resolved"];
  const warning = ["pending", "payment_pending", "creating", "incomplete", "admin_review", "blocked", "warning", "manual_review"];
  const danger = ["failed", "critical", "blocking", "rejected", "sync_failed", "financial_incident"];
  const tone = positive.includes(normalized) ? "border-emerald-200 bg-emerald-50 text-emerald-700" : danger.includes(normalized) ? "border-red-200 bg-red-50 text-red-700" : warning.includes(normalized) ? "border-amber-200 bg-amber-50 text-amber-700" : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}>{label || adminLabel(value)}</span>;
}

export function DefinitionList({ items }) {
  return <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">{items.map(({ label, value, mono = false }) => <div key={label} className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className={`mt-1 break-words text-sm text-slate-900 ${mono ? "font-mono" : ""}`}>{value ?? "—"}</dd></div>)}</dl>;
}

export function AdminPanel({ title, description, children }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5"><h2 className="text-lg font-bold text-slate-950">{title}</h2>{description && <p className="mt-1 text-sm text-slate-500">{description}</p>}</div>{children}</section>;
}

export function LoadingPanel({ label = "Chargement…" }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500">{label}</div>;
}

export function ErrorPanel({ error, retry }) {
  const message = humanizeAdminError(error);
  return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p>{message}</p>{retry && <button type="button" onClick={retry} className="mt-3 rounded-lg bg-red-700 px-3 py-2 font-semibold text-white">Réessayer</button>}</div>;
}
