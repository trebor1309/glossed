import { Navigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProRoute({ children }) {
  const { user, isPro, loading } = useUser();

  // ⏳ On attend que le profil soit chargé
  if (loading) return null;

  // 🕗 Session existe mais user pas encore prêt
  if (!user) return null;

  // ❌ Pas pro → on renvoie vers dashboard client
  if (!isPro) return <Navigate to="/dashboard" replace />;

  // 🎉 OK, accès autorisé
  return children;
}
