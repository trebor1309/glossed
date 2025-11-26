// src/router/OnboardingGuard.jsx
import { Navigate, useLocation } from "react-router-dom";
import { useUser } from "@/context/UserContext";

export default function OnboardingGuard({ children }) {
  const { user, loading } = useUser();
  const location = useLocation();

  if (loading) return null;

  // ⚠ S'il n'y a pas d'utilisateur, on ne gère rien ici
  if (!user) return null;

  const needsOnboarding = user.onboardingCompleted !== true;

  // 🚧 Si onboarding requis → redirige TOUT vers /onboarding (sauf /onboarding)
  if (needsOnboarding && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }

  // 🚫 Si onboarding déjà fini → /onboarding est interdit
  if (!needsOnboarding && location.pathname === "/onboarding") {
    const destination = user.activeRole === "pro" ? "/prodashboard" : "/dashboard";
    return <Navigate to={destination} replace />;
  }

  return children;
}
