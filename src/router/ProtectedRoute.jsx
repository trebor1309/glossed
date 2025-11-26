// src/router/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { session, user, loading } = useUser();

  // ⏳ On attend que tout soit prêt
  if (loading) return null;

  // ❌ Pas de session → accès refusé
  if (!session) return <Navigate to="/" replace />;

  // 🕗 Session OK mais user pas encore chargé → on attend
  if (session && !user) return null;

  // 🎉 OK → accès autorisé
  return children;
}
