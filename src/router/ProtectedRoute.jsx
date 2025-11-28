// src/router/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { session, user, loading } = useUser();

  // ⏳ Tant que user pas prêt, on attend
  if (loading) return null;

  // ❌ Si pas de session → redirection
  if (!session) return <Navigate to="/" replace />;

  // 🕗 La session existe, mais le profil pas encore fetch → on attend
  if (session && !user) return null;

  // 🎉 User + session OK
  return children;
}
