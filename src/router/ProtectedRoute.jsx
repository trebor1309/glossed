// src/router/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { session, user, loading, profileError, retryProfile, logout } = useUser();

  // ⏳ Tant qu’on ne sait pas, on bloque
  if (loading) return null;

  // ❌ Pas de session → redirection
  if (!session) return <Navigate to="/" replace />;

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-md w-full rounded-2xl bg-white p-6 shadow text-center">
          <h1 className="text-xl font-semibold text-gray-800">Account unavailable</h1>
          <p className="mt-2 text-sm text-gray-600">
            {profileError || "We could not load your profile."}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={retryProfile}
              className="rounded-full bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-gray-300 px-4 py-2 text-sm text-gray-700"
            >
              Sign out
            </button>
          </div>
        </div>
      </main>
    );
  }

  // 🎉 OK
  return children;
}
