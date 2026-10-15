import { AlertCircle, CheckCircle2, Info } from "lucide-react";

const styles = {
  error: {
    icon: AlertCircle,
    className: "border-red-200 bg-red-50 text-red-800",
  },
  success: {
    icon: CheckCircle2,
    className: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  info: {
    icon: Info,
    className: "border-blue-200 bg-blue-50 text-blue-800",
  },
};

export default function InlineAlert({ message, type = "error", className = "" }) {
  if (!message) return null;
  const presentation = styles[type] || styles.error;
  const Icon = presentation.icon;

  return (
    <div
      role={type === "error" ? "alert" : "status"}
      aria-live={type === "error" ? "assertive" : "polite"}
      className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${presentation.className} ${className}`}
    >
      <Icon aria-hidden="true" className="mt-0.5 shrink-0" size={18} />
      <p>{message}</p>
    </div>
  );
}
