// src/router/OnboardingGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

function isProfileComplete(user) {
  if (!user) return false;

  // On veut au minimum :
  // - un rôle
  // - un username
  if (!user.username) return false;
  if (!user.role || !user.activeRole) return false;

  // Pour les pros : un business_name obligatoire
  if (user.activeRole === "pro" && !user.business_name) return false;

  return true;
}

export default function OnboardingGuard({ children }) {
  const { user, loading } = useUser();
  const location = useLocation();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Ne boucle pas si on est déjà sur la page onboarding
  if (!isProfileComplete(user) && !location.pathname.startsWith("/auth/onboarding")) {
    return <Navigate to="/auth/onboarding" replace />;
  }

  return children;
}
