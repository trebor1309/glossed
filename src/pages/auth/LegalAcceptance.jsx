import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useUser } from "@/context/UserContext";
import { getMyLegalRequirements, recordMyLegalAcceptances } from "@/lib/legal";

function safeReturnPath(value, role) {
  if (value?.startsWith("/") && !value.startsWith("//") && value !== "/legal/accept") return value;
  return role === "pro" ? "/prodashboard" : "/dashboard";
}

export default function LegalAcceptance() {
  const { user, logout } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [requirements, setRequirements] = useState([]);
  const [checked, setChecked] = useState({});
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  const pending = useMemo(
    () => requirements.filter((item) => item.required && !item.accepted_at),
    [requirements]
  );
  const allChecked = pending.length > 0 && pending.every((item) => checked[item.document_code]);

  const load = async () => {
    setStatus("loading");
    setError("");
    try {
      const next = await getMyLegalRequirements();
      setRequirements(next);
      setChecked({});
      setStatus("ready");
    } catch (loadError) {
      setError(loadError.message || "Unable to load the current legal documents.");
      setStatus("error");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const continueToApp = () => {
    navigate(safeReturnPath(searchParams.get("returnTo"), user?.role), { replace: true });
  };

  const accept = async () => {
    if (!allChecked) return;
    setStatus("saving");
    setError("");
    try {
      await recordMyLegalAcceptances({
        documents: pending.map((item) => ({ code: item.document_code, version: item.version })),
        context: user?.onboardingCompleted ? "reauthorization" : "onboarding",
      });
      continueToApp();
    } catch (acceptanceError) {
      setError(acceptanceError.message || "Unable to record your acceptance.");
      setStatus("ready");
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 px-5 py-12">
      <div className="mx-auto max-w-2xl rounded-3xl border border-gray-100 bg-white p-6 shadow-xl sm:p-10">
        <ShieldCheck className="text-rose-600" size={36} aria-hidden="true" />
        <h1 className="mt-4 text-3xl font-bold text-gray-950">Review the current legal terms</h1>
        <p className="mt-3 leading-7 text-gray-600">
          Glossed keeps the exact document version and server timestamp associated with your
          account. Privacy acknowledgement confirms that you received the notice; it is not blanket
          consent.
        </p>

        {status === "loading" && <p className="mt-8 text-gray-500">Loading documents…</p>}

        {status !== "loading" && pending.length === 0 && !error && (
          <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="font-medium text-emerald-900">Your legal documents are up to date.</p>
            <button
              type="button"
              onClick={continueToApp}
              className="mt-4 rounded-full bg-emerald-700 px-5 py-2.5 font-semibold text-white"
            >
              Continue
            </button>
          </div>
        )}

        {pending.length > 0 && (
          <div className="mt-8 space-y-4">
            {pending.map((item) => (
              <label
                key={item.document_code}
                className="flex cursor-pointer gap-3 rounded-2xl border border-gray-200 p-4 hover:border-rose-300"
              >
                <input
                  type="checkbox"
                  checked={Boolean(checked[item.document_code])}
                  onChange={(event) =>
                    setChecked((current) => ({
                      ...current,
                      [item.document_code]: event.target.checked,
                    }))
                  }
                  className="mt-1 h-4 w-4 accent-rose-600"
                />
                <span>
                  <span className="block font-semibold text-gray-900">
                    {item.acceptance_kind === "notice_acknowledgement"
                      ? `I acknowledge the ${item.title}`
                      : `I accept the ${item.title}`}
                  </span>
                  <span className="mt-1 block text-sm text-gray-600">
                    Version {item.version}.{" "}
                    <Link
                      to={item.route}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-rose-700 underline"
                    >
                      Read the document
                    </Link>
                  </span>
                </span>
              </label>
            ))}

            <button
              type="button"
              disabled={!allChecked || status === "saving"}
              onClick={accept}
              className="w-full rounded-xl bg-gradient-to-r from-rose-600 to-red-600 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {status === "saving" ? "Recording…" : "Accept and continue"}
            </button>
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p>{error}</p>
            {status === "error" && (
              <button type="button" onClick={load} className="mt-3 font-semibold underline">
                Retry
              </button>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="mt-8 text-sm font-medium text-gray-500 underline"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
