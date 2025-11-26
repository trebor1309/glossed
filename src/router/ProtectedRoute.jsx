// 📄 src/router/ProtectedRoute.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function ProtectedRoute({ children }) {
  const { session, user, loading } = useUser();
  const location = useLocation();

  // ⏳ 1) Pendant chargement → on ne bloque rien
  if (loading) return null;

  // 🛑 2) Si aucune session → retour à la home + on garde in mémoire la destination
  if (!session) {
    return <Navigate to="/" replace />;
  }

  // 🛠️ 3) Tant que le profil n’est pas encore fetch → on ne rend rien
  if (session && !user) {
    return null;
  }

  // 📝 4) Déterminer si le user doit passer par l’onboarding
  const needsOnboarding = !user?.username || !user?.phone_number || !user?.address;

  // 🚦 5) Si onboarding requis → redirection automatique
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // 🎉 6) Sinon → accès normal
  return children;
}
