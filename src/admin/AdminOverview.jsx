import { useState } from "react";
import { BadgeCheck, KeyRound, Loader2, ShieldCheck, Users } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";

export default function AdminOverview() {
  const { access, hasPermission, factors, verifyMfa, loading } = useAdminAuth();
  const [message, setMessage] = useState(null);

  const reauthenticate = async (event) => {
    event.preventDefault();
    const code = new FormData(event.currentTarget).get("code");
    try {
      await verifyMfa(code, factors[0]?.id);
      setMessage({ type: "success", text: "Réauthentification financière actualisée." });
      event.currentTarget.reset();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  return (
    <div className="space-y-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-7 text-white shadow-lg">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rose-400">Back-office sécurisé</p>
        <h1 className="mt-2 text-3xl font-bold">Vue d’ensemble</h1>
        <p className="mt-3 max-w-2xl text-sm text-slate-300">Ce socle sépare les opérations administratives des comptes et dashboards Glossed publics.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><ShieldCheck className="text-emerald-600" /><p className="mt-4 text-sm text-slate-500">Session</p><p className="font-semibold">MFA AAL2 vérifié</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Users className="text-blue-600" /><p className="mt-4 text-sm text-slate-500">Rôles actifs</p><p className="font-semibold">{(access.roles || []).join(", ")}</p></article>
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><BadgeCheck className="text-rose-600" /><p className="mt-4 text-sm text-slate-500">Permissions</p><p className="font-semibold">{(access.permissions || []).length} accordées côté serveur</p></article>
      </div>

      {hasPermission("finance.execute") && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3"><KeyRound className="mt-1 text-amber-600" /><div><h2 className="text-lg font-bold">Réauthentification financière</h2><p className="mt-1 text-sm text-slate-600">Les futures opérations financières manuelles exigeront un MFA récent, en plus de la permission. La fenêtre est définie par la politique serveur versionnée.</p></div></div>
          {access.financial_reauthentication_required && (
            <form onSubmit={reauthenticate} className="mt-5 flex max-w-md flex-col gap-3 sm:flex-row">
              <input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code" placeholder="Code MFA" className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2 text-center tracking-[0.3em] outline-none focus:border-rose-500" />
              <button disabled={loading || factors.length === 0} className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50">{loading && <Loader2 size={16} className="animate-spin" />} Réauthentifier</button>
            </form>
          )}
          {!access.financial_reauthentication_required && <p className="mt-4 text-sm font-semibold text-emerald-700">La réauthentification financière est récente.</p>}
          {message && <p className={`mt-3 text-sm ${message.type === "error" ? "text-red-700" : "text-emerald-700"}`}>{message.text}</p>}
        </section>
      )}
    </div>
  );
}
