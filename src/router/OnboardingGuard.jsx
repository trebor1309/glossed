import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function OnboardingGuard({ children }) {
  const { user, loading } = useUser();
  const location = useLocation();

  // On attend que le contexte soit prêt
  if (loading) return null;

  // ❗ Pas connecté → On ne passe pas ici, c'est ProtectedRoute qui gère.
  if (!user) return null;

  // Champs requis pour considérer le profil "complet"
  const missingUsername = !user.username || user.username.trim() === "";
  const missingAddress = !user.address || user.address.trim() === "";
  const missingPhone = !user.phone_number || user.phone_number.trim() === "";

  const needsOnboarding = missingUsername || missingAddress || missingPhone;

  // Si l'utilisateur doit compléter son profil → /onboarding obligatoire
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // Si le profil est complet → il ne peut PAS aller sur /onboarding
  if (!needsOnboarding && location.pathname === "/onboarding") {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
