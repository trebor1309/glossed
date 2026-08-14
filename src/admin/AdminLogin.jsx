import { useState } from "react";
import { KeyRound, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useAdminAuth } from "./AdminAuthContext";

export default function AdminLogin() {
  const {
    session,
    access,
    factors,
    enrollment,
    loading,
    error,
    login,
    beginMfaEnrollment,
    verifyMfa,
  } = useAdminAuth();
  const [formError, setFormError] = useState(null);

  const submitCredentials = async (event) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      await login(form.get("email"), form.get("password"));
    } catch (loginError) {
      setFormError(loginError.message);
    }
  };

  const submitMfa = async (event) => {
    event.preventDefault();
    setFormError(null);
    const form = new FormData(event.currentTarget);
    try {
      await verifyMfa(form.get("code"));
    } catch (mfaError) {
      setFormError(mfaError.message);
    }
  };

  const startEnrollment = async () => {
    setFormError(null);
    try {
      await beginMfaEnrollment();
    } catch (enrollError) {
      setFormError(enrollError.message);
    }
  };

  const needsMfa = session && access?.account_exists && !access.authorized;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-900">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-2xl">
        <div className="mb-7 flex items-center gap-3">
          <span className="rounded-2xl bg-rose-600 p-3 text-white"><ShieldCheck /></span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-600">Glossed</p>
            <h1 className="text-2xl font-bold">Administration</h1>
          </div>
        </div>

        {!session && (
          <form className="space-y-4" onSubmit={submitCredentials}>
            <p className="text-sm text-slate-600">
              Utilisez exclusivement votre compte administratif. Les comptes client et prestataire
              ne donnent aucun accès à cet espace.
            </p>
            <label className="block text-sm font-medium">
              Adresse e-mail administrative
              <input name="email" type="email" required autoComplete="username"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-rose-500" />
            </label>
            <label className="block text-sm font-medium">
              Mot de passe
              <input name="password" type="password" required autoComplete="current-password"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-rose-500" />
            </label>
            <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {loading ? <Loader2 className="animate-spin" size={18} /> : <LockKeyhole size={18} />}
              Continuer
            </button>
          </form>
        )}

        {needsMfa && (
          <div className="space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Une authentification MFA est obligatoire avant d’ouvrir le back-office.
            </div>

            {factors.length === 0 && !enrollment && (
              <button type="button" onClick={startEnrollment} disabled={loading}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white disabled:opacity-50">
                <KeyRound size={18} /> Configurer l’application d’authentification
              </button>
            )}

            {enrollment && (
              <div className="space-y-3 rounded-2xl border border-slate-200 p-4 text-sm">
                <p className="font-semibold">Scannez ce QR code dans votre application MFA.</p>
                <img src={enrollment.qrCode} alt="QR code MFA Glossed Admin" className="mx-auto h-44 w-44" />
                <details className="break-all text-xs text-slate-500">
                  <summary>Afficher la clé manuelle</summary>{enrollment.secret}
                </details>
              </div>
            )}

            {(factors.length > 0 || enrollment) && (
              <form className="space-y-3" onSubmit={submitMfa}>
                <label className="block text-sm font-medium">
                  Code à six chiffres
                  <input name="code" inputMode="numeric" pattern="[0-9]{6}" required autoComplete="one-time-code"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-center text-xl tracking-[0.35em] outline-none focus:border-rose-500" />
                </label>
                <button disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {loading && <Loader2 className="animate-spin" size={18} />} Vérifier
                </button>
              </form>
            )}
          </div>
        )}

        {(formError || error) && (
          <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {formError || error}
          </p>
        )}
      </section>
    </main>
  );
}
