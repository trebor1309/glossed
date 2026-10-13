import { useCallback, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { getMyLegalRequirements } from "@/lib/legal";

export default function LegalAcceptanceGuard({ children }) {
  const { user } = useUser();
  const location = useLocation();
  const [state, setState] = useState({ loading: true, missing: [], error: null });
  const userKey = user ? `${user.id}:${user.role}` : "";

  const load = useCallback(async () => {
    if (!userKey) return;
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const requirements = await getMyLegalRequirements();
      setState({
        loading: false,
        missing: requirements.filter((item) => item.required && !item.accepted_at),
        error: null,
      });
    } catch (error) {
      setState({
        loading: false,
        missing: [],
        error: error.message || "Unable to check legal terms.",
      });
    }
  }, [userKey]);

  useEffect(() => {
    load();
  }, [load]);

  if (state.loading) {
    return (
      <div
        className="flex min-h-[45vh] items-center justify-center text-sm text-gray-500"
        role="status"
      >
        Checking current terms…
      </div>
    );
  }

  if (state.error) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center bg-gray-50 p-6">
        <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow">
          <h1 className="text-xl font-semibold text-gray-900">Terms check unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">{state.error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-5 rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (state.missing.length > 0) {
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/legal/accept?returnTo=${returnTo}`} replace />;
  }

  return children;
}
