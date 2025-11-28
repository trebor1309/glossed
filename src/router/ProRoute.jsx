// src/router/ProRoute.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProRoute({ children }) {
  const { session, user, isPro, loading } = useUser();

  // ⏳ On attend tant que UserContext n'a pas fini son cycle
  if (loading) return null;

  // ❌ Aucune session → redirect page d'accueil
  if (!session) return <Navigate to="/" replace />;

  // 🕗 Session OK mais user pas encore chargé → attendre
  if (!user) return null;

  // ❌ User chargé mais pas pro → redirect dashboard client
  if (!isPro) return <Navigate to="/dashboard" replace />;

  // 🎉 OK → accès autorisé
  return children;
}
