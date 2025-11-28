// src/router/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { session, user, loading } = useUser();

  // ⏳ Tant qu’on ne sait pas, on bloque
  if (loading) return null;

  // ❌ Pas de session → redirection
  if (!session) return <Navigate to="/" replace />;

  // 🕗 Session OK mais user pas encore chargé → on attend
  if (!user) return null;

  // 🎉 OK
  return children;
}
